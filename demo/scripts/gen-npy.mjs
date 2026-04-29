#!/usr/bin/env node
/**
 * Emit a small .npy fixture for the FilePreview demo route.
 *
 * Output: demo/mock-data/preview/npy/joints_small.npy
 *   - dtype: float32 little-endian (`<f4`)
 *   - shape: (7,)
 *   - values: [0, -1.57, 0, 1.57, 0, 0, 0]
 *
 * Format reference:
 *   https://numpy.org/doc/stable/reference/generated/numpy.lib.format.html
 *
 * The .npy v1.0 layout we emit:
 *   Magic        : "\x93NUMPY"   (6 bytes)
 *   Version      : 0x01 0x00     (major, minor)
 *   HeaderLen    : uint16 LE     (length of header string)
 *   Header       : ASCII Python dict literal, padded with spaces, trailing '\n'
 *   Data         : raw little-endian float32 values
 *
 * Total prefix (10 + headerLen) MUST be a multiple of 64 for alignment.
 *
 * Run:
 *   node demo/scripts/gen-npy.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, '../mock-data/preview/npy/joints_small.npy');

const values = new Float32Array([0, -1.57, 0, 1.57, 0, 0, 0]);

// Header dict literal (Python repr-style)
const headerDict = `{'descr': '<f4', 'fortran_order': False, 'shape': (${values.length},), }`;

// Pad: total magic+version+headerLen+header must be a multiple of 64,
// header itself must end with '\n'. Magic(6) + version(2) + headerLen(2) = 10.
const PREFIX = 10;
const ALIGN = 64;
const minTotal = PREFIX + headerDict.length + 1; // +1 for newline
const padded = Math.ceil(minTotal / ALIGN) * ALIGN;
const padLen = padded - PREFIX - headerDict.length - 1;
const headerStr = headerDict + ' '.repeat(padLen) + '\n';
const headerLen = headerStr.length;

if ((PREFIX + headerLen) % ALIGN !== 0) {
  throw new Error(`Header alignment is wrong: (${PREFIX} + ${headerLen}) % ${ALIGN} != 0`);
}

const buffer = Buffer.alloc(PREFIX + headerLen + values.byteLength);

// Magic: \x93NUMPY
buffer[0] = 0x93;
buffer.write('NUMPY', 1, 'ascii');

// Version 1.0
buffer[6] = 0x01;
buffer[7] = 0x00;

// Header length (uint16 little-endian)
buffer.writeUInt16LE(headerLen, 8);

// Header string (ASCII)
buffer.write(headerStr, 10, 'ascii');

// Data (little-endian float32). On little-endian hosts (almost all modern
// machines including all darwin/x64/arm64) this is a direct copy.
const dataView = new DataView(buffer.buffer, buffer.byteOffset + PREFIX + headerLen);
for (let i = 0; i < values.length; i++) {
  dataView.setFloat32(i * 4, values[i], /* littleEndian */ true);
}

mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, buffer);

console.log(`wrote ${OUT_PATH} (${buffer.byteLength} bytes)`);
console.log(`  shape: (${values.length},)`);
console.log(`  dtype: <f4 (float32 LE)`);
console.log(`  values: [${Array.from(values).join(', ')}]`);
