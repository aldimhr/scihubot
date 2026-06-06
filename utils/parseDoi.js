/**
 * Parse multiple DOIs from user text input.
 *
 * Supports:
 *   - Comma-separated:  10.1177/abc, 10.3389/def
 *   - Newline-separated: 10.1177/abc\n10.3389/def
 *   - Multiple bare DOIs on one line (space-separated if they have slashes)
 *   - Multiple doi.org URLs in one message
 *   - Mixed: URLs + bare DOIs
 *   - DOI: prefix variants
 */

// Matches a DOI pattern: 10.NNNN/... (at least one slash, reasonable chars)
const DOI_PATTERN = /\b(10\.\d{4,9}\/[^\s,;}\]]+)/g;

/**
 * Extract all DOIs from arbitrary text.
 * @param {string} text - Raw user message
 * @returns {string[]} - Deduplicated list of DOIs
 */
function parseMultipleDois(text) {
  if (!text || typeof text !== 'string') return [];

  // Normalize: strip DOI: prefix (case-insensitive)
  let normalized = text.replace(/\bdoi\s*:\s*/gi, '');

  // Extract all DOI-pattern matches
  const matches = normalized.match(DOI_PATTERN) || [];

  // Clean: strip trailing punctuation, trailing slashes
  const cleaned = matches
    .map(d => d.replace(/[)\].,;:!?]+$/, '').replace(/\/+$/, ''))
    .filter(d => d.length > 10); // minimum viable DOI length

  // Deduplicate (preserve order)
  return [...new Set(cleaned)];
}

/**
 * Extract DOIs from Telegram message entities (URLs).
 * @param {Array} entities - ctx.message.entities
 * @param {string} text - Full message text
 * @returns {string[]} - List of DOIs extracted from doi.org URLs
 */
function parseDoisFromEntities(entities, text) {
  if (!entities || !text) return [];

  const dois = [];
  for (const ent of entities) {
    if (ent.type === 'url' || ent.type === 'text_link') {
      const url = ent.type === 'text_link'
        ? ent.url
        : text.substring(ent.offset, ent.offset + ent.length);

      // Check for doi.org URL
      const doiMatch = url.match(/doi\.org\/(.+)/);
      if (doiMatch) {
        const doi = doiMatch[1].replace(/\/+$/, '');
        if (doi.length > 10) dois.push(doi);
      } else {
        // It's a publisher URL — we can't batch these (need getMetaDOI per-URL)
        // Return empty to signal "not batch-compatible"
        return [];
      }
    }
  }

  return [...new Set(dois)];
}

module.exports = { parseMultipleDois, parseDoisFromEntities, DOI_PATTERN };
