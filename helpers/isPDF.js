module.exports = function isPDF(buf) {
  return Buffer.isBuffer(buf) && buf.lastIndexOf('%PDF-') === 0 && buf.lastIndexOf('%%EOF') > -1;
};
