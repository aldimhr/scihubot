/**
 * Tests for user-facing input types supported by Sci-Hub Bot.
 *
 * Based on /help usage guide:
 *   [DOI-URL]      https://doi.org/10.1177/193229681300700321
 *   [DOI-PATH]     10.1177/193229681300700321
 *   [DOI-PREFIX]   DOI:10.1177/193229681300700321
 *   [PUBLISHER]    https://www.nature.com/articles/laban.665
 *   [KEYWORD]      /kw machine learning
 */

const { isPDF } = require('../utils/isPDF.js');
const { formatSize, sizeStatus, TELEGRAM_MAX_FILE } = require('../utils/pdfSize.js');
const { fetchMeta, formatCard, buildKeyboard } = require('../utils/paperMeta.js');
const { searchPapers, RESULTS_PER_PAGE } = require('../utils/keyword.js');
const { parseMultipleDois, parseDoisFromEntities } = require('../utils/parseDoi.js');

// ====================================================================
// 1. DOI PARSING — regexes used in linkEntity.js and textMessage.js
// ====================================================================

/**
 * Extract DOI from a doi.org URL (mirrors linkEntity.js logic).
 */
function extractDoiFromUrl(text) {
  const doiMatch = text.match(/doi\.org\/(.+)/);
  return doiMatch ? doiMatch[1].replace(/\/+$/, '') : null;
}

/**
 * Parse DOI from raw text (mirrors textMessage.js logic).
 */
function parseDoiFromText(text) {
  if (text.toLowerCase().includes('doi:')) {
    return text.toLowerCase().split('doi:').join('').trim();
  }
  if (text.split(' ').length === 2 && text.split(' ')[0].toLowerCase().includes('doi')) {
    return text.toLowerCase().split('doi').join('').trim();
  }
  if (text.includes('/') && text.includes('.') && text.split(' ').length === 1) {
    if (text[0] === '/') text = text.substring(1);
    return text;
  }
  return null;
}

describe('Input parsing — [DOI-URL]', () => {
  test('extracts DOI from full https://doi.org/ URL', () => {
    expect(extractDoiFromUrl('https://doi.org/10.1177/193229681300700321'))
      .toBe('10.1177/193229681300700321');
  });

  test('extracts DOI from http://doi.org/ URL', () => {
    expect(extractDoiFromUrl('http://doi.org/10.1038/nature12373'))
      .toBe('10.1038/nature12373');
  });

  test('strips trailing slashes', () => {
    expect(extractDoiFromUrl('https://doi.org/10.3389/fsurg.2020.593367///'))
      .toBe('10.3389/fsurg.2020.593367');
  });

  test('extracts DOI with complex path', () => {
    expect(extractDoiFromUrl('https://doi.org/10.1007/978-3-662-43951-4_5'))
      .toBe('10.1007/978-3-662-43951-4_5');
  });

  test('returns null for non-doi.org URL', () => {
    expect(extractDoiFromUrl('https://www.nature.com/articles/laban.665'))
      .toBeNull();
  });
});

describe('Input parsing — [DOI-PATH]', () => {
  test('parses bare DOI with slash', () => {
    expect(parseDoiFromText('10.1177/193229681300700321'))
      .toBe('10.1177/193229681300700321');
  });

  test('parses DOI with leading slash', () => {
    expect(parseDoiFromText('/10.1177/193229681300700321'))
      .toBe('10.1177/193229681300700321');
  });

  test('parses Nature-style DOI', () => {
    expect(parseDoiFromText('10.1038/nature12373'))
      .toBe('10.1038/nature12373');
  });

  test('parses DOI with underscores and hyphens', () => {
    expect(parseDoiFromText('10.1007/978-3-662-43951-4_5'))
      .toBe('10.1007/978-3-662-43951-4_5');
  });

  test('rejects text without dot', () => {
    expect(parseDoiFromText('just some text')).toBeNull();
  });

  test('rejects multi-word text', () => {
    expect(parseDoiFromText('machine learning')).toBeNull();
  });

  test('rejects text shorter than DOI minimum', () => {
    // textMessage.js checks doi.length <= 20 at handler level
    // parseDoiFromText returns it, but handler rejects
    const shortDoi = parseDoiFromText('10.1/x');
    expect(shortDoi).toBe('10.1/x'); // parser returns it
    expect(shortDoi.length).toBeLessThanOrEqual(20); // but handler would reject
  });
});

describe('Input parsing — [DOI-PREFIX]', () => {
  test('parses "DOI:10.1177/193229681300700321"', () => {
    expect(parseDoiFromText('DOI:10.1177/193229681300700321'))
      .toBe('10.1177/193229681300700321');
  });

  test('parses "doi:10.1177/193229681300700321" (lowercase)', () => {
    expect(parseDoiFromText('doi:10.1177/193229681300700321'))
      .toBe('10.1177/193229681300700321');
  });

  test('parses "DOI:10.1038/nature12373"', () => {
    expect(parseDoiFromText('DOI:10.1038/nature12373'))
      .toBe('10.1038/nature12373');
  });

  test('parses "Doi:10.3389/fsurg.2020.593367" (mixed case)', () => {
    expect(parseDoiFromText('Doi:10.3389/fsurg.2020.593367'))
      .toBe('10.3389/fsurg.2020.593367');
  });
});

// ====================================================================
// 2. PUBLISHER URL DETECTION — not a doi.org link
// ====================================================================

describe('Input detection — [PUBLISHER URL]', () => {
  test('nature.com is not a doi.org URL', () => {
    const url = 'https://www.nature.com/articles/laban.665';
    expect(url.includes('doi.org')).toBe(false);
  });

  test('science direct URL is not doi.org', () => {
    const url = 'https://www.sciencedirect.com/science/article/pii/S0140673620301839';
    expect(url.includes('doi.org')).toBe(false);
  });

  test('checkInputText normalizes doi.org without protocol', () => {
    // Mirrors linkEntity.js checkInputText
    function checkInputText(text) {
      if (text.includes('://doi.org/') && text.includes('http')) {
        return text;
      } else if (text.includes('doi.org/') && !text.includes('http')) {
        return `https://${text}`;
      }
      return text;
    }

    expect(checkInputText('doi.org/10.1177/test'))
      .toBe('https://doi.org/10.1177/test');

    expect(checkInputText('https://doi.org/10.1177/test'))
      .toBe('https://doi.org/10.1177/test');

    expect(checkInputText('https://nature.com/articles/123'))
      .toBe('https://nature.com/articles/123');
  });
});

// ====================================================================
// 3. CROSSREF METADATA — fetchMeta + formatCard (real API)
// ====================================================================

describe('CrossRef metadata — fetchMeta()', () => {
  // Increase timeout for real API calls
  jest.setTimeout(15000);

  test('fetches metadata for known DOI (10.1177/193229681300700321)', async () => {
    const { meta, error } = await fetchMeta('10.1177/193229681300700321');
    expect(error).toBeNull();
    expect(meta).not.toBeNull();
    expect(meta.title).toBeTruthy();
    expect(meta.doi).toBe('10.1177/193229681300700321');
    expect(meta.authors.length).toBeGreaterThan(0);
  });

  test('fetches metadata for Nature DOI (10.1038/laban.665)', async () => {
    const { meta, error } = await fetchMeta('10.1038/laban.665');
    expect(error).toBeNull();
    expect(meta).not.toBeNull();
    expect(meta.title).toBeTruthy();
    expect(meta.journal).toBeTruthy();
  });

  test('fetches metadata for Frontiers DOI (10.3389/fsurg.2020.593367)', async () => {
    const { meta, error } = await fetchMeta('10.3389/fsurg.2020.593367');
    expect(error).toBeNull();
    expect(meta).not.toBeNull();
    expect(meta.year).toBeTruthy();
  });

  test('returns error for fake DOI', async () => {
    const { meta, error } = await fetchMeta('10.99999/fake.doi.does.not.exist.xyz');
    expect(meta).toBeNull();
    expect(error).toBeTruthy();
  });
});

describe('CrossRef metadata — formatCard()', () => {
  const sampleMeta = {
    title: 'Sample Paper Title',
    authors: ['Smith J.', 'Doe A.'],
    journal: 'Test Journal',
    year: '2024',
    volume: '12',
    issue: '3',
    pages: '100-110',
    doi: '10.1234/test',
    abstract: 'This is a test abstract with some content.',
    publisher: 'Test Publisher',
    type: 'journal-article',
    url: 'https://doi.org/10.1234/test',
    subject: ['Medicine', 'Science'],
    citations: 42,
    published: '2024-03',
  };

  test('renders title in bold', () => {
    const card = formatCard(sampleMeta);
    expect(card).toContain('*Sample Paper Title*');
  });

  test('renders authors', () => {
    const card = formatCard(sampleMeta);
    // escapeMarkdown escapes dots: "Smith J." → "Smith J\."
    expect(card).toContain('Smith J');
    expect(card).toContain('Doe A');
  });

  test('renders journal + year', () => {
    const card = formatCard(sampleMeta);
    expect(card).toContain('Test Journal');
    expect(card).toContain('2024');
  });

  test('renders citation count', () => {
    const card = formatCard(sampleMeta);
    expect(card).toContain('42');
  });

  test('renders DOI in monospace', () => {
    const card = formatCard(sampleMeta);
    expect(card).toContain('10.1234/test');
  });

  test('renders abstract (truncated)', () => {
    const longAbstract = { ...sampleMeta, abstract: 'word '.repeat(200) };
    const card = formatCard(longAbstract);
    const abstractLine = card.split('\n').find(l => l.startsWith('📝'));
    expect(abstractLine).toBeTruthy();
    // Should contain truncated content + "word"
    expect(abstractLine).toContain('word');
    // 200 * "word " = 1000 chars, truncated to ~300
    expect(abstractLine.length).toBeLessThan(500);
  });

  test('renders size info when provided', () => {
    const sizeInfo = { tooLarge: false, label: '📦 Size: 2.3 MB' };
    const card = formatCard(sampleMeta, sizeInfo);
    expect(card).toContain('📦 Size: 2.3 MB');
  });

  test('renders too-large warning', () => {
    const sizeInfo = { tooLarge: true, label: '📦 Size: 87.0 MB ⚠️ _exceeds 50 MB limit_' };
    const card = formatCard(sampleMeta, sizeInfo);
    expect(card).toContain('exceeds 50 MB');
  });

  test('skips size when not provided', () => {
    const card = formatCard(sampleMeta);
    expect(card).not.toContain('📦');
  });

  test('handles missing fields gracefully', () => {
    const minimal = { ...sampleMeta, authors: [], abstract: '', citations: 0, subject: [] };
    const card = formatCard(minimal);
    expect(card).toContain('Sample Paper Title');
    expect(card).not.toContain('📊');
    expect(card).not.toContain('📝');
  });
});

describe('CrossRef metadata — buildKeyboard()', () => {
  test('builds keyboard with download button', () => {
    const kb = buildKeyboard('10.1234/test', false);
    expect(kb.inline_keyboard[0][0].text).toBe('⬇️ Download PDF');
    expect(kb.inline_keyboard[0][0].callback_data).toBe('dl:10.1234/test');
  });

  test('download button has DOI link', () => {
    const kb = buildKeyboard('10.1234/test', false);
    expect(kb.inline_keyboard[0][1].url).toBe('https://doi.org/10.1234/test');
  });

  test('too large shows warning text', () => {
    const kb = buildKeyboard('10.1234/test', true);
    expect(kb.inline_keyboard[0][0].text).toContain('Too large');
  });

  test('keyboard has channel button', () => {
    const kb = buildKeyboard('10.1234/test', false);
    const lastRow = kb.inline_keyboard[kb.inline_keyboard.length - 1];
    expect(lastRow.some(btn => btn.text.includes('Updates'))).toBe(true);
  });
});

// ====================================================================
// 4. KEYWORD SEARCH — searchPapers() (real API)
// ====================================================================

describe('Keyword search — searchPapers()', () => {
  jest.setTimeout(15000);

  test('returns results for common query', async () => {
    const result = await searchPapers('machine learning');
    expect(result.papers.length).toBeGreaterThan(0);
    expect(result.total).toBeGreaterThan(0);
    expect(['semantic-scholar', 'crossref']).toContain(result.source);
  });

  test('each paper has required fields', async () => {
    const result = await searchPapers('neural networks');
    const paper = result.papers[0];
    expect(paper.doi).toBeTruthy();
    expect(paper.title).toBeTruthy();
    expect(Array.isArray(paper.authors)).toBe(true);
    expect(typeof paper.citations).toBe('number');
  });

  test('respects limit parameter', async () => {
    const result = await searchPapers('deep learning', { limit: 2 });
    expect(result.papers.length).toBeLessThanOrEqual(2);
  });

  test('pagination works with offset', async () => {
    const page1 = await searchPapers('cancer treatment', { limit: 2, offset: 0 });
    const page2 = await searchPapers('cancer treatment', { limit: 2, offset: 2 });
    if (page1.papers.length > 0 && page2.papers.length > 0) {
      expect(page1.papers[0].doi).not.toBe(page2.papers[0].doi);
    }
  });

  test('year filter narrows results', async () => {
    const result = await searchPapers('COVID-19', { yearFrom: 2020, yearTo: 2020 });
    result.papers.forEach(p => {
      if (p.year) expect(p.year).toBe(2020);
    });
  });

  test('exports RESULTS_PER_PAGE constant', () => {
    expect(RESULTS_PER_PAGE).toBe(5);
  });
});

// ====================================================================
// 5. isPDF — PDF validation
// ====================================================================

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

// ====================================================================
// 6. formatSize / sizeStatus — file size utilities
// ====================================================================

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

// ====================================================================
// 7. BATCH DOI PARSING — parseMultipleDois()
// ====================================================================

describe('Batch parsing — parseMultipleDois()', () => {
  test('parses comma-separated DOIs', () => {
    const dois = parseMultipleDois('10.1177/193229681300700321, 10.3389/fsurg.2020.593367');
    expect(dois).toEqual(['10.1177/193229681300700321', '10.3389/fsurg.2020.593367']);
  });

  test('parses newline-separated DOIs', () => {
    const dois = parseMultipleDois('10.1177/193229681300700321\n10.3389/fsurg.2020.593367');
    expect(dois).toEqual(['10.1177/193229681300700321', '10.3389/fsurg.2020.593367']);
  });

  test('parses DOIs with DOI: prefix', () => {
    const dois = parseMultipleDois('DOI:10.1177/193229681300700321, DOI:10.3389/fsurg.2020.593367');
    expect(dois).toEqual(['10.1177/193229681300700321', '10.3389/fsurg.2020.593367']);
  });

  test('parses multiple doi.org URLs', () => {
    const dois = parseMultipleDois(
      'https://doi.org/10.1177/193229681300700321\nhttps://doi.org/10.3389/fsurg.2020.593367'
    );
    expect(dois.length).toBe(2);
    expect(dois[0]).toBe('10.1177/193229681300700321');
    expect(dois[1]).toBe('10.3389/fsurg.2020.593367');
  });

  test('parses mixed URLs and bare DOIs', () => {
    const dois = parseMultipleDois(
      'https://doi.org/10.1038/nature12373, 10.3389/fsurg.2020.593367'
    );
    expect(dois.length).toBe(2);
  });

  test('deduplicates identical DOIs', () => {
    const dois = parseMultipleDois(
      '10.1177/193229681300700321, 10.1177/193229681300700321'
    );
    expect(dois.length).toBe(1);
  });

  test('returns single DOI in array', () => {
    const dois = parseMultipleDois('10.1177/193229681300700321');
    expect(dois).toEqual(['10.1177/193229681300700321']);
  });

  test('returns empty array for no DOIs', () => {
    expect(parseMultipleDois('hello world')).toEqual([]);
    expect(parseMultipleDois('')).toEqual([]);
    expect(parseMultipleDois(null)).toEqual([]);
  });

  test('strips trailing punctuation', () => {
    const dois = parseMultipleDois('10.1177/193229681300700321.')
    expect(dois[0]).toBe('10.1177/193229681300700321');
  });

  test('handles 3+ DOIs', () => {
    const dois = parseMultipleDois(
      '10.1177/193229681300700321, 10.3389/fsurg.2020.593367, 10.1038/nature12373'
    );
    expect(dois.length).toBe(3);
  });

  test('handles semicolon separator', () => {
    const dois = parseMultipleDois(
      '10.1177/193229681300700321; 10.3389/fsurg.2020.593367'
    );
    expect(dois.length).toBe(2);
  });
});

describe('Batch parsing — parseDoisFromEntities()', () => {
  test('extracts DOIs from url entities', () => {
    const text = 'https://doi.org/10.1177/193229681300700321 https://doi.org/10.3389/fsurg.2020.593367';
    const entities = [
      { type: 'url', offset: 0, length: 48 },
      { type: 'url', offset: 49, length: 45 },
    ];
    const dois = parseDoisFromEntities(entities, text);
    expect(dois.length).toBe(2);
  });

  test('extracts DOI from text_link entity', () => {
    const entities = [
      { type: 'text_link', offset: 0, length: 10, url: 'https://doi.org/10.1038/nature12373' },
    ];
    const dois = parseDoisFromEntities(entities, 'click here');
    expect(dois).toEqual(['10.1038/nature12373']);
  });

  test('returns empty for non-doi.org URLs', () => {
    const text = 'https://nature.com/articles/1 https://springer.com/article/2';
    const entities = [
      { type: 'url', offset: 0, length: 30 },
      { type: 'url', offset: 31, length: 33 },
    ];
    const dois = parseDoisFromEntities(entities, text);
    expect(dois).toEqual([]);
  });

  test('returns empty for null input', () => {
    expect(parseDoisFromEntities(null, null)).toEqual([]);
  });
});
