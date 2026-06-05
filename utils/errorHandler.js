require('dotenv').config();

module.exports = ({ err, name, ctx }) => {
  const message = err?.message || 'Unknown error';
  const code = err?.code || '';

  console.error(`ERROR [${name}]: ${message} (${code})`);

  // Don't try to notify user or admin on network errors — just log
  // This prevents cascading failures when Telegram API is unreachable
};
