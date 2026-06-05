/**
 * Shared caption/footer helpers for PDF sends.
 */

const CHANNEL_FOOTER = '\n\n📢 @x0projects';

/**
 * Build a caption with optional citation and subtle channel footer.
 * @param {string} citation - Paper citation or DOI string
 * @param {object} opts - { cached: bool, addFooter: bool (default true) }
 */
function buildCaption(citation, opts = {}) {
  const { cached = false, addFooter = true } = opts;
  let caption = citation || (cached ? '💾 From cache' : '');
  if (addFooter) caption += CHANNEL_FOOTER;
  return caption;
}

module.exports = { buildCaption, CHANNEL_FOOTER };
