const { formatSize, TELEGRAM_MAX_FILE } = require('./pdfSize.js');
const { splitPDF } = require('./pdfSplitter.js');

/**
 * Send a PDF to the user. If the file exceeds Telegram's 50 MB limit,
 * automatically splits it into parts.
 *
 * @param {Object} ctx - Telegraf context
 * @param {number} messageId - Message ID to reply to
 * @param {Buffer} fileData - PDF file data
 * @param {string} filename - Desired filename
 * @param {string} caption - Document caption
 * @param {string} [tag='SEND'] - Log tag for debugging
 * @returns {Promise}
 */
async function sendPDF(ctx, messageId, fileData, filename, caption, tag = 'SEND') {
  if (fileData.length <= TELEGRAM_MAX_FILE) {
    return ctx.replyWithDocument(
      { source: fileData, filename },
      { caption, reply_to_message_id: messageId }
    ).catch(e => console.error(`[${tag}] Failed to send PDF:`, e.message));
  }

  // File too large — try splitting
  console.log(`[${tag}] File too large (${formatSize(fileData.length)}), attempting split...`);
  const baseName = filename.replace('.pdf', '');
  const { parts, error } = await splitPDF(fileData, baseName);

  if (error || parts.length === 0) {
    return ctx.reply(
      `⚠️ PDF is ${formatSize(fileData.length)} — too large for Telegram (max 50 MB) and couldn't split it.\n\nTry downloading directly from the DOI link.`,
      { reply_to_message_id: messageId }
    ).catch(() => {});
  }

  // Send each part
  await ctx.reply(
    `📦 PDF split into ${parts.length} parts (${formatSize(fileData.length)} total)`,
    { reply_to_message_id: messageId }
  ).catch(() => {});

  for (const part of parts) {
    await ctx.replyWithDocument(
      { source: part.data, filename: part.filename },
      {
        caption: `📄 Part ${part.index}/${parts.length} (pages ${part.pages})`,
        reply_to_message_id: messageId,
      }
    ).catch(e => console.error(`[${tag}] Failed to send part ${part.index}:`, e.message));
  }
}

module.exports = { sendPDF, formatSize };
