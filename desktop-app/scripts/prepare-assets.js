'use strict';

const fs = require('fs');
const path = require('path');

const desktopRoot = path.join(__dirname, '..');
const assetsDir = path.join(desktopRoot, 'assets');
const publicDir = path.join(desktopRoot, 'src', 'public');
const buildDir = path.join(desktopRoot, 'build');

fs.mkdirSync(publicDir, { recursive: true });
fs.mkdirSync(buildDir, { recursive: true });

function decodePng(name) {
  const source = path.join(assetsDir, name);
  if (!fs.existsSync(source)) throw new Error(`Missing encoded application icon: ${source}`);
  const png = Buffer.from(fs.readFileSync(source, 'utf8').replace(/\s/g, ''), 'base64');
  if (!png.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    throw new Error(`Invalid encoded PNG application icon: ${source}`);
  }
  return png;
}

// The supplied external application logo is stored as text-only Base64 so the
// pull request contains no binary additions. Binary assets exist only at build time.
const icon192 = decodePng('app-icon-192.png.base64');
const icon256 = decodePng('app-icon-256.png.base64');
const icon512 = decodePng('app-icon.png.base64');
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), icon192);
fs.writeFileSync(path.join(publicDir, 'icon-192.png'), icon192);
fs.writeFileSync(path.join(publicDir, 'icon-512.png'), icon512);
fs.writeFileSync(path.join(publicDir, 'icon-maskable.png'), icon512);

// ICO supports PNG-compressed images. The generated file is deliberately not
// committed; electron-builder receives it only during start/build.
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // icon
header.writeUInt16LE(1, 4); // one image
const entry = Buffer.alloc(16);
entry.writeUInt8(0, 0); // 256px (0 is the ICO representation of 256)
entry.writeUInt8(0, 1);
entry.writeUInt8(0, 2);
entry.writeUInt8(0, 3);
entry.writeUInt16LE(1, 4);
entry.writeUInt16LE(32, 6);
entry.writeUInt32LE(icon256.length, 8);
entry.writeUInt32LE(header.length + entry.length, 12);
fs.writeFileSync(path.join(buildDir, 'icon.ico'), Buffer.concat([header, entry, icon256]));

console.log('Prepared the supplied external application icon for Electron and Windows packaging.');
