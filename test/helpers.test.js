const { isPDF } = require('../utils/isPDF.js');
const { formatSize, sizeStatus, TELEGRAM_MAX_FILE } = require('../utils/pdfSize.js');

// --- isPDF tests ---

describe('isPDF()', () => {
  test('returns true for valid PDF buffer', () => {
    const buf = Buffer.alloc(2048);
    buf.write('%PDF-1.7');
    expect(isPDF(buf)).toBe(true);
  });

  test('returns false for HTML buffer', () => {
    const buf = Buffer.alloc(2048);
    buf.write('<!DOCTYPE html>');
    expect(isPDF(buf)).toBe(false);
  });

  test('returns false for too-small buffer', () => {
    const buf = Buffer.from('%PDF-1.7');
    expect(isPDF(buf)).toBe(false);
  });

  test('returns false for null', () => {
    expect(isPDF(null)).toBe(false);
  });

  test('returns false for string', () => {
    expect(isPDF('not a buffer')).toBe(false);
  });

  test('returns false for empty buffer', () => {
    expect(isPDF(Buffer.alloc(0))).toBe(false);
  });
});

// --- formatSize tests ---

describe('formatSize()', () => {
  test('formats bytes', () => {
    expect(formatSize(500)).toBe('500 B');
  });

  test('formats kilobytes', () => {
    expect(formatSize(1536)).toBe('1.5 KB');
  });

  test('formats megabytes', () => {
    expect(formatSize(12400000)).toBe('11.8 MB');
  });

  test('returns "unknown" for null', () => {
    expect(formatSize(null)).toBe('unknown');
  });

  test('returns "unknown" for 0', () => {
    expect(formatSize(0)).toBe('unknown');
  });

  test('returns "unknown" for negative', () => {
    expect(formatSize(-100)).toBe('unknown');
  });
});

// --- sizeStatus tests ---

describe('sizeStatus()', () => {
  test('normal size is not too large', () => {
    const result = sizeStatus(12000000);
    expect(result.tooLarge).toBe(false);
    expect(result.label).toContain('📦 Size:');
  });

  test('size > 50MB is too large', () => {
    const result = sizeStatus(87000000);
    expect(result.tooLarge).toBe(true);
    expect(result.label).toContain('exceeds 50 MB');
  });

  test('exactly 50MB is not too large', () => {
    const result = sizeStatus(TELEGRAM_MAX_FILE);
    expect(result.tooLarge).toBe(false);
  });

  test('50MB + 1 is too large', () => {
    const result = sizeStatus(TELEGRAM_MAX_FILE + 1);
    expect(result.tooLarge).toBe(true);
  });

  test('unknown size is not too large', () => {
    const result = sizeStatus(null);
    expect(result.tooLarge).toBe(false);
    expect(result.label).toContain('unknown');
  });
});
