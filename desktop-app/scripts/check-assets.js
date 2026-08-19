'use strict';

const fs = require('fs');
const path = require('path');

require('./prepare-assets');

const iconFile = path.join(__dirname, '..', 'build', 'icon.ico');
const icon = fs.readFileSync(iconFile);
const expectedSizes = [16, 24, 32, 48, 64, 128, 256];

if (icon.readUInt16LE(0) !== 0 || icon.readUInt16LE(2) !== 1) {
  throw new Error('Generated file is not a Windows ICO');
}
if (icon.readUInt16LE(4) !== expectedSizes.length) {
  throw new Error('Generated ICO does not contain every required size');
}

const actualSizes = expectedSizes.map((_, index) => {
  const entry = 6 + index * 16;
  const width = icon.readUInt8(entry) || 256;
  const height = icon.readUInt8(entry + 1) || 256;
  const length = icon.readUInt32LE(entry + 8);
  const offset = icon.readUInt32LE(entry + 12);
  const png = icon.subarray(offset, offset + length);
  if (png.readUInt8(25) !== 6) {
    throw new Error(`The ${width}px icon must preserve a transparent background`);
  }
  if (width !== height || png.readUInt32BE(16) !== width || png.readUInt32BE(20) !== height) {
    throw new Error(`Invalid ${width}px image in generated ICO`);
  }
  return width;
});

if (actualSizes.join(',') !== expectedSizes.join(',')) {
  throw new Error(`Unexpected ICO sizes: ${actualSizes.join(',')}`);
}

console.log(`Verified multi-size Windows icon: ${actualSizes.join(', ')}px`);
