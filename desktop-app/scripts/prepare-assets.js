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
const icon512 = decodePng('app-icon.png.base64');
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), icon192);
fs.writeFileSync(path.join(publicDir, 'icon-192.png'), icon192);
fs.writeFileSync(path.join(publicDir, 'icon-512.png'), icon512);
fs.writeFileSync(path.join(publicDir, 'icon-maskable.png'), icon512);

// Windows selects the closest embedded size for Explorer, shortcuts, Start,
// taskbar and installer views. PNG compression keeps every layer sharp.
const windowsSizes = [16, 24, 32, 48, 64, 128, 256];
const windowsIcons = windowsSizes.map(size => ({
  size,
  png: decodePng(`app-icon-${size}.png.base64`)
}));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // icon
header.writeUInt16LE(windowsIcons.length, 4);
let imageOffset = header.length + windowsIcons.length * 16;
const entries = windowsIcons.map(({ size, png }) => {
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size === 256 ? 0 : size, 0);
  entry.writeUInt8(size === 256 ? 0 : size, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(imageOffset, 12);
  imageOffset += png.length;
  return entry;
});
fs.writeFileSync(path.join(buildDir, 'icon.ico'), Buffer.concat([
  header,
  ...entries,
  ...windowsIcons.map(icon => icon.png)
]));

console.log('Prepared the supplied external application icon for Electron and Windows packaging.');
