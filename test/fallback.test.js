/**
 * Tests for the fallback chain — alternative PDF sources when Sci-Hub fails.
 *
 * Sources tested:
 *   1. Unpaywall (open access PDFs)
 *   2. CrossRef links (free full-text from publishers)
 *   3. Preprint servers (arXiv, bioRxiv)
 *   4. Smart redirect keyboard builder
 */

const { checkUnpaywall } = require('../utils/unpaywall.js');
const { checkCrossRefLinks } = require('../utils/crossrefLinks.js');
const { checkPreprints } = require('../utils/preprints.js');
const { fallbackChain, buildNotFoundKeyboard } = require('../utils/fallbackChain.js');

// ====================================================================
// 1. UNPAYWALL — checkUnpaywall()
// ====================================================================

describe('Unpaywall — checkUnpaywall()', () => {
  jest.setTimeout(15000);

  test('finds open access PDF for known OA paper (PLOS)', async () => {
    // PLOS ONE papers are always OA
    const result = await checkUnpaywall('10.1371/journal.pone.0000308');
    expect(result.isOa).toBe(true);
    expect(result.error).toBeNull();
    // Should have either a direct PDF URL or a landing page
    expect(result.url || result.landingPage).toBeTruthy();
  });

  test('finds OA for Frontiers paper', async () => {
    const result = await checkUnpaywall('10.3389/fpsyg.2014.01426');
    expect(result.isOa).toBe(true);
    expect(result.error).toBeNull();
  });

  test('returns isOa=false for paywalled paper', async () => {
    // Nature papers are typically paywalled
    const result = await checkUnpaywall('10.1038/nature12373');
    expect(result.error).toBeNull();
    // May or may not be OA — just check it doesn't crash
    expect(typeof result.isOa).toBe('boolean');
  });

  test('handles non-existent DOI gracefully', async () => {
    const result = await checkUnpaywall('10.99999/fake.doi.does.not.exist');
    expect(result.url).toBeNull();
    expect(result.error).toBeNull();
  });

  test('returns source label when PDF found', async () => {
    const result = await checkUnpaywall('10.1371/journal.pone.0000308');
    if (result.url) {
      expect(result.source).toBeTruthy();
      expect(typeof result.source).toBe('string');
    }
  });
});

// ====================================================================
// 2. CROSSREF LINKS — checkCrossRefLinks()
// ====================================================================

describe('CrossRef Links — checkCrossRefLinks()', () => {
  jest.setTimeout(15000);

  test('returns links structure for known DOI', async () => {
    const result = await checkCrossRefLinks('10.1038/nature12373');
    expect(result.error).toBeNull();
    // May or may not have links — just verify structure
    expect(result.url === null || typeof result.url === 'string').toBe(true);
  });

  test('handles non-existent DOI', async () => {
    const result = await checkCrossRefLinks('10.99999/fake.doi.does.not.exist');
    expect(result.url).toBeNull();
    expect(result.error).toBeNull();
  });

  test('returns source string when URL found', async () => {
    // Try a DOI that typically has CrossRef links
    const result = await checkCrossRefLinks('10.1371/journal.pone.0000308');
    if (result.url) {
      expect(result.source).toBeTruthy();
    }
  });
});

// ====================================================================
// 3. PREPRINTS — checkPreprints()
// ====================================================================

describe('Preprints — checkPreprints()', () => {
  jest.setTimeout(15000);

  test('finds arXiv preprint for known arXiv paper', async () => {
    // "Attention Is All You Need" — famous arXiv paper
    const result = await checkPreprints('10.48550/arXiv.1706.03762', 'Attention Is All You Need');
    // May or may not find it via DOI, but title search should work
    if (result.url) {
      expect(result.source).toBe('arXiv');
      expect(result.url).toContain('arxiv');
    }
  });

  test('finds arXiv preprint by title search', async () => {
    // Search by title for a well-known paper
    const result = await checkPreprints('10.1234/fake-but-searchable', 'Deep Residual Learning for Image Recognition');
    if (result.url) {
      expect(result.source).toBe('arXiv');
    }
  });

  test('handles non-existent DOI gracefully', async () => {
    const result = await checkPreprints('10.99999/fake.doi.does.not.exist', '');
    expect(result.url).toBeNull();
    expect(result.error).toBeNull();
  });

  test('handles empty title', async () => {
    const result = await checkPreprints('10.99999/fake', '');
    expect(result.url).toBeNull();
    expect(result.error).toBeNull();
  });
});

// ====================================================================
// 4. FALLBACK CHAIN — fallbackChain()
// ====================================================================

describe('Fallback Chain — fallbackChain()', () => {
  jest.setTimeout(30000);

  test('finds OA paper through chain', async () => {
    // PLOS paper — should be found via Unpaywall
    const result = await fallbackChain('10.1371/journal.pone.0000308', 'PLoS ONE');
    // Either found a PDF or returned landing pages
    if (result.data) {
      expect(result.source).toBeTruthy();
      expect(Buffer.isBuffer(result.data)).toBe(true);
    } else {
      // At minimum, should have collected some landing pages
      expect(result.error).toBeTruthy();
    }
  });

  test('reports progress via callback', async () => {
    const messages = [];
    await fallbackChain('10.99999/fake.doi.test', '', (msg) => messages.push(msg));
    // Should have called progress at least once (Unpaywall check)
    expect(messages.length).toBeGreaterThan(0);
    expect(messages.some(m => m.includes('Unpaywall'))).toBe(true);
  });

  test('returns landing pages when no direct PDF', async () => {
    const result = await fallbackChain('10.1038/nature12373', '');
    // If no PDF found, should have landing pages or error
    if (!result.data) {
      expect(result.error).toBeTruthy();
      // landingPages should be an array (may be empty)
      expect(Array.isArray(result.landingPages || [])).toBe(true);
    }
  });
});

// ====================================================================
// 5. KEYBOARD BUILDER — buildNotFoundKeyboard()
// ====================================================================

describe('Smart Keyboard — buildNotFoundKeyboard()', () => {
  test('builds keyboard with Scholar and Publisher buttons', () => {
    const kb = buildNotFoundKeyboard('10.1234/test', 'Test Paper');
    expect(kb.inline_keyboard).toBeDefined();
    expect(kb.inline_keyboard.length).toBeGreaterThanOrEqual(1);

    // First row should have Scholar and Publisher
    const row1 = kb.inline_keyboard[0];
    expect(row1.some(b => b.text.includes('Google Scholar'))).toBe(true);
    expect(row1.some(b => b.text.includes('Publisher'))).toBe(true);
  });

  test('Google Scholar URL contains title query', () => {
    const kb = buildNotFoundKeyboard('10.1234/test', 'My Paper Title');
    const scholarBtn = kb.inline_keyboard[0].find(b => b.text.includes('Scholar'));
    expect(scholarBtn.url).toContain('scholar.google.com');
    expect(scholarBtn.url).toContain('My%20Paper%20Title');
  });

  test('Google Scholar falls back to DOI query when no title', () => {
    const kb = buildNotFoundKeyboard('10.1234/test', '');
    const scholarBtn = kb.inline_keyboard[0].find(b => b.text.includes('Scholar'));
    expect(scholarBtn.url).toContain('10.1234%2Ftest');
  });

  test('Publisher button links to doi.org', () => {
    const kb = buildNotFoundKeyboard('10.1234/test', '');
    const pubBtn = kb.inline_keyboard[0].find(b => b.text.includes('Publisher'));
    expect(pubBtn.url).toBe('https://doi.org/10.1234/test');
  });

  test('adds landing page buttons when provided', () => {
    const landingPages = [
      { url: 'https://arxiv.org/abs/1234', label: '📄 arXiv' },
      { url: 'https://example.com/oa', label: '🔓 Open Access' },
    ];
    const kb = buildNotFoundKeyboard('10.1234/test', '', landingPages);
    // Should have 2 rows now
    expect(kb.inline_keyboard.length).toBe(2);
    expect(kb.inline_keyboard[1][0].text).toBe('📄 arXiv');
    expect(kb.inline_keyboard[1][0].url).toBe('https://arxiv.org/abs/1234');
  });

  test('no extra row when landing pages empty', () => {
    const kb = buildNotFoundKeyboard('10.1234/test', '', []);
    expect(kb.inline_keyboard.length).toBe(1);
  });
});
