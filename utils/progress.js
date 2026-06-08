/**
 * ProgressMessage — edits a single Telegram message to show download progress steps.
 * Usage:
 *   const progress = new ProgressMessage(ctx, chatId, replyToId);
 *   await progress.update('🔍 Searching Sci-Hub...');
 *   await progress.update('📄 Found! Downloading (1.2MB)...');
 *   await progress.update('✅ Sending your PDF...');
 *   await progress.done(); // delete the progress message
 */

class ProgressMessage {
  /**
   * @param {Object} ctx - Telegraf context
   * @param {number} chatId
   * @param {number} replyToId - Message to reply to
   * @param {number|null} existingMessageId - Reuse an existing message instead of creating new
   */
  constructor(ctx, chatId, replyToId, existingMessageId = null) {
    this.ctx = ctx;
    this.chatId = chatId;
    this.replyToId = replyToId;
    this.messageId = existingMessageId || null;
    this.currentText = '';
  }

  /**
   * Update the progress message. Creates it on first call, edits on subsequent calls.
   */
  async update(text) {
    if (text === this.currentText) return; // skip duplicate
    this.currentText = text;

    try {
      if (this.messageId) {
        // Edit existing message
        await this.ctx.telegram.editMessageText(
          this.chatId, this.messageId, undefined, text
        );
      } else {
        // Create new message
        const msg = await this.ctx.telegram.sendMessage(this.chatId, text, {
          reply_to_message_id: this.replyToId,
        });
        this.messageId = msg.message_id;
      }
    } catch (e) {
      // Message not modified (same text) or network error — silently ignore
      if (!e.message?.includes('message is not modified')) {
        console.error('[PROGRESS] Failed to update:', e.message);
      }
    }
  }

  /**
   * Delete the progress message (cleanup before sending the PDF).
   */
  async done() {
    if (!this.messageId) return;
    try {
      await this.ctx.telegram.deleteMessage(this.chatId, this.messageId);
    } catch (e) {
      // Already deleted or network error
    }
    this.messageId = null;
  }
}

module.exports = ProgressMessage;
