'use strict';

const fs = require('fs');
const path = require('path');

const desktopRoot = path.join(__dirname, '..');
const repositoryRoot = path.join(desktopRoot, '..');
const publicDir = path.join(desktopRoot, 'src', 'public');
const buildDir = path.join(desktopRoot, 'build');
const imageNames = [
  'apple-touch-icon.png',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable.png'
];

fs.mkdirSync(publicDir, { recursive: true });
fs.mkdirSync(buildDir, { recursive: true });

for (const name of imageNames) {
  const source = path.join(repositoryRoot, name);
  if (!fs.existsSync(source)) {
    throw new Error(`Missing original repository asset: ${source}`);
  }
  fs.copyFileSync(source, path.join(publicDir, name));
}

// ICO supports PNG-compressed images. The generated file is deliberately not
// committed: electron-builder creates/uses it from the original repository logo.
const png = fs.readFileSync(path.join(repositoryRoot, 'icon-512.png'));
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
entry.writeUInt32LE(png.length, 8);
entry.writeUInt32LE(header.length + entry.length, 12);
fs.writeFileSync(path.join(buildDir, 'icon.ico'), Buffer.concat([header, entry, png]));

console.log('Prepared desktop PNG assets and generated build/icon.ico from the original repository logo.');
