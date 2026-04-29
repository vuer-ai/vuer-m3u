import { describe, it, expect } from 'vitest';
import {
  parseNpyHeader,
  npyDtypeMap,
  decodeNpyData,
  NpyParseError,
} from '../src/preview/npy-parse';

const MAGIC = [0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59];

/**
 * Build a minimal valid .npy ArrayBuffer wrapping `dataBytes` with the
 * provided header dict text. Pads the header so the data section starts on a
 * 64-byte boundary and ends with a trailing `\n`, matching the numpy spec.
 */
function buildNpy(
  headerDict: string,
  dataBytes: ArrayBuffer,
  version: [number, number] = [1, 0],
): ArrayBuffer {
  const [major, minor] = version;
  const lenSize = major === 1 ? 2 : 4;
  const prefixSize = 6 + 2 + lenSize; // magic + version + headerLen
  // Pad with spaces so (prefixSize + dictLen + 1) is a multiple of 64.
  // The +1 accounts for the trailing newline.
  const baseLen = headerDict.length + 1; // dict + '\n'
  const totalUnpadded = prefixSize + baseLen;
  const padded = Math.ceil(totalUnpadded / 64) * 64;
  const padCount = padded - totalUnpadded;
  const dictText = headerDict + ' '.repeat(padCount) + '\n';
  const headerLen = dictText.length;

  const out = new Uint8Array(prefixSize + headerLen + dataBytes.byteLength);
  for (let i = 0; i < MAGIC.length; i++) out[i] = MAGIC[i];
  out[6] = major;
  out[7] = minor;
  if (lenSize === 2) {
    out[8] = headerLen & 0xff;
    out[9] = (headerLen >> 8) & 0xff;
  } else {
    out[8] = headerLen & 0xff;
    out[9] = (headerLen >> 8) & 0xff;
    out[10] = (headerLen >> 16) & 0xff;
    out[11] = (headerLen >> 24) & 0xff;
  }
  const enc = new TextEncoder().encode(dictText);
  out.set(enc, prefixSize);
  out.set(new Uint8Array(dataBytes), prefixSize + headerLen);
  return out.buffer;
}

describe('parseNpyHeader', () => {
  it('parses a v1.0 header with descr/fortran_order/shape', () => {
    const dict = "{'descr': '<f4', 'fortran_order': False, 'shape': (1024, 6), }";
    const buf = buildNpy(dict, new ArrayBuffer(0));
    const header = parseNpyHeader(buf);
    expect(header.descr).toBe('<f4');
    expect(header.fortranOrder).toBe(false);
    expect(header.shape).toEqual([1024, 6]);
    // dataOffset must be aligned to 64 per the numpy convention.
    expect(header.dataOffset % 64).toBe(0);
  });

  it('parses a v2.0 header (4-byte header_len)', () => {
    const dict = "{'descr': '<f4', 'fortran_order': False, 'shape': (1024, 6), }";
    const buf = buildNpy(dict, new ArrayBuffer(0), [2, 0]);
    const header = parseNpyHeader(buf);
    expect(header.descr).toBe('<f4');
    expect(header.shape).toEqual([1024, 6]);
    expect(header.dataOffset % 64).toBe(0);
  });

  it('throws on bad magic', () => {
    const u8 = new Uint8Array(64);
    // Set everything to zero — wrong magic bytes.
    expect(() => parseNpyHeader(u8.buffer)).toThrow(NpyParseError);
  });
});

describe('npyDtypeMap', () => {
  it('maps <f4 to Float32Array, little-endian, itemSize 4', () => {
    const m = npyDtypeMap('<f4');
    expect(m.itemSize).toBe(4);
    expect(m.typedArrayCtor).toBe(Float32Array);
    expect(m.isLittleEndian).toBe(true);
  });

  it('maps <f8 to Float64Array', () => {
    const m = npyDtypeMap('<f8');
    expect(m.typedArrayCtor).toBe(Float64Array);
  });

  it('maps |u1 to Uint8Array', () => {
    const m = npyDtypeMap('|u1');
    expect(m.typedArrayCtor).toBe(Uint8Array);
  });

  it('maps <i8 to BigInt64Array', () => {
    const m = npyDtypeMap('<i8');
    expect(m.typedArrayCtor).toBe(BigInt64Array);
  });

  it('rejects big-endian (>f4) — itemSize known but ctor null', () => {
    const m = npyDtypeMap('>f4');
    expect(m.typedArrayCtor).toBeNull();
    expect(m.isLittleEndian).toBe(false);
  });

  it('rejects complex (<c8)', () => {
    const m = npyDtypeMap('<c8');
    expect(m.typedArrayCtor).toBeNull();
  });
});

describe('decodeNpyData', () => {
  it('round-trips a small Float32 array', () => {
    const dict = "{'descr': '<f4', 'fortran_order': False, 'shape': (4,), }";
    const data = new Float32Array([1, 2, 3, 4]);
    const buf = buildNpy(dict, data.buffer);
    const header = parseNpyHeader(buf);
    const decoded = decodeNpyData(buf, header, 100);
    expect(decoded.total).toBe(4);
    expect(decoded.truncated).toBe(false);
    expect(decoded.values.length).toBe(4);
    for (let i = 0; i < 4; i++) {
      expect(decoded.values[i] as number).toBeCloseTo(i + 1, 6);
    }
  });

  it('truncates when maxElements < total', () => {
    const dict = "{'descr': '<f4', 'fortran_order': False, 'shape': (10,), }";
    const data = new Float32Array(10);
    for (let i = 0; i < 10; i++) data[i] = i;
    const buf = buildNpy(dict, data.buffer);
    const header = parseNpyHeader(buf);
    const decoded = decodeNpyData(buf, header, 4);
    expect(decoded.values.length).toBe(4);
    expect(decoded.total).toBe(10);
    expect(decoded.truncated).toBe(true);
  });

  it('treats empty shape () as a single scalar element', () => {
    const dict = "{'descr': '<f4', 'fortran_order': False, 'shape': (), }";
    const data = new Float32Array([42]);
    const buf = buildNpy(dict, data.buffer);
    const header = parseNpyHeader(buf);
    expect(header.shape).toEqual([]);
    const decoded = decodeNpyData(buf, header, 100);
    expect(decoded.total).toBe(1);
    expect(decoded.values.length).toBe(1);
    expect(decoded.values[0] as number).toBeCloseTo(42, 6);
  });

  it('throws "unsupported dtype for preview" for unsupported dtypes (e.g. complex)', () => {
    const dict = "{'descr': '<c8', 'fortran_order': False, 'shape': (2,), }";
    const data = new Uint8Array(16); // c8 = 8 bytes per element * 2
    const buf = buildNpy(dict, data.buffer);
    const header = parseNpyHeader(buf);
    expect(() => decodeNpyData(buf, header, 100)).toThrow(
      /unsupported dtype for preview/,
    );
  });
});
