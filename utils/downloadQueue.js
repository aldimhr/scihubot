/**
 * Download Queue — limits concurrent Sci-Hub downloads to MAX_CONCURRENT.
 * Excess requests wait in a FIFO queue and get position feedback.
 */

const MAX_CONCURRENT = 5;
let active = 0;
const waiting = [];

function getStatus() {
  return { active, waiting: waiting.length, max: MAX_CONCURRENT };
}

/**
 * Enqueue a download job.
 * @param {Function} fn - async function to execute
 * @param {Function} onQueue - called with (position, total) when queued
 * @returns {Promise} - resolves with fn()'s return value
 */
function enqueue(fn, onQueue) {
  return new Promise((resolve, reject) => {
    const job = { fn, resolve, reject };

    if (active < MAX_CONCURRENT) {
      active++;
      runJob(job);
    } else {
      waiting.push(job);
      const position = waiting.length;
      const total = active + waiting.length;
      if (onQueue) onQueue(position, total);
    }
  });
}

async function runJob(job) {
  try {
    const result = await job.fn();
    job.resolve(result);
  } catch (err) {
    job.reject(err);
  } finally {
    active--;
    if (waiting.length > 0) {
      active++;
      runJob(waiting.shift());
    }
  }
}

module.exports = { enqueue, getStatus, MAX_CONCURRENT };
