const axios = require('axios');
const errorHandler = require('./errorHandler.js');
var HTMLParser = require('node-html-parser');

const errMessage = "Unfortunately, Sci-Hub doesn't have the requested document :-(";

const SCI_HUB_MIRRORS = [
  'https://sci-hub.ru',
  'https://sci-hub.st',
  'https://sci-hub.se',
];

module.exports = async (doi) => {
  for (const mirror of SCI_HUB_MIRRORS) {
    try {
      const searchUrl = `${mirror}/${doi}`;

      const response = await axios.get(searchUrl, {
        maxRedirects: 5,
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      const document = HTMLParser.parse(response.data);
      const pageTitle = document.querySelector('title')?.text || '';

      // Check if Sci-Hub returned a "not found" page
      if (pageTitle.toLowerCase().includes('error') || pageTitle.toLowerCase().includes('not found')) {
        continue; // try next mirror
      }

      // Extract PDF URL — try multiple methods
      let pdfUrl = null;

      // Method 1: <meta name="citation_pdf_url">
      const citationMeta = document.querySelector('meta[name="citation_pdf_url"]');
      if (citationMeta) {
        pdfUrl = citationMeta.getAttribute('content');
      }

      // Method 2: <object> tag with PDF data
      if (!pdfUrl) {
        const objectEl = document.querySelector('object[type="application/pdf"]');
        if (objectEl) {
          pdfUrl = objectEl.getAttribute('data');
        }
      }

      // Method 3: legacy #pdf element (for older Sci-Hub versions)
      if (!pdfUrl) {
        const elementPDF = document.getElementById('pdf');
        if (elementPDF) {
          pdfUrl = elementPDF.getAttribute('src');
        }
      }

      if (!pdfUrl) {
        continue; // try next mirror
      }

      // Normalize URL — add protocol if missing
      if (pdfUrl.startsWith('//')) {
        pdfUrl = 'https:' + pdfUrl;
      } else if (pdfUrl.startsWith('/')) {
        pdfUrl = mirror + pdfUrl;
      }

      // Extract citation
      let citation = '';
      // Try citation div first
      const citationDiv = document.getElementById('citation');
      if (citationDiv && citationDiv.innerText.trim()) {
        citation = citationDiv.innerText.trim();
      } else {
        // Build citation from meta tags
        const title = document.querySelector('meta[name="citation_title"]')?.getAttribute('content') || '';
        const journal = document.querySelector('meta[name="citation_journal_title"]')?.getAttribute('content') || '';
        const year = document.querySelector('meta[name="citation_publication_date"]')?.getAttribute('content') || '';
        const authors = document.querySelectorAll('meta[name="citation_author"]');
        const authorNames = authors.map(a => a.getAttribute('content')).filter(Boolean);
        if (title) {
          citation = title;
          if (authorNames.length) citation += ' — ' + authorNames.join(', ');
          if (journal) citation += ' (' + journal;
          if (year) citation += ', ' + year;
          if (journal) citation += ')';
        }
      }

      return { data: pdfUrl, citation, error: false };
    } catch (err) {
      // Mirror failed, try next
      continue;
    }
  }

  // All mirrors failed
  errorHandler({ err: new Error('All mirrors failed'), name: 'helpers/sciHub.js' });
  return {
    data: null,
    citation: null,
    error: errMessage,
  };
};
