/**
 * In-memory state tracking users who tapped "Search Document" and are
 * waiting to type keywords.  Entry auto-expires after 2 minutes.
 */

const pendingSearch = new Map(); // chatId -> timestamp
const STATE_TTL = 2 * 60 * 1000;

function setPending(chatId) {
  pendingSearch.set(chatId, Date.now());
}

function isPending(chatId) {
  const ts = pendingSearch.get(chatId);
  if (!ts) return false;
  if (Date.now() - ts > STATE_TTL) {
    pendingSearch.delete(chatId);
    return false;
  }
  return true;
}

function clearPending(chatId) {
  pendingSearch.delete(chatId);
}

module.exports = { setPending, isPending, clearPending };
