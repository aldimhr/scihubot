const axios = require('axios');

/**
 * Fetch paper metadata from CrossRef API (free, no auth).
 * Returns a formatted info card string + metadata object.
 */

const CROSSREF_API = 'https://api.crossref.org/works';
const TIMEOUT = 8000;

/**
 * Fetch metadata for a DOI from CrossRef.
 * @param {string} doi - Normalized DOI (e.g. "10.1038/nature12373")
 * @returns {{ meta: Object|null, error: string|null }}
 */
async function fetchMeta(doi) {
  try {
    const url = `${CROSSREF_API}/${encodeURIComponent(doi)}`;
    const { data } = await axios.get(url, {
      timeout: TIMEOUT,
      headers: {
        'User-Agent': 'SciHubBot/2.0 (https://github.com/aldimhr/scihubot; mailto:bot@scihubot.local)',
      },
    });

    const item = data?.message;
    if (!item) return { meta: null, error: 'No metadata found' };

    const meta = {
      title: cleanText(item.title?.[0] || ''),
      authors: formatAuthors(item.author || []),
      journal: cleanText(item['container-title']?.[0] || ''),
      year: extractYear(item),
      volume: item.volume || '',
      issue: item.issue || '',
      pages: item.page || '',
      doi: doi,
      abstract: cleanAbstract(item.abstract || ''),
      publisher: item.publisher || '',
      type: item.type || '',
      url: `https://doi.org/${doi}`,
      subject: (item.subject || []).slice(0, 3),
      citations: item['is-referenced-by-count'] || 0,
      published: formatDateParts(item.issued),
    };

    return { meta, error: null };
  } catch (err) {
    if (err.response?.status === 404) {
      return { meta: null, error: 'DOI not found in CrossRef' };
    }
    console.error('[PAPER-META] CrossRef error:', err.message);
    return { meta: null, error: err.message };
  }
}

/**
 * Format metadata into a clean Telegram info card.
 * @param {Object} meta - Paper metadata from fetchMeta
 * @param {Object|null} sizeInfo - { label, tooLarge } from sizeStatus(), or null to skip
 */
function formatCard(meta, sizeInfo = null) {
  const lines = [];

  // Title
  lines.push(`📄 *${escapeMarkdown(meta.title)}*`);
  lines.push('');

  // Authors (max 5, then "et al.")
  if (meta.authors.length > 0) {
    const authorStr = meta.authors.length > 5
      ? meta.authors.slice(0, 5).join(', ') + ' et al.'
      : meta.authors.join(', ');
    lines.push(`👤 ${escapeMarkdown(authorStr)}`);
  }

  // Journal + year
  const journalParts = [];
  if (meta.journal) journalParts.push(`*${escapeMarkdown(meta.journal)}*`);
  if (meta.year) journalParts.push(meta.year);
  if (meta.volume) journalParts.push(`Vol. ${meta.volume}`);
  if (meta.issue) journalParts.push(`(${meta.issue})`);
  if (meta.pages) journalParts.push(`pp. ${meta.pages}`);
  if (journalParts.length > 0) {
    lines.push(`📰 ${journalParts.join(' · ')}`);
  }

  // Publisher
  if (meta.publisher) {
    lines.push(`🏢 ${escapeMarkdown(meta.publisher)}`);
  }

  // Citations
  if (meta.citations > 0) {
    lines.push(`📊 Cited *${meta.citations}* times`);
  }

  // File size (if available)
  if (sizeInfo) {
    lines.push(sizeInfo.label);
  }

  // DOI
  lines.push('');
  lines.push(`🏷️ \`${meta.doi}\``);

  // Subjects
  if (meta.subject.length > 0) {
    lines.push(`🔖 ${meta.subject.map(s => escapeMarkdown(s)).join(', ')}`);
  }

  // Abstract (truncated)
  if (meta.abstract) {
    lines.push('');
    const maxLen = 300;
    const abs = meta.abstract.length > maxLen
      ? meta.abstract.substring(0, maxLen).trim() + '...'
      : meta.abstract;
    lines.push(`📝 _${escapeMarkdown(abs)}_`);
  }

  return lines.join('\n');
}

/**
 * Build inline keyboard for the info card.
 * @param {string} doi - Paper DOI
 * @param {boolean} tooLarge - If true, download button is disabled with warning
 */
function buildKeyboard(doi, tooLarge = false) {
  const downloadBtn = tooLarge
    ? { text: '⚠️ Too large for Telegram', callback_data: `dl:${doi}` }
    : { text: '⬇️ Download PDF', callback_data: `dl:${doi}` };

  return {
    inline_keyboard: [
      [
        downloadBtn,
        { text: '📎 Open DOI', url: `https://doi.org/${doi}` },
      ],
      [
        { text: '📢 Updates & new bots', url: 'https://t.me/x0projects' },
      ],
    ],
  };
}

// --- Helpers ---

function formatAuthors(authors) {
  return authors.map(a => {
    const given = a.given || '';
    const family = a.family || '';
    // Use initials for given name to keep it compact
    const initials = given
      .split(/[\s-]/)
      .map(p => p.charAt(0) + '.')
      .join(' ');
    return family ? `${family} ${initials}` : given;
  }).filter(Boolean);
}

function extractYear(item) {
  const dateParts = item.issued?.['date-parts']?.[0];
  if (dateParts && dateParts[0]) return String(dateParts[0]);
  // Fallback: try other date fields
  for (const field of ['published-print', 'published-online', 'created']) {
    const parts = item[field]?.['date-parts']?.[0];
    if (parts && parts[0]) return String(parts[0]);
  }
  return '';
}

function formatDateParts(issued) {
  const parts = issued?.['date-parts']?.[0];
  if (!parts || parts.length === 0) return '';
  const [year, month, day] = parts;
  if (day) return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (month) return `${year}-${String(month).padStart(2, '0')}`;
  return String(year);
}

function cleanText(str) {
  return str.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function cleanAbstract(str) {
  return str
    .replace(/<[^>]+>/g, '')     // strip HTML tags
    .replace(/&[a-z]+;/gi, ' ') // strip HTML entities
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeMarkdown(str) {
  // Escape Telegram MarkdownV1 special chars
  return str.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

module.exports = { fetchMeta, formatCard, buildKeyboard };
