import { describe, it, expect } from 'vitest';
import {
  detectKind,
  extractExtension,
  extractFilename,
  kindLabel,
} from '../src/preview/detect';

describe('extractExtension', () => {
  it('lowercases the extension', () => {
    expect(extractExtension('foo.PNG')).toBe('png');
  });

  it('returns empty string when there is no extension', () => {
    expect(extractExtension('no/ext')).toBe('');
  });

  it('returns the last extension for multi-dot names', () => {
    expect(extractExtension('a.b.tar.gz')).toBe('gz');
  });

  it('strips query string and fragment', () => {
    expect(extractExtension('/path/file.ts?query=1#frag')).toBe('ts');
  });

  it('returns empty string for empty input', () => {
    expect(extractExtension('')).toBe('');
  });

  it('treats a leading dot (hidden file) as having no extension', () => {
    expect(extractExtension('.hidden')).toBe('');
  });
});

describe('extractFilename', () => {
  it('extracts filename from a URL path', () => {
    expect(extractFilename('https://x.com/path/file.png')).toBe('file.png');
  });

  it('returns the override when provided', () => {
    expect(extractFilename('https://x.com/path/file.png', 'custom.txt')).toBe(
      'custom.txt',
    );
  });

  it('decodes percent-encoded characters', () => {
    expect(extractFilename('https://x.com/path/my%20file.png')).toBe(
      'my file.png',
    );
  });
});

describe('detectKind — extension based', () => {
  it.each([
    ['a.jpg', 'image'],
    ['a.JPEG', 'image'],
    ['a.svg', 'image'],
    ['a.mp4', 'video'],
    ['a.mp3', 'audio'],
    ['a.md', 'markdown'],
    ['a.py', 'code'],
    ['a.json', 'json'],
    ['a.csv', 'csv'],
    ['a.tsv', 'tsv'],
    ['a.jsonl', 'jsonl'],
    ['a.ndjson', 'jsonl'],
    ['a.npy', 'npy'],
    ['a.mcap', 'mcap'],
    ['a.unknown', 'unsupported'],
    ['', 'unsupported'],
  ] as const)('detectKind(%s) → %s', (input, expected) => {
    expect(detectKind(input)).toBe(expected);
  });
});

describe('detectKind — Content-Type takes precedence', () => {
  it('uses content-type even when extension is unrelated', () => {
    expect(detectKind('foo.bin', 'image/png')).toBe('image');
  });

  it('detects mcap from application/x-mcap', () => {
    expect(detectKind('foo', 'application/x-mcap')).toBe('mcap');
  });

  it('content-type wins over a known extension', () => {
    expect(detectKind('foo.txt', 'image/jpeg')).toBe('image');
  });

  it('falls back to extension when content-type is missing', () => {
    expect(detectKind('foo.txt', undefined)).toBe('text');
  });

  it('strips parameters from the content-type before matching', () => {
    expect(detectKind('foo', 'image/png; charset=binary')).toBe('image');
  });
});

describe('kindLabel', () => {
  it('returns the extension uppercased when extension is provided', () => {
    expect(kindLabel('image', 'png')).toBe('PNG');
    expect(kindLabel('code', 'ts')).toBe('TS');
  });

  it('returns the human label when extension is missing', () => {
    expect(kindLabel('image')).toBe('Image');
    expect(kindLabel('video')).toBe('Video');
    expect(kindLabel('audio')).toBe('Audio');
    expect(kindLabel('markdown')).toBe('Markdown');
    expect(kindLabel('text')).toBe('Text');
    expect(kindLabel('code')).toBe('Code');
    expect(kindLabel('csv')).toBe('CSV');
    expect(kindLabel('tsv')).toBe('TSV');
    expect(kindLabel('jsonl')).toBe('JSONL');
    expect(kindLabel('json')).toBe('JSON');
    expect(kindLabel('npy')).toBe('NPY');
    expect(kindLabel('mcap')).toBe('MCAP');
    expect(kindLabel('unsupported')).toBe('File');
  });
});
