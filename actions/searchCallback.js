const { searchPapers, RESULTS_PER_PAGE } = require('../utils/keyword.js');
const { formatResultCard, formatSearchHeader, buildResultKeyboard } = require('../utils/searchResult.js');

/**
 * In-memory search state per chat.
 * Key: chatId, Value: { query, page, yearFilter, total, source, papers }
 */
const searchState = new Map();

// Expire stale searches after 10 minutes
const STATE_TTL = 10 * 60 * 1000;

function getState(chatId) {
  const state = searchState.get(chatId);
  if (state && Date.now() - state.timestamp > STATE_TTL) {
    searchState.delete(chatId);
    return null;
  }
  return state || null;
}

function setState(chatId, state) {
  searchState.set(chatId, { ...state, timestamp: Date.now() });
}

/**
 * Perform a search and send/update results.
 * @param {Object} ctx - Telegraf context
 * @param {string} query - Search keywords
 * @param {Object} opts - { page, yearFilter, editMessageId }
 */
async function doSearch(ctx, query, opts = {}) {
  const chatId = ctx.chat?.id || ctx.callbackQuery?.message?.chat?.id;
  const messageId = ctx.message?.message_id || ctx.callbackQuery?.message?.message_id;
  const { page = 0, yearFilter = null, editMessageId = null } = opts;

  const offset = page * RESULTS_PER_PAGE;

  // Show loading
  if (editMessageId) {
    await ctx.telegram.editMessageText(chatId, editMessageId, null, '🔍 Searching...').catch(() => {});
  } else {
    var loadingMsg = await ctx.reply('🔍 Searching...').catch(() => null);
  }

  const result = await searchPapers(query, {
    offset,
    limit: RESULTS_PER_PAGE,
    yearFrom: yearFilter || null,
    yearTo: yearFilter || null,
  });

  if (result.error === 'rate-limited' && result.papers.length === 0) {
    const msg = '⚠️ Search APIs are busy. Please try again in a few seconds.';
    if (editMessageId) {
      await ctx.telegram.editMessageText(chatId, editMessageId, null, msg).catch(() => {});
    } else if (loadingMsg) {
      await ctx.telegram.editMessageText(chatId, loadingMsg.message_id, null, msg).catch(() => {});
    }
    return;
  }

  if (result.papers.length === 0) {
    const msg = `🔍 No results found for *${query}*${yearFilter ? ` in ${yearFilter}` : ''}`;
    if (editMessageId) {
      await ctx.telegram.editMessageText(chatId, editMessageId, null, msg, { parse_mode: 'Markdown' }).catch(() => {});
    } else if (loadingMsg) {
      await ctx.telegram.editMessageText(chatId, loadingMsg.message_id, null, msg, { parse_mode: 'Markdown' }).catch(() => {});
    }
    return;
  }

  // Save state for pagination
  setState(chatId, {
    query,
    page,
    yearFilter,
    total: result.total,
    source: result.source,
    papers: result.papers,
  });

  // Format results
  const header = formatSearchHeader(query, result.total, page, RESULTS_PER_PAGE, result.source, yearFilter);
  const cards = result.papers.map((paper, i) =>
    formatResultCard(paper, offset + i + 1, result.total)
  );
  const fullText = header + '\n\n' + cards.join('\n\n');
  const keyboard = buildResultKeyboard(result.papers, page, result.total, RESULTS_PER_PAGE);

  // Send or edit
  const msgOpts = {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
    disable_web_page_preview: true,
  };

  const targetMsgId = editMessageId || loadingMsg?.message_id;
  if (targetMsgId) {
    await ctx.telegram.editMessageText(chatId, targetMsgId, null, fullText, msgOpts).catch(() => {});
  } else {
    await ctx.reply(fullText, { ...msgOpts, reply_to_message_id: messageId }).catch(() => {});
  }
}

/**
 * Handle search-related callback queries.
 * Callback formats: sr:p:<page>, sr:y:<year>
 */
module.exports = async (ctx) => {
  const data = ctx.callbackQuery?.data;
  if (!data || !data.startsWith('sr:')) return;

  const chatId = ctx.callbackQuery.message?.chat?.id;
  const state = getState(chatId);

  if (!state) {
    await ctx.answerCbQuery('⏰ Search expired. Please search again.').catch(() => {});
    return;
  }

  await ctx.answerCbQuery().catch(() => {});

  const messageId = ctx.callbackQuery.message?.message_id;

  if (data.startsWith('sr:p:')) {
    // Pagination
    const page = parseInt(data.substring(5));
    if (isNaN(page) || page < 0) return;

    await doSearch(ctx, state.query, {
      page,
      yearFilter: state.yearFilter,
      editMessageId: messageId,
    });
  } else if (data.startsWith('sr:y:')) {
    // Year filter
    const yearStr = data.substring(5);
    const yearFilter = yearStr === 'all' ? null : parseInt(yearStr);

    await doSearch(ctx, state.query, {
      page: 0,
      yearFilter,
      editMessageId: messageId,
    });
  }
};

// Export doSearch for use by /kw command
module.exports.doSearch = doSearch;
