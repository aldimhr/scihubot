const { PDFDocument } = require('pdf-lib');
const { formatSize } = require('./pdfSize.js');

const MAX_CHUNK_SIZE = 45 * 1024 * 1024; // 45 MB (5 MB buffer below Telegram's 50 MB)

/**
 * Split a PDF buffer into chunks that each fit within Telegram's file limit.
 * @param {Buffer} pdfBuffer - The full PDF file
 * @param {string} baseName - Base filename (without .pdf)
 * @returns {Promise<{ parts: Array<{ data: Buffer, filename: string, index: number }>, error: string|null }>}
 */
async function splitPDF(pdfBuffer, baseName) {
  try {
    const srcDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    const totalPages = srcDoc.getPageCount();

    if (totalPages <= 1) {
      return { parts: [], error: 'PDF has only 1 page — cannot split further' };
    }

    // Estimate pages per chunk based on average page size
    const avgPageSize = pdfBuffer.length / totalPages;
    let pagesPerChunk = Math.max(1, Math.floor(MAX_CHUNK_SIZE / avgPageSize));
    // Ensure we don't create more chunks than needed
    pagesPerChunk = Math.min(pagesPerChunk, totalPages);

    console.log(`[PDF-SPLIT] Total: ${totalPages} pages, avg: ${formatSize(avgPageSize)}/page, target: ${pagesPerChunk} pages/chunk`);

    const parts = [];
    let startPage = 0;
    let attempt = 0;
    const MAX_ATTEMPTS = 3;

    while (startPage < totalPages) {
      let endPage = Math.min(startPage + pagesPerChunk, totalPages);
      let chunkData = null;

      // Try to create this chunk, reduce pages if too large
      for (let retry = 0; retry < MAX_ATTEMPTS; retry++) {
        const chunkDoc = await PDFDocument.create();

        // Copy pages from source
        const pageIndices = [];
        for (let i = startPage; i < endPage; i++) {
          pageIndices.push(i);
        }

        const copiedPages = await chunkDoc.copyPages(srcDoc, pageIndices);
        copiedPages.forEach(page => chunkDoc.addPage(page));

        chunkData = await chunkDoc.save();

        if (chunkData.length <= MAX_CHUNK_SIZE || endPage - startPage <= 1) {
          // Chunk is small enough, or we can't split further
          break;
        }

        // Chunk too large — reduce pages
        const ratio = MAX_CHUNK_SIZE / chunkData.length;
        const newPages = Math.max(1, Math.floor((endPage - startPage) * ratio * 0.9));
        endPage = startPage + newPages;
        console.log(`[PDF-SPLIT] Chunk too large (${formatSize(chunkData.length)}), reducing to ${newPages} pages`);
      }

      const partNum = parts.length + 1;
      const filename = `${baseName}_part${partNum}.pdf`;
      parts.push({
        data: Buffer.from(chunkData),
        filename,
        index: partNum,
        pages: `${startPage + 1}-${endPage}`,
      });

      console.log(`[PDF-SPLIT] Part ${partNum}: pages ${startPage + 1}-${endPage} (${formatSize(chunkData.length)})`);
      startPage = endPage;
    }

    if (parts.length <= 1) {
      return { parts: [], error: 'Split produced only 1 part — file may be unsplitable' };
    }

    return { parts, error: null };
  } catch (err) {
    console.error('[PDF-SPLIT] Error:', err.message);
    return { parts: [], error: `Split failed: ${err.message}` };
  }
}

module.exports = { splitPDF, MAX_CHUNK_SIZE };
