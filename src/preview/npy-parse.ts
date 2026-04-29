/**
 * Pure-JS parser for NumPy .npy files.
 *
 * We avoid pulling in any numpy / pyodide dependency — the .npy spec is small
 * and stable enough that a hand-written reader is the most predictable choice
 * for a browser preview surface.
 *
 * Spec ref: https://numpy.org/doc/stable/reference/generated/numpy.lib.format.html
 */

const MAGIC = [0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59]; // \x93NUMPY

export type TypedArrayCtor =
  | Float32ArrayConstructor
  | Float64ArrayConstructor
  | Int8ArrayConstructor
  | Uint8ArrayConstructor
  | Int16ArrayConstructor
  | Uint16ArrayConstructor
  | Int32ArrayConstructor
  | Uint32ArrayConstructor
  | BigInt64ArrayConstructor
  | BigUint64ArrayConstructor;

export interface NpyHeader {
  descr: string;
  fortranOrder: boolean;
  shape: number[];
  dataOffset: number;
  itemSize: number;
  typedArrayCtor: TypedArrayCtor | null;
  isLittleEndian: boolean;
}

export class NpyParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NpyParseError';
  }
}

export function npyDtypeMap(descr: string): {
  itemSize: number;
  typedArrayCtor: TypedArrayCtor | null;
  isLittleEndian: boolean;
  humanLabel: string;
} {
  // descr is like '<f4', '|u1', '>i8'. The first char is the byte-order:
  //   '<' little-endian, '>' big-endian, '|' not-applicable, '=' native.
  const byteOrder = descr[0];
  const kind = descr.slice(1);
  // '=' resolves to native, which on every browser/runtime we care about is
  // little-endian. Treat '=' as '<' to keep the table small.
  const beStrict = byteOrder === '>';
  const isLittleEndian = !beStrict;

  const baseTable: Record<string, { itemSize: number; ctor: TypedArrayCtor; label: string }> = {
    f4: { itemSize: 4, ctor: Float32Array, label: 'float32' },
    f8: { itemSize: 8, ctor: Float64Array, label: 'float64' },
    u1: { itemSize: 1, ctor: Uint8Array, label: 'uint8' },
    i1: { itemSize: 1, ctor: Int8Array, label: 'int8' },
    u2: { itemSize: 2, ctor: Uint16Array, label: 'uint16' },
    i2: { itemSize: 2, ctor: Int16Array, label: 'int16' },
    u4: { itemSize: 4, ctor: Uint32Array, label: 'uint32' },
    i4: { itemSize: 4, ctor: Int32Array, label: 'int32' },
    u8: { itemSize: 8, ctor: BigUint64Array, label: 'uint64' },
    i8: { itemSize: 8, ctor: BigInt64Array, label: 'int64' },
    b1: { itemSize: 1, ctor: Uint8Array, label: 'bool' },
  };

  if (kind in baseTable) {
    const { itemSize, ctor, label } = baseTable[kind];
    if (beStrict) {
      // Big-endian needs a manual byteswap before view construction; we don't
      // do that yet — surface as no-preview but still give caller the size.
      return { itemSize, typedArrayCtor: null, isLittleEndian: false, humanLabel: `${label} (big-endian)` };
    }
    return { itemSize, typedArrayCtor: ctor, isLittleEndian, humanLabel: label };
  }

  // Complex (c8 = pair of f4, c16 = pair of f8) — no native typed array.
  if (kind === 'c8') return { itemSize: 8, typedArrayCtor: null, isLittleEndian, humanLabel: 'complex64' };
  if (kind === 'c16') return { itemSize: 16, typedArrayCtor: null, isLittleEndian, humanLabel: 'complex128' };

  // Anything else (structured dtype, datetime, object, unicode strings) we
  // intentionally do not preview — too many edge cases for a 4 KB read.
  return { itemSize: 0, typedArrayCtor: null, isLittleEndian, humanLabel: `${descr} (no preview)` };
}

export function parseNpyHeader(buf: ArrayBuffer): NpyHeader {
  const u8 = new Uint8Array(buf);
  if (u8.length < 10) throw new NpyParseError('file too short for npy header');
  for (let i = 0; i < MAGIC.length; i++) {
    if (u8[i] !== MAGIC[i]) throw new NpyParseError('bad magic — not an npy file');
  }
  const major = u8[6];
  const minor = u8[7];

  let headerLen: number;
  let dataOffset: number;
  if (major === 1) {
    headerLen = u8[8] | (u8[9] << 8);
    dataOffset = 10 + headerLen;
  } else if (major === 2 || major === 3) {
    if (u8.length < 12) throw new NpyParseError('file too short for v2 header');
    headerLen = u8[8] | (u8[9] << 8) | (u8[10] << 16) | (u8[11] << 24);
    dataOffset = 12 + headerLen;
  } else {
    throw new NpyParseError(`unsupported npy version ${major}.${minor}`);
  }

  if (u8.length < dataOffset) throw new NpyParseError('header extends past read buffer');
  const headerText = new TextDecoder('utf-8').decode(u8.subarray(dataOffset - headerLen, dataOffset));
  const dict = parseHeaderDict(headerText);

  const descr = String(dict.descr ?? '');
  const fortranOrder = Boolean(dict.fortran_order);
  const shape = Array.isArray(dict.shape) ? (dict.shape as number[]) : [];
  if (!descr) throw new NpyParseError('header missing descr');

  const meta = npyDtypeMap(descr);
  return {
    descr,
    fortranOrder,
    shape,
    dataOffset,
    itemSize: meta.itemSize,
    typedArrayCtor: meta.typedArrayCtor,
    isLittleEndian: meta.isLittleEndian,
  };
}

export function decodeNpyData(
  buf: ArrayBuffer,
  header: NpyHeader,
  maxElements: number,
): { values: number[] | bigint[]; total: number; truncated: boolean } {
  if (header.typedArrayCtor === null) throw new NpyParseError('unsupported dtype for preview');
  // Empty shape () is the numpy convention for a scalar — a single element.
  const total = header.shape.length === 0 ? 1 : header.shape.reduce((a, b) => a * b, 1);
  const take = Math.min(total, maxElements);
  const need = header.dataOffset + take * header.itemSize;
  if (buf.byteLength < need) {
    throw new NpyParseError(`buffer too short: need ${need}, have ${buf.byteLength}`);
  }
  // Construct via subarray on Uint8Array first so we don't require dataOffset
  // to be aligned to itemSize — TypedArray ctor on a sliced buffer is safer.
  const slice = buf.slice(header.dataOffset, header.dataOffset + take * header.itemSize);
  const Ctor = header.typedArrayCtor;
  const arr = new Ctor(slice);
  const values =
    arr instanceof BigInt64Array || arr instanceof BigUint64Array
      ? (Array.from(arr) as bigint[])
      : (Array.from(arr as ArrayLike<number>) as number[]);
  return { values, total, truncated: take < total };
}

// ---- Header dict parser -----------------------------------------------------
//
// The header is a Python repr of a dict literal — small enough that a bespoke
// recursive-descent parser is cleaner than depending on a Python-AST shim.

interface PyState {
  s: string;
  i: number;
}

function parseHeaderDict(text: string): Record<string, unknown> {
  const st: PyState = { s: text, i: 0 };
  skipWs(st);
  const value = parseValue(st);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new NpyParseError('header is not a dict');
  }
  return value as Record<string, unknown>;
}

function skipWs(st: PyState): void {
  while (st.i < st.s.length) {
    const c = st.s[st.i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') st.i++;
    else break;
  }
}

function parseValue(st: PyState): unknown {
  skipWs(st);
  const c = st.s[st.i];
  if (c === '{') return parseDict(st);
  if (c === '(') return parseTuple(st);
  if (c === '[') return parseList(st);
  if (c === "'" || c === '"') return parseString(st);
  if (c === 'T' || c === 'F') return parseBool(st);
  if (c === 'N') return parseNone(st);
  return parseNumber(st);
}

function parseDict(st: PyState): Record<string, unknown> {
  expect(st, '{');
  const out: Record<string, unknown> = {};
  skipWs(st);
  if (st.s[st.i] === '}') { st.i++; return out; }
  while (st.i < st.s.length) {
    skipWs(st);
    const key = parseString(st);
    skipWs(st);
    expect(st, ':');
    const value = parseValue(st);
    out[key] = value;
    skipWs(st);
    if (st.s[st.i] === ',') { st.i++; skipWs(st); if (st.s[st.i] === '}') { st.i++; return out; } continue; }
    if (st.s[st.i] === '}') { st.i++; return out; }
    throw new NpyParseError(`expected , or } at ${st.i}`);
  }
  throw new NpyParseError('unterminated dict');
}

function parseTuple(st: PyState): number[] {
  expect(st, '(');
  const out: number[] = [];
  skipWs(st);
  if (st.s[st.i] === ')') { st.i++; return out; }
  while (st.i < st.s.length) {
    skipWs(st);
    const v = parseValue(st);
    if (typeof v !== 'number') throw new NpyParseError('non-numeric tuple element in shape');
    out.push(v);
    skipWs(st);
    if (st.s[st.i] === ',') { st.i++; skipWs(st); if (st.s[st.i] === ')') { st.i++; return out; } continue; }
    if (st.s[st.i] === ')') { st.i++; return out; }
    throw new NpyParseError(`expected , or ) at ${st.i}`);
  }
  throw new NpyParseError('unterminated tuple');
}

function parseList(st: PyState): unknown[] {
  expect(st, '[');
  const out: unknown[] = [];
  skipWs(st);
  if (st.s[st.i] === ']') { st.i++; return out; }
  while (st.i < st.s.length) {
    out.push(parseValue(st));
    skipWs(st);
    if (st.s[st.i] === ',') { st.i++; skipWs(st); if (st.s[st.i] === ']') { st.i++; return out; } continue; }
    if (st.s[st.i] === ']') { st.i++; return out; }
    throw new NpyParseError(`expected , or ] at ${st.i}`);
  }
  throw new NpyParseError('unterminated list');
}

function parseString(st: PyState): string {
  const q = st.s[st.i];
  if (q !== "'" && q !== '"') throw new NpyParseError(`expected string at ${st.i}`);
  st.i++;
  let out = '';
  while (st.i < st.s.length) {
    const c = st.s[st.i];
    if (c === '\\' && st.i + 1 < st.s.length) {
      out += st.s[st.i + 1];
      st.i += 2;
      continue;
    }
    if (c === q) { st.i++; return out; }
    out += c;
    st.i++;
  }
  throw new NpyParseError('unterminated string');
}

function parseBool(st: PyState): boolean {
  if (st.s.startsWith('True', st.i)) { st.i += 4; return true; }
  if (st.s.startsWith('False', st.i)) { st.i += 5; return false; }
  throw new NpyParseError(`expected True/False at ${st.i}`);
}

function parseNone(st: PyState): null {
  if (st.s.startsWith('None', st.i)) { st.i += 4; return null; }
  throw new NpyParseError(`expected None at ${st.i}`);
}

function parseNumber(st: PyState): number {
  const start = st.i;
  if (st.s[st.i] === '-' || st.s[st.i] === '+') st.i++;
  while (st.i < st.s.length) {
    const c = st.s[st.i];
    if ((c >= '0' && c <= '9') || c === '.' || c === 'e' || c === 'E' || c === '-' || c === '+') st.i++;
    else break;
  }
  const tok = st.s.slice(start, st.i);
  if (tok.length === 0) throw new NpyParseError(`expected number at ${start}`);
  const n = Number(tok);
  if (!Number.isFinite(n)) throw new NpyParseError(`bad number ${tok}`);
  return n;
}

function expect(st: PyState, ch: string): void {
  skipWs(st);
  if (st.s[st.i] !== ch) throw new NpyParseError(`expected '${ch}' at ${st.i}, got '${st.s[st.i] ?? 'EOF'}'`);
  st.i++;
}
