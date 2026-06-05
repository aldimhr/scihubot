const { searchKeyword, notifyAdmin, db, errorHandler, downloadQueue, cache } = require('../utils/index.js');
const { adminChatId } = require('../utils/constans.js');
const dataStore = require('../utils/dataStore.js');
const mirrorDiscovery = require('../utils/mirrorDiscovery.js');

// --- Admin check helper ---
function isAdmin(chatId) {
  return adminChatId.includes(chatId);
}

// --- Existing commands ---

exports.broadcast = async (ctx) => {
  try {
    const message = ctx.message;
    const text = message.text;
    const chat_id = message.chat.id;

    if (!isAdmin(chat_id)) return;

    let { data } = await db.getUser({ chat_id });
    if (data[0]?.permission === 'admin' || isAdmin(chat_id)) {
      console.log(`================ BROADCAST MODE ================`);
      let { data: users } = await db.getUsers();
      let filterText = text.split('/broadcast').join('').trim();

      users.forEach(async (item) => {
        ctx.telegram
          .sendMessage(item.chat_id, filterText)
          .then(() => console.log(`Broadcast sent to ${item.chat_id}`))
          .catch((err) => console.log(`Broadcast failed for ${item.chat_id}`));
      });
    }
  } catch (err) {
    errorHandler({ ctx, message: 'actions/command.js/broadcast' });
  }
};

exports.keyword = async (ctx) => {
  try {
    const message = ctx.message;
    const text = message.text;

    const textTarget = text.split('/kw').join('').trim().replace(/\s\s+/g, ' ');

    if (textTarget.length < 5) {
      return ctx.reply('Please enter the keyword at least 5 letters').catch(() => {});
    }

    if (!isNaN(textTarget)) {
      return ctx.reply('Please input a keyword not a number').catch(() => {});
    }

    const searchResult = await searchKeyword(textTarget);
    if (!searchResult) {
      return ctx.reply("This bot can't read your keywords. This can happen when your keywords are too long.");
    }

    const resultKeyboard = searchResult.map((item) => [{
      text: item.title,
      callback_data: item.externalIds['DOI'],
    }]);

    return ctx.reply(`Top 10 papers of the keywords entered \n\n<i>Note: not all files below are available in the Sci-Hub database</i>`, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: resultKeyboard },
    });
  } catch (err) {
    errorHandler({ ctx, message: 'bot/action/command()' });
  }
};

// --- Admin commands ---

/**
 * /status — quick queue + cache overview (admin only)
 */
exports.status = async (ctx) => {
  try {
    if (!isAdmin(ctx.message?.chat.id)) return;

    const queueStatus = downloadQueue.getStatus();
    const cacheStats = cache.stats();

    const msg = [
      '📊 <b>Bot Status</b>',
      '',
      `🔄 <b>Queue:</b> ${queueStatus.active}/${queueStatus.max} active, ${queueStatus.waiting} waiting`,
      `💾 <b>Cache:</b> ${cacheStats.files} files, ${cacheStats.sizeMB}MB / ${cacheStats.maxSizeMB}MB`,
    ].join('\n');

    ctx.reply(msg, { parse_mode: 'HTML' }).catch(() => {});
  } catch (err) {
    console.error('[STATUS] Error:', err.message);
  }
};

/**
 * /stats — detailed download statistics
 */
exports.stats = async (ctx) => {
  try {
    if (!isAdmin(ctx.message?.chat.id)) return;

    const stats = dataStore.getStats();
    const today = new Date().toISOString().split('T')[0];
    const todayStats = stats.daily[today] || { downloads: 0, failures: 0, users: [] };

    // Last 7 days
    const last7 = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
      const ds = stats.daily[d] || { downloads: 0, failures: 0 };
      last7.push(`${d.slice(5)}: ${ds.downloads}✅ ${ds.failures}❌`);
    }

    const queueStatus = downloadQueue.getStatus();
    const cacheStats = cache.stats();

    const msg = [
      '📈 <b>Download Statistics</b>',
      '',
      `📊 <b>Total:</b> ${stats.totalDownloads} downloads, ${stats.totalFailures} failures`,
      `📅 <b>Today:</b> ${todayStats.downloads} downloads, ${todayStats.failures} failures`,
      `👥 <b>Unique users:</b> ${stats.uniqueUsers.length}`,
      `👥 <b>Today users:</b> ${todayStats.users?.length || 0}`,
      '',
      '<b>Last 7 days:</b>',
      ...last7,
      '',
      `🔄 <b>Queue:</b> ${queueStatus.active}/${queueStatus.max} active, ${queueStatus.waiting} waiting`,
      `💾 <b>Cache:</b> ${cacheStats.files} files, ${cacheStats.sizeMB}MB`,
      `🚫 <b>Banned:</b> ${dataStore.getBans().length} users`,
    ].join('\n');

    ctx.reply(msg, { parse_mode: 'HTML' }).catch(() => {});
  } catch (err) {
    console.error('[STATS] Error:', err.message);
  }
};

/**
 * /users — list recent users from download log
 */
exports.users = async (ctx) => {
  try {
    if (!isAdmin(ctx.message?.chat.id)) return;

    const stats = dataStore.getStats();
    const downloads = dataStore.getDownloads();

    // Get unique users from recent downloads with last activity
    const userMap = {};
    for (const dl of downloads) {
      if (!userMap[dl.userId]) {
        userMap[dl.userId] = { id: dl.userId, downloads: 0, lastSeen: dl.timestamp };
      }
      userMap[dl.userId].downloads++;
    }

    const users = Object.values(userMap).sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen)).slice(0, 30);

    if (users.length === 0) {
      return ctx.reply('👥 No users yet.', { parse_mode: 'HTML' }).catch(() => {});
    }

    const lines = users.map(u =>
      `• <code>${u.id}</code> — ${u.downloads} downloads, last: ${new Date(u.lastSeen).toLocaleString()}`
    );

    const msg = [
      `👥 <b>Active Users</b> (${stats.uniqueUsers.length} total)`,
      '',
      ...lines,
    ].join('\n');

    ctx.reply(msg, { parse_mode: 'HTML' }).catch(() => {});
  } catch (err) {
    console.error('[USERS] Error:', err.message);
  }
};

/**
 * /history — last 20 downloads
 */
exports.history = async (ctx) => {
  try {
    if (!isAdmin(ctx.message?.chat.id)) return;

    const downloads = dataStore.getDownloads().slice(0, 20);

    if (downloads.length === 0) {
      return ctx.reply('📜 No downloads yet.').catch(() => {});
    }

    const lines = downloads.map(dl => {
      const icon = dl.success ? (dl.cached ? '💾' : '✅') : '❌';
      const time = new Date(dl.timestamp).toLocaleString();
      const doi = dl.doi?.substring(0, 40) || 'unknown';
      return `${icon} <code>${doi}</code> — user:${dl.userId} — ${time}`;
    });

    const msg = [
      '📜 <b>Recent Downloads</b>',
      '',
      ...lines,
    ].join('\n');

    ctx.reply(msg, { parse_mode: 'HTML' }).catch(() => {});
  } catch (err) {
    console.error('[HISTORY] Error:', err.message);
  }
};

/**
 * /ban <user_id> — ban a user
 */
exports.ban = async (ctx) => {
  try {
    if (!isAdmin(ctx.message?.chat.id)) return;

    const parts = ctx.message.text.split(/\s+/);
    const targetId = parseInt(parts[1]);

    if (!targetId || isNaN(targetId)) {
      return ctx.reply('Usage: /ban <user_id>').catch(() => {});
    }

    if (adminChatId.includes(targetId)) {
      return ctx.reply('❌ Cannot ban an admin.').catch(() => {});
    }

    const added = dataStore.banUser(targetId);
    if (added) {
      ctx.reply(`🚫 User <code>${targetId}</code> has been banned.`, { parse_mode: 'HTML' }).catch(() => {});
    } else {
      ctx.reply(`User <code>${targetId}</code> is already banned.`, { parse_mode: 'HTML' }).catch(() => {});
    }
  } catch (err) {
    console.error('[BAN] Error:', err.message);
  }
};

/**
 * /unban <user_id> — unban a user
 */
exports.unban = async (ctx) => {
  try {
    if (!isAdmin(ctx.message?.chat.id)) return;

    const parts = ctx.message.text.split(/\s+/);
    const targetId = parseInt(parts[1]);

    if (!targetId || isNaN(targetId)) {
      return ctx.reply('Usage: /unban <user_id>').catch(() => {});
    }

    const removed = dataStore.unbanUser(targetId);
    if (removed) {
      ctx.reply(`✅ User <code>${targetId}</code> has been unbanned.`, { parse_mode: 'HTML' }).catch(() => {});
    } else {
      ctx.reply(`User <code>${targetId}</code> is not banned.`, { parse_mode: 'HTML' }).catch(() => {});
    }
  } catch (err) {
    console.error('[UNBAN] Error:', err.message);
  }
};

/**
 * /mirrors — show Sci-Hub mirror status (admin only)
 */
exports.mirrors = async (ctx) => {
  try {
    if (!isAdmin(ctx.message?.chat.id)) return;

    const mirrorStatus = mirrorDiscovery.getMirrorStatus();
    const working = mirrorStatus.filter(m => m.status === 'working');
    const down = mirrorStatus.filter(m => m.status !== 'working');

    const lines = ['🪞 <b>Sci-Hub Mirror Status</b>', ''];

    if (working.length > 0) {
      lines.push(`✅ <b>Working (${working.length}):</b>`);
      for (const m of working) {
        const ms = m.responseTime >= 99999 ? '?' : `${m.responseTime}ms`;
        lines.push(`  • <code>${m.url}</code> — ${ms}`);
      }
      lines.push('');
    }

    if (down.length > 0) {
      lines.push(`❌ <b>Down/Unhealthy (${down.length}):</b>`);
      for (const m of down) {
        const checked = m.lastChecked ? new Date(m.lastChecked).toLocaleString() : 'never';
        lines.push(`  • <code>${m.url}</code> — ${m.status} (${checked})`);
      }
    }

    const msg = lines.join('\n');
    ctx.reply(msg, { parse_mode: 'HTML', disable_web_page_preview: true }).catch(() => {});
  } catch (err) {
    console.error('[MIRRORS] Error:', err.message);
  }
};
