/**
 * خادم نظام الموارد البشرية — Node.js بدون أي مكتبات خارجية
 * التشغيل:  node server.js
 * المنفذ:   PORT=8080 node server.js   (الافتراضي 8080)
 * البيانات: مجلد data/  (store.json + kv/ + backups/)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const tls = require('tls');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;
const PUB = path.join(ROOT, 'public');
const DATA = process.env.HR_DATA || path.join(ROOT, 'data');
const KVDIR = path.join(DATA, 'kv');
const BKDIR = path.join(DATA, 'backups');
const OUTBOX = path.join(DATA, 'outbox');
const STORE = path.join(DATA, 'store.json');
const SESSION_HOURS = 12;

[DATA, KVDIR, BKDIR, OUTBOX].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

/* ---------- تخزين على القرص ---------- */
function readStore() {
  try { return JSON.parse(fs.readFileSync(STORE, 'utf8')); }
  catch (e) { return { version: 0, db: null, updatedAt: null }; }
}
function writeAtomic(file, text) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}
function writeStore(store) {
  store.updatedAt = new Date().toISOString();
  writeAtomic(STORE, JSON.stringify(store));
  backup(store);
}
let lastBackup = 0;
function backup(store) {
  const now = Date.now();
  if (now - lastBackup < 6 * 3600 * 1000) return;   // نسخة كل 6 ساعات
  lastBackup = now;
  const d = new Date();
  const name = 'store-' + d.toISOString().slice(0, 13).replace(/[-T:]/g, '') + '.json';
  try {
    writeAtomic(path.join(BKDIR, name), JSON.stringify(store));
    const files = fs.readdirSync(BKDIR).filter(f => f.startsWith('store-')).sort();
    while (files.length > 60) { try { fs.unlinkSync(path.join(BKDIR, files.shift())); } catch (e) {} }
  } catch (e) { console.error('backup failed', e.message); }
}
const safeKey = k => crypto.createHash('sha1').update(String(k)).digest('hex') + '.json';
function kvGet(k) {
  try { return JSON.parse(fs.readFileSync(path.join(KVDIR, safeKey(k)), 'utf8')).value; }
  catch (e) { return null; }
}
function kvSet(k, v) { writeAtomic(path.join(KVDIR, safeKey(k)), JSON.stringify({ key: k, value: v })); }
function kvDel(k) { try { fs.unlinkSync(path.join(KVDIR, safeKey(k))); } catch (e) {} }

/* ---------- إرسال البريد ---------- */
const SMTP = {
  host: process.env.SMTP_HOST || '',
  port: +(process.env.SMTP_PORT || 465),
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
  from: process.env.SMTP_FROM || process.env.SMTP_USER || 'hr@localhost'
};
const b64 = t => Buffer.from(String(t), 'utf8').toString('base64');
const encHeader = t => '=?UTF-8?B?' + b64(t) + '?=';
function buildMessage(to, subject, text) {
  return [
    'From: ' + encHeader('نظام الموارد البشرية') + ' <' + SMTP.from + '>',
    'To: ' + to,
    'Subject: ' + encHeader(subject),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    'Date: ' + new Date().toUTCString(),
    '', b64(text).replace(/(.{76})/g, '$1\r\n')
  ].join('\r\n');
}
function saveOutbox(to, subject, text) {
  const name = Date.now() + '-' + crypto.randomBytes(3).toString('hex') + '.eml';
  writeAtomic(path.join(OUTBOX, name), buildMessage(to, subject, text));
  return name;
}
function smtpSend(to, subject, text) {
  return new Promise((resolve, reject) => {
    if (!SMTP.host || !SMTP.user) return reject(new Error('SMTP غير مهيأ'));
    const sock = tls.connect({ host: SMTP.host, port: SMTP.port, servername: SMTP.host });
    const steps = [
      'EHLO hr-system', 'AUTH LOGIN', b64(SMTP.user), b64(SMTP.pass),
      'MAIL FROM:<' + SMTP.from + '>', 'RCPT TO:<' + to + '>', 'DATA',
      buildMessage(to, subject, text) + '\r\n.', 'QUIT'
    ];
    let i = -1, buf = '', done = false;
    const fail = e => { if (!done) { done = true; try { sock.destroy(); } catch (x) {} reject(e); } };
    sock.setTimeout(20000, () => fail(new Error('انتهت مهلة الاتصال بخادم البريد')));
    sock.on('error', fail);
    sock.on('data', d => {
      buf += d.toString('utf8');
      if (!/\r\n$/.test(buf)) return;
      const code = parseInt(buf.slice(0, 3), 10);
      if (code >= 400) return fail(new Error('رفض خادم البريد: ' + buf.trim()));
      buf = '';
      i++;
      if (i >= steps.length) { done = true; sock.end(); return resolve(true); }
      sock.write(steps[i] + '\r\n');
      if (steps[i] === 'QUIT') { done = true; sock.end(); resolve(true); }
    });
  });
}

/* ---------- الجلسات ---------- */
const sessions = new Map();               // token -> {id, role, name, exp}
const attempts = new Map();               // ip -> {n, t}
function newToken(u) {
  const t = crypto.randomBytes(24).toString('hex');
  sessions.set(t, { id: u.id, role: u.role, name: u.name, exp: Date.now() + SESSION_HOURS * 3600 * 1000 });
  return t;
}
function auth(req) {
  const t = req.headers['x-auth'];
  if (!t) return null;
  const s = sessions.get(t);
  if (!s) return null;
  if (s.exp < Date.now()) { sessions.delete(t); return null; }
  return s;
}
setInterval(() => { const n = Date.now(); for (const [t, s] of sessions) if (s.exp < n) sessions.delete(t); }, 600000);

/* ---------- استعادة كلمة المرور ---------- */
const resetCodes = new Map();   // empId -> {code, exp, tries}
const maskMail = m => { if (!m) return ''; const i = m.indexOf('@'); if (i < 1) return '***'; return m.slice(0, 2) + '***' + m.slice(i - 1); };
const maskPhone = p => { if (!p) return ''; return p.slice(0, 3) + '****' + p.slice(-2); };
const AR_DIG = { '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9',
  '۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9' };
const normNum = v => String(v == null ? '' : v).replace(/[٠-٩۰-۹]/g, d => AR_DIG[d]).replace(/[\u200f\u200e\s\-]/g, '').trim();
function findUser(store, key) {
  const k = normNum(key);
  if (!k || !store.db || !store.db.employees) return null;
  return store.db.employees.find(e => normNum(e.id) === k || normNum(e.iqama) === k || normNum(e.mobile) === k) || null;
}

/* ---------- أدوات HTTP ---------- */
function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}
function readBody(req, limit = 60 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('too large')); req.destroy(); } chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
function serveStatic(req, res) {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/' || p === '') p = '/index.html';
  const file = path.join(PUB, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(PUB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('غير موجود');
  }
  const ext = path.extname(file);
  const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
  if (ext === '.html' || file.endsWith('sw.js')) headers['Cache-Control'] = 'no-cache';
  else if (ext === '.png') headers['Cache-Control'] = 'public, max-age=604800';
  if (file.endsWith('sw.js')) headers['Service-Worker-Allowed'] = '/';
  res.writeHead(200, headers);
  fs.createReadStream(file).pipe(res);
}

/* ---------- الخادم ---------- */
const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  if (!url.startsWith('/api/')) return serveStatic(req, res);

  const store = readStore();
  const initialized = !!(store.db && store.db.employees && store.db.employees.length);
  const ip = req.socket.remoteAddress || '-';

  try {
    /* فحص الاتصال */
    if (url === '/api/ping') return send(res, 200, { ok: true, initialized, version: store.version, updatedAt: store.updatedAt });

    /* تسجيل الدخول */
    if (url === '/api/login' && req.method === 'POST') {
      const a = attempts.get(ip) || { n: 0, t: Date.now() };
      if (Date.now() - a.t > 900000) { a.n = 0; a.t = Date.now(); }
      if (a.n >= 15) return send(res, 429, { error: 'محاولات كثيرة، انتظر 15 دقيقة' });
      const { id, pass } = await readBody(req);
      const u = initialized ? findUser(store, id) : null;
      if (!u || u.pass !== pass || u.active === false) {
        a.n++; attempts.set(ip, a);
        return send(res, 401, { error: 'بيانات الدخول غير صحيحة' });
      }
      attempts.delete(ip);
      return send(res, 200, { token: newToken(u), id: u.id, role: u.role, name: u.name });
    }

    if (url === '/api/logout' && req.method === 'POST') {
      const t = req.headers['x-auth']; if (t) sessions.delete(t);
      return send(res, 200, { ok: true });
    }

    /* قراءة قاعدة البيانات */
    if (url === '/api/db' && req.method === 'GET') {
      if (initialized && !auth(req)) return send(res, 401, { error: 'غير مصرح' });
      return send(res, 200, { version: store.version, db: store.db, updatedAt: store.updatedAt });
    }

    /* حفظ قاعدة البيانات (بفحص النسخة لمنع الكتابة فوق تعديل غيرك) */
    if (url === '/api/db' && req.method === 'PUT') {
      if (initialized && !auth(req)) return send(res, 401, { error: 'غير مصرح' });
      const body = await readBody(req);
      if (!body.db) return send(res, 400, { error: 'بيانات ناقصة' });
      if (initialized && typeof body.version === 'number' && body.version !== store.version)
        return send(res, 409, { error: 'النسخة قديمة', version: store.version });
      const next = { version: (store.version || 0) + 1, db: body.db, updatedAt: null };
      writeStore(next);
      return send(res, 200, { ok: true, version: next.version });
    }

    /* مفاتيح مستقلة: الصور والمرفقات والشعار */
    if (url.startsWith('/api/kv/')) {
      if (initialized && !auth(req)) return send(res, 401, { error: 'غير مصرح' });
      const key = decodeURIComponent(url.slice(8));
      if (req.method === 'GET') return send(res, 200, { key, value: kvGet(key) });
      if (req.method === 'PUT') { const b = await readBody(req); kvSet(key, b.value); return send(res, 200, { ok: true }); }
      if (req.method === 'DELETE') { kvDel(key); return send(res, 200, { ok: true }); }
    }

    /* طلب رمز استعادة كلمة المرور */
    if (url === '/api/reset/request' && req.method === 'POST') {
      const { id, method } = await readBody(req);
      const store2 = readStore();
      const u = findUser(store2, id);
      if (!u || u.active === false) return send(res, 404, { error: 'لا يوجد حساب بهذا الرقم' });
      const info = { ok: true, email: maskMail(u.email), mobile: maskPhone(u.mobile), hasEmail: !!u.email, hasMobile: !!u.mobile };
      if (method !== 'email') return send(res, 200, Object.assign(info, { sent: false }));
      if (!u.email) return send(res, 200, Object.assign(info, { sent: false, reason: 'لا يوجد بريد مسجل' }));
      const code = String(Math.floor(100000 + Math.random() * 900000));
      resetCodes.set(String(u.id), { code, exp: Date.now() + 15 * 60 * 1000, tries: 0 });
      const text = 'رمز استعادة كلمة المرور الخاص بك هو: ' + code +
        '\n\nالرمز صالح لمدة 15 دقيقة. إذا لم تطلب ذلك تجاهل هذه الرسالة وأبلغ إدارة الموارد البشرية.';
      try { await smtpSend(u.email, 'رمز استعادة كلمة المرور', text); return send(res, 200, Object.assign(info, { sent: true })); }
      catch (e) { saveOutbox(u.email, 'رمز استعادة كلمة المرور', text); return send(res, 200, Object.assign(info, { sent: false, queued: true, reason: e.message })); }
    }

    /* التحقق من الرمز وتعيين كلمة مرور جديدة */
    if (url === '/api/reset/verify' && req.method === 'POST') {
      const { id, code, pass } = await readBody(req);
      const store3 = readStore();
      const u = findUser(store3, id);
      if (!u) return send(res, 404, { error: 'حساب غير موجود' });
      const rec = resetCodes.get(String(u.id));
      if (!rec || rec.exp < Date.now()) return send(res, 400, { error: 'انتهت صلاحية الرمز، اطلب رمزاً جديداً' });
      rec.tries++;
      if (rec.tries > 5) { resetCodes.delete(String(u.id)); return send(res, 429, { error: 'محاولات كثيرة، اطلب رمزاً جديداً' }); }
      if (String(code).trim() !== rec.code) return send(res, 400, { error: 'الرمز غير صحيح' });
      if (!pass || String(pass).length < 6) return send(res, 400, { error: 'كلمة المرور يجب ألا تقل عن 6 خانات' });
      resetCodes.delete(String(u.id));
      const emp = store3.db.employees.find(e => String(e.id) === String(u.id));
      emp.pass = pass; emp.mustChangePass = false; emp.passChangedAt = new Date().toISOString();
      writeStore({ version: (store3.version || 0) + 1, db: store3.db, updatedAt: null });
      return send(res, 200, { ok: true });
    }

    /* إرسال بريد */
    if (url === '/api/mail' && req.method === 'POST') {
      const s = auth(req);
      if (!s || (s.role !== 'hr' && s.role !== 'hr_staff')) return send(res, 403, { error: 'غير مصرح' });
      const { to, subject, text } = await readBody(req);
      if (!to || !subject) return send(res, 400, { error: 'بيانات ناقصة' });
      try {
        await smtpSend(to, subject, text || '');
        return send(res, 200, { ok: true, sent: true });
      } catch (e) {
        const f = saveOutbox(to, subject, text || '');
        return send(res, 200, { ok: true, sent: false, queued: true, file: f, reason: e.message });
      }
    }

    if (url === '/api/outbox' && req.method === 'GET') {
      const s = auth(req);
      if (!s || s.role !== 'hr') return send(res, 403, { error: 'غير مصرح' });
      const files = fs.readdirSync(OUTBOX).sort().slice(-50);
      return send(res, 200, { count: files.length, files, smtp: !!SMTP.host });
    }

    /* نسخة احتياطية كاملة */
    if (url === '/api/backup' && req.method === 'GET') {
      const s = auth(req);
      if (!s || (s.role !== 'hr' && s.role !== 'gm')) return send(res, 403, { error: 'غير مصرح' });
      return send(res, 200, { exportedAt: new Date().toISOString(), version: store.version, db: store.db });
    }

    return send(res, 404, { error: 'مسار غير معروف' });
  } catch (e) {
    return send(res, 500, { error: 'خطأ في الخادم: ' + e.message });
  }
});

server.listen(PORT, () => {
  console.log('نظام الموارد البشرية يعمل على المنفذ ' + PORT);
  console.log('مجلد البيانات: ' + DATA);
  console.log(SMTP.host ? ('البريد: ' + SMTP.host + ' عبر ' + SMTP.user) : 'البريد: غير مهيأ — ستُحفظ الرسائل في data/outbox');
});
