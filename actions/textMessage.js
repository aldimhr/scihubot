const { sciHub, downloadFile, citation, downloadQueue, cache } = require('../utils/index.js');
const { responseMessages } = require('../utils/constans.js');

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
    return ctx.reply(responseMessages.inputLink, { disable_web_page_preview: true });
  }

  // Normalize DOI for cache key
  const normalizedDOI = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '').replace(/\/+$/, '');
  const doiURL = `http://doi.org/${normalizedDOI}`;

  // wait message
  let waitMsg;
  try {
    waitMsg = await ctx.telegram.sendMessage(chat_id, responseMessages.wait, {
      reply_to_message_id: message.message_id,
    });
  } catch (e) {
    console.error('[TEXT] Failed to send wait message:', e.message);
  }

  // Run download through queue
  const result = await downloadQueue.enqueue(
    async () => {
      // Check cache first
      const cached = cache.get(normalizedDOI);
      if (cached) {
        console.log(`[TEXT] Cache hit for DOI: ${normalizedDOI}`);
        return { data: cached, citation: null, error: false, cached: true };
      }

      // Hit Sci-Hub
      const { data: scihubData, citation: scihubCitation, error: scihubError } = await sciHub(doiURL);
      if (scihubError) return { data: null, citation: null, error: scihubError };

      // Download PDF
      const dFile = await downloadFile(scihubData);
      if (dFile.error) return { data: null, citation: null, error: dFile.error };

      // Cache it
      cache.set(normalizedDOI, dFile.data);

      return { data: dFile.data, citation: scihubCitation, error: false };
    },
    (position, total) => {
      console.log(`[TEXT] Queued: position ${position}/${total}`);
      if (waitMsg) {
        ctx.telegram.editMessageText(chat_id, waitMsg.message_id, undefined,
          `⏳ All download slots busy. You're #${position} in queue...`
        ).catch(() => {});
      }
    }
  );

  // delete wait message
  if (waitMsg) {
    try {
      await ctx.telegram.deleteMessage(chat_id, waitMsg.message_id);
    } catch (e) {
      console.error('[TEXT] Failed to delete wait msg:', e.message);
    }
  }

  if (result.error || !result.data) {
    console.log('[TEXT] Error:', result.error);
    return ctx.reply("Unfortunately, Sci-Hub doesn't have the requested document :-(", {
      reply_to_message_id: message.message_id,
    });
  }

  console.log('[TEXT] Sending PDF document...');
  ctx.replyWithDocument(
    { source: result.data, filename: `${normalizedDOI.replace(/\//g, '_')}.pdf` },
    {
      caption: result.citation || (result.cached ? '(cached)' : ''),
      reply_to_message_id: message.message_id,
    }
  ).then(() => console.log('[TEXT] PDF sent successfully'))
   .catch(e => console.error('[TEXT] Failed to send PDF:', e.message));
};
