const { sciHub, downloadFile, citation, downloadQueue, cache } = require('../utils/index.js');
const { recordDownload } = require('../utils/dataStore.js');
const { fetchMeta, formatCard, buildKeyboard } = require('../utils/paperMeta.js');
const ProgressMessage = require('../utils/progress.js');

module.exports = async (ctx) => {
  const message = ctx.message;
  const chat_id = message.chat.id;
  let text = message.text;

  let doi;
  if (text.toLowerCase().includes('doi:')) {
    doi = text.toLowerCase().split('doi:').join('').trim();
  } else if (text.split(' ').length === 2 && text.split(' ')[0].toLowerCase().includes('doi')) {
    doi = text.toLowerCase().split('doi').join('').trim();
  } else if (text.includes('/') && text.includes('.') && text.split(' ').length === 1) {
    if (text[0] === '/') text = text.substring(1);
    doi = text;
  }

  if (!doi || doi.length <= 20 || doi.split(' ').length !== 1) {
    return ctx.reply(
      'Please drop a DOI or Publisher URL below. Use /help for examples.',
      { disable_web_page_preview: true }
    );
  }

  // Normalize DOI
  const normalizedDOI = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '').replace(/\/+$/, '');
  const doiURL = `http://doi.org/${normalizedDOI}`;

  // Try to show info card first
  const { meta } = await fetchMeta(normalizedDOI);
  if (meta) {
    const card = formatCard(meta);
    const keyboard = buildKeyboard(normalizedDOI);
    return ctx.reply(card, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
      disable_web_page_preview: true,
    });
  }

  // Fallback: no metadata — direct download (original behavior)

  // Create progress message
  const progress = new ProgressMessage(ctx, chat_id, message.message_id);
  await progress.update('🕵️ Starting download...');

  // Run download through queue
  const result = await downloadQueue.enqueue(
    async () => {
      // Check cache first
      const cached = cache.get(normalizedDOI);
      if (cached) {
        await progress.update('💾 Found in cache! Sending instantly...');
        return { data: cached, citation: null, error: false, cached: true };
      }

      await progress.update('🔍 Searching Sci-Hub for your paper...');
      const { data: scihubData, citation: scihubCitation, error: scihubError } = await sciHub(doiURL);
      if (scihubError) return { data: null, citation: null, error: scihubError };

      await progress.update('📄 Found! Downloading PDF...');
      const dFile = await downloadFile(scihubData);
      if (dFile.error) return { data: null, citation: null, error: dFile.error };

      await progress.update(`✅ Downloaded ${(dFile.data.length / 1024 / 1024).toFixed(1)}MB. Sending...`);

      // Cache it
      cache.set(normalizedDOI, dFile.data);

      return { data: dFile.data, citation: scihubCitation, error: false };
    },
    async (position, total) => {
      console.log(`[TEXT] Queued: position ${position}/${total}`);
      await progress.update(`⏳ All download slots busy. You're #${position} in queue...`);
    }
  );

  // Delete progress message
  await progress.done();

  if (result.error || !result.data) {
    console.log('[TEXT] Error:', result.error);
    recordDownload({ userId: message.from?.id, doi: normalizedDOI, success: false, error: result.error });
    return ctx.reply("Unfortunately, Sci-Hub doesn't have the requested document :-(", {
      reply_to_message_id: message.message_id,
    });
  }

  console.log('[TEXT] Sending PDF document...');
  recordDownload({ userId: message.from?.id, doi: normalizedDOI, success: true, cached: result.cached });

  ctx.replyWithDocument(
    { source: result.data, filename: `${normalizedDOI.replace(/\//g, '_')}.pdf` },
    {
      caption: result.citation || (result.cached ? '💾 From cache' : ''),
      reply_to_message_id: message.message_id,
    }
  ).then(() => console.log('[TEXT] PDF sent successfully'))
   .catch(e => console.error('[TEXT] Failed to send PDF:', e.message));
};
