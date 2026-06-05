const axios = require('axios');
const errorHandler = require('./errorHandler.js');
const { isPDF } = require('./isPDF.js');

const errMsg = "Unfortunately, Sci-Hub doesn't have the requested document :-(";

const MIN_PDF_SIZE = 1024; // 1KB minimum — anything smaller is likely an error page

module.exports = async function (url) {
  try {
    const res = await axios({
      method: 'get',
      url,
      responseType: 'arraybuffer',
      timeout: 60000,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      // Don't throw on non-2xx so we can inspect the response
      validateStatus: (status) => status >= 200 && status < 400,
    });

    const contentType = (res.headers['content-type'] || '').toLowerCase();
    const data = res.data;

    // Check HTTP status
    if (res.status !== 200) {
      console.error(`[DOWNLOAD] Non-200 status: ${res.status}`);
      return { data: null, error: errMsg };
    }

    // Check Content-Type — should be PDF
    if (contentType && !contentType.includes('pdf') && !contentType.includes('octet-stream')) {
      console.error(`[DOWNLOAD] Wrong content-type: ${contentType}`);
      return { data: null, error: errMsg };
    }

    // Check minimum size
    if (!data || data.length < MIN_PDF_SIZE) {
      console.error(`[DOWNLOAD] File too small: ${data ? data.length : 0} bytes`);
      return { data: null, error: errMsg };
    }

    // Check PDF magic bytes
    if (!isPDF(data)) {
      console.error(`[DOWNLOAD] Not a valid PDF (magic bytes check failed)`);
      return { data: null, error: errMsg };
    }

    console.log(`[DOWNLOAD] ✅ Valid PDF: ${(data.length / 1024 / 1024).toFixed(2)}MB`);
    return { data, error: false };

  } catch (err) {
    console.error('[DOWNLOAD] Error:', err.message);
    errorHandler({ err, name: 'helpers/downloadFile.js' });
    return { data: null, error: errMsg };
  }
};
