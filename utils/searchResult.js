/**
 * Format a single search result as a compact card.
 * @param {Object} paper - Normalized paper { doi, title, authors, journal, year, citations }
 * @param {number} rank - Position in results (1-based)
 * @param {number} total - Total results found
 * @returns {string} Telegram Markdown formatted card
 */
function formatResultCard(paper, rank, total) {
  const lines = [];

  // Rank + title
  lines.push(`${rank}. 📄 *${escapeMd(paper.title)}*`);

  // Authors (max 3)
  if (paper.authors.length > 0) {
    const authorStr = paper.authors.length > 3
      ? paper.authors.slice(0, 3).join(', ') + ' et al.'
      : paper.authors.join(', ');
    lines.push(`👤 ${escapeMd(authorStr)}`);
  }

  // Journal + year
  const meta = [];
  if (paper.journal) meta.push(`*${escapeMd(paper.journal)}*`);
  if (paper.year) meta.push(String(paper.year));
  if (meta.length > 0) lines.push(`📰 ${meta.join(' · ')}`);

  // Citations
  if (paper.citations > 0) {
    lines.push(`📊 Cited *${paper.citations.toLocaleString()}* times`);
  }

  // DOI
  lines.push(`🏷️ \`${paper.doi}\``);

  return lines.join('\n');
}

/**
 * Format the search header.
 * @param {string} query - Search query
 * @param {number} total - Total results
 * @param {number} page - Current page (0-based)
 * @param {number} perPage - Results per page
 * @param {string} source - API source used
 * @param {number|null} yearFilter - Active year filter
 * @returns {string}
 */
function formatSearchHeader(query, total, page, perPage, source, yearFilter = null) {
  const totalPages = Math.ceil(total / perPage);
  const lines = [];

  lines.push(`🔍 *Search:* ${escapeMd(query)}`);
  if (yearFilter) lines.push(`📅 Year: ${yearFilter}`);
  lines.push(`📚 ${total.toLocaleString()} results (page ${page + 1})`);

  const sourceLabel = source === 'semantic-scholar' ? 'S2' : 'CR';
  lines.push(`_via ${sourceLabel} · ${perPage} per page_`);

  return lines.join('\n');
}

/**
 * Build inline keyboard for a page of search results + pagination.
 * @param {Array} papers - Array of normalized papers
 * @param {number} page - Current page (0-based)
 * @param {number} total - Total results
 * @param {number} perPage - Results per page
 * @returns {Object} Telegram inline_keyboard
 */
function buildResultKeyboard(papers, page, total, perPage) {
  const keyboard = [];

  // One button per paper (title only, triggers download)
  for (const paper of papers) {
    const title = paper.title.length > 60 ? paper.title.substring(0, 57) + '...' : paper.title;
    keyboard.push([{
      text: `📄 ${title}`,
      callback_data: `dl:${paper.doi}`,
    }]);
  }

  // Pagination row
  const totalPages = Math.ceil(total / perPage);
  const navRow = [];

  if (page > 0) {
    navRow.push({ text: '⬅️ Prev', callback_data: `sr:p:${page - 1}` });
  }
  if (page < totalPages - 1) {
    navRow.push({ text: 'Next ➡️', callback_data: `sr:p:${page + 1}` });
  }

  if (navRow.length > 0) {
    keyboard.push(navRow);
  }

  // Year filter row
  const currentYear = new Date().getFullYear();
  keyboard.push([
    { text: `📅 ${currentYear}`, callback_data: `sr:y:${currentYear}` },
    { text: `📅 ${currentYear - 1}`, callback_data: `sr:y:${currentYear - 1}` },
    { text: '📅 All years', callback_data: `sr:y:all` },
  ]);

  return { inline_keyboard: keyboard };
}

function escapeMd(str) {
  if (!str) return '';
  return str.replace(/[_*\[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

module.exports = { formatResultCard, formatSearchHeader, buildResultKeyboard, escapeMd };
