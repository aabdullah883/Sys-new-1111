'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function atomicWrite(file, value) {
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temp, file);
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

class RemoteSync {
  constructor({ dataDir, remoteBase, fetchImpl = globalThis.fetch }) {
    const url = new URL(remoteBase);
    if (url.protocol !== 'https:') throw new Error('Remote HR API must use HTTPS');
    this.base = url.href.replace(/\/+$/, '');
    this.fetch = fetchImpl;
    this.queueFile = path.join(dataDir, 'sync-queue.json');
    this.conflictsFile = path.join(dataDir, 'sync-conflicts.json');
    this.stateFile = path.join(dataDir, 'sync-state.json');
  }

  state() { return readJson(this.stateFile, { remoteVersion: 0, lastSyncAt: null }); }
  queue() { return readJson(this.queueFile, []); }
  conflicts() { return readJson(this.conflictsFile, []); }

  async request(endpoint, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      return await this.fetch(`${this.base}/${endpoint}`, { ...options, signal: controller.signal, cache: 'no-store' });
    } finally { clearTimeout(timeout); }
  }

  headers(remoteToken) {
    const headers = { 'Content-Type': 'application/json' };
    if (remoteToken) headers['x-auth'] = remoteToken;
    return headers;
  }

  async ping() {
    const response = await this.request('ping.php');
    if (!response.ok) throw new Error(`Remote ping failed: ${response.status}`);
    return response.json();
  }

  async login(credentials) {
    const response = await this.request('login.php', { method: 'POST', headers: this.headers(), body: JSON.stringify(credentials) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, status: response.status, result };
    return { ok: true, status: response.status, result };
  }

  async pull(remoteToken) {
    const response = await this.request('db.php', { headers: this.headers(remoteToken) });
    if (!response.ok) throw Object.assign(new Error(`Remote DB read failed: ${response.status}`), { status: response.status });
    const result = await response.json();
    atomicWrite(this.stateFile, { remoteVersion: Number(result.version) || 0, lastSyncAt: new Date().toISOString() });
    return result;
  }

  enqueueDatabase(db) {
    const state = this.state(), queued = this.queue().filter(item => item.type !== 'database');
    queued.push({ id: crypto.randomUUID(), type: 'database', baseVersion: state.remoteVersion, db, createdAt: new Date().toISOString() });
    atomicWrite(this.queueFile, queued);
    return queued.at(-1);
  }

  enqueueKv(key, value, method = 'PUT') {
    const queued = this.queue().filter(item => !(item.type === 'kv' && item.key === key));
    queued.push({ id: crypto.randomUUID(), type: 'kv', key, value, method, createdAt: new Date().toISOString() });
    atomicWrite(this.queueFile, queued);
  }

  recordConflict(item, remote) {
    const conflicts = this.conflicts();
    conflicts.push({ id: item.id, type: item.type, detectedAt: new Date().toISOString(), local: item, remote });
    atomicWrite(this.conflictsFile, conflicts.slice(-200));
  }

  async flush(remoteToken) {
    const queued = this.queue();
    if (!queued.length) return { synced: 0, conflicts: 0 };
    let synced = 0, conflictCount = 0;
    const remaining = [];
    for (const item of queued) {
      try {
        if (item.type === 'database') {
          const response = await this.request('db.php', { method: 'PUT', headers: this.headers(remoteToken), body: JSON.stringify({ version: item.baseVersion, db: item.db, clientMutationId: item.id }) });
          if (response.status === 409) {
            const remote = await response.json().catch(() => ({}));
            this.recordConflict(item, remote); conflictCount++; continue;
          }
          if (!response.ok) throw new Error(`Remote DB write failed: ${response.status}`);
          const result = await response.json();
          atomicWrite(this.stateFile, { remoteVersion: Number(result.version) || item.baseVersion + 1, lastSyncAt: new Date().toISOString() });
        } else {
          const response = await this.request(`kv.php?key=${encodeURIComponent(item.key)}`, { method: item.method, headers: this.headers(remoteToken), body: item.method === 'PUT' ? JSON.stringify({ value: item.value, clientMutationId: item.id }) : undefined });
          if (!response.ok) throw new Error(`Remote attachment write failed: ${response.status}`);
        }
        synced++;
      } catch (error) {
        remaining.push(item, ...queued.slice(queued.indexOf(item) + 1));
        break;
      }
    }
    atomicWrite(this.queueFile, remaining);
    return { synced, conflicts: conflictCount, pending: remaining.length };
  }
}

module.exports = { RemoteSync };
