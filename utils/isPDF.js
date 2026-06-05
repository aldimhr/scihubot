exports.isPDF = (buf) => {
  // Check for PDF magic bytes at start — reliable indicator
  // Don't require %%EOF — some valid PDFs (cross-ref streams) omit it
  return Buffer.isBuffer(buf) && buf.length >= 1024 && buf.slice(0, 5).toString() === '%PDF-';
};
