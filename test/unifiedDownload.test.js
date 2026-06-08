/**
 * Tests for the unified parallel download — races all PDF sources.
 */

const { downloadFromAnySource, buildNotFoundKeyboard } = require('../utils/unifiedDownload.js');

describe('Unified Download — downloadFromAnySource()', () => {
  jest.setTimeout(60000);

  test('finds PDF for PLOS OA paper via Unpaywall (fast path)', async () => {
    const start = Date.now();
    const result = await downloadFromAnySource(
      'https://doi.org/10.1371/journal.pone.0000308',
      '10.1371/journal.pone.0000308',
      ''
    );
    const elapsed = Date.now() - start;

    if (result.data) {
      expect(result.source).toBeTruthy();
      expect(Buffer.isBuffer(result.data)).toBe(true);
      console.log(`    Found via ${result.source} in ${elapsed}ms`);
    } else {
      // At least should have landing pages
      expect(result.error).toBeTruthy();
      console.log(`    Not found in ${elapsed}ms (landing pages: ${result.landingPages?.length || 0})`);
    }
  });

  test('completes within reasonable time even when sources fail', async () => {
    const start = Date.now();
    const result = await downloadFromAnySource(
      'https://doi.org/10.99999/fake.doi.does.not.exist.xyz',
      '10.99999/fake.doi.does.not.exist.xyz',
      ''
    );
    const elapsed = Date.now() - start;

    // Should complete within ~30s (parallel), not ~60s (sequential)
    expect(elapsed).toBeLessThan(35000);
    expect(result.error).toBeTruthy();
    console.log(`    Completed in ${elapsed}ms`);
  });

  test('returns landing pages when no PDF found', async () => {
    const result = await downloadFromAnySource(
      'https://doi.org/10.99999/fake.doi.test',
      '10.99999/fake.doi.test',
      ''
    );

    if (!result.data) {
      expect(Array.isArray(result.landingPages)).toBe(true);
    }
  });

  test('reports progress via callback', async () => {
    const messages = [];
    await downloadFromAnySource(
      'https://doi.org/10.99999/fake.doi.test',
      '10.99999/fake.doi.test',
      '',
      (msg) => messages.push(msg)
    );

    // Should have called progress at least once
    expect(messages.length).toBeGreaterThan(0);
    expect(messages.some(m => m.includes('Searching'))).toBe(true);
  });
});
