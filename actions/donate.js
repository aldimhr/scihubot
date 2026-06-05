/**
 * Telegram Stars Donation — native in-app donation via Telegram Payments API.
 * Users pick an amount, pay with Stars, bot confirms.
 */

const DONATION_AMOUNTS = [
  { label: '⭐ 25 Stars', amount: 25 },
  { label: '⭐ 50 Stars', amount: 50 },
  { label: '⭐ 100 Stars', amount: 100 },
  { label: '⭐ 250 Stars', amount: 250 },
  { label: '⭐ 500 Stars', amount: 500 },
];

/**
 * Show donation menu with Star amount buttons.
 */
async function showDonationMenu(ctx) {
  const keyboard = DONATION_AMOUNTS.map(d => [{
    text: d.label,
    callback_data: `donate_${d.amount}`,
  }]);

  // Add a custom amount hint
  keyboard.push([{ text: '💝 Custom Amount', callback_data: 'donate_custom' }]);

  await ctx.reply(
    '⭐ <b>Support this bot with Telegram Stars!</b>\n\n' +
    'Your donation helps keep the servers running and the bot free for everyone.\n\n' +
    'Choose an amount below, or type a custom amount with:\n' +
    '<code>/donate &lt;amount&gt;</code>\n\n' +
    'Thank you for your support! 💙',
    {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: keyboard },
    }
  );
}

/**
 * Handle callback button press — send invoice for selected amount.
 */
async function handleDonateCallback(ctx) {
  const data = ctx.callbackQuery?.data;
  if (!data || !data.startsWith('donate_')) return;

  const amountStr = data.replace('donate_', '');
  if (amountStr === 'custom') {
    return ctx.answerCbQuery('Type /donate <amount> for a custom amount', { show_alert: true });
  }

  const amount = parseInt(amountStr);
  if (isNaN(amount) || amount < 1) {
    return ctx.answerCbQuery('Invalid amount');
  }

  await ctx.answerCbQuery();
  await sendInvoice(ctx, amount);
}

/**
 * Handle /donate command — optional amount arg or show menu.
 */
async function handleDonateCommand(ctx) {
  const text = ctx.message?.text || '';
  const parts = text.split(/\s+/);
  const amount = parseInt(parts[1]);

  if (amount && amount >= 1 && amount <= 10000) {
    await sendInvoice(ctx, amount);
  } else {
    await showDonationMenu(ctx);
  }
}

/**
 * Send a Telegram Stars invoice.
 */
async function sendInvoice(ctx, amount) {
  try {
    await ctx.replyWithInvoice({
      title: `${amount} Stars Donation`,
      description: `Support Sci-Hub Bot with ${amount} Telegram Stars. Thank you! 💙`,
      payload: `donate_${amount}_${Date.now()}`,
      provider_token: '', // empty for Telegram Stars
      currency: 'XTR',    // Telegram Stars currency code
      prices: [{ label: `${amount} Stars`, amount: amount }], // amount in Stars (no cents)
    });
  } catch (e) {
    console.error('[DONATE] Failed to send invoice:', e.message);
    ctx.reply('❌ Failed to create donation invoice. Please try again later.').catch(() => {});
  }
}

/**
 * Handle pre_checkout_query — approve all Star payments.
 */
async function handlePreCheckout(ctx) {
  try {
    await ctx.answerPreCheckoutQuery(true);
    console.log(`[DONATE] Pre-checkout approved for user ${ctx.preCheckoutQuery?.from?.id}`);
  } catch (e) {
    console.error('[DONATE] Pre-checkout error:', e.message);
  }
}

/**
 * Handle successful payment — thank the user.
 */
async function handleSuccessfulPayment(ctx) {
  const payment = ctx.message?.successful_payment;
  if (!payment) return;

  const stars = payment.total_amount;
  const userId = ctx.message.from?.id;
  const username = ctx.message.from?.username || 'unknown';

  console.log(`[DONATE] Payment received: ${stars} Stars from user ${userId} (${username})`);

  // Record in data store
  try {
    const dataStore = require('../utils/dataStore.js');
    dataStore.logDownload({
      userId,
      doi: `⭐ DONATION: ${stars} Stars`,
      success: true,
      cached: false,
    });
  } catch (e) {
    // non-critical
  }

  await ctx.reply(
    `🎉 <b>Thank you for your donation!</b>\n\n` +
    `You donated <b>${stars} Stars</b> ⭐\n\n` +
    `Your support means a lot and helps keep this bot running for everyone.\n\n` +
    `💙 Thank you!`,
    { parse_mode: 'HTML' }
  ).catch(() => {});
}

module.exports = {
  showDonationMenu,
  handleDonateCallback,
  handleDonateCommand,
  handlePreCheckout,
  handleSuccessfulPayment,
  DONATION_AMOUNTS,
};
