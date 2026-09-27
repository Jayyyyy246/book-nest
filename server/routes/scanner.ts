import { Router } from 'express';
import { db } from '../db/database.js';
import { isGeminiConfigured, analyzeBookCover } from '../services/gemini.js';
import {
  normalizeIsbn,
  isValidIsbn,
  matchBookAgainstCatalog,
  MatchResult
} from '../services/scannerMatcher.js';

const router = Router();

function getFullCatalog(): any[] {
  return db.prepare(`
    SELECT 
      b.id, b.title, a.name as author, c.name as category, c.slug as categorySlug,
      b.price, b.discount, b.rating, b.stock, b.cover_image as coverImage,
      b.isbn, b.publisher, b.pages, b.publication_year as year, b.language, b.description
    FROM books b
    JOIN authors a ON b.author_id = a.id
    JOIN categories c ON b.category_id = c.id
  `).all();
}

/**
 * Searches OpenLibrary by ISBN.
 * Returns genuine metadata without fabricating prices, ratings, or publishers.
 */
async function lookupOpenLibraryByIsbn(cleanIsbn: string): Promise<any | null> {
  try {
    const openLibUrl = `https://openlibrary.org/api/books?bibkeys=ISBN:${cleanIsbn}&format=json&jscmd=data`;
    const openLibRes = await fetch(openLibUrl, { signal: AbortSignal.timeout(4000) });

    if (openLibRes.ok) {
      const data = await openLibRes.json();
      const bookData = data[`ISBN:${cleanIsbn}`];

      if (bookData) {
        return {
          id: -1, // Non-catalog flag
          title: bookData.title || 'Untitled Book',
          author: Array.isArray(bookData.authors)
            ? bookData.authors.map((a: any) => a.name).join(', ')
            : 'Unknown Author',
          isbn: cleanIsbn,
          category: bookData.subjects?.[0]?.name || 'General Literature',
          categorySlug: 'general',
          publisher: bookData.publishers?.[0]?.name || '',
          pages: bookData.number_of_pages || 0,
          year: bookData.publish_date ? parseInt(bookData.publish_date.slice(-4), 10) || 0 : 0,
          language: 'English',
          coverImage: bookData.cover?.large || bookData.cover?.medium || '',
          price: 0, // Honest: 0 indicates unavailable/external, never fabricated
          discount: 0,
          stock: 0, // Clearly marked: not in local warehouse
          rating: 0, // Not fabricated
          description: typeof bookData.notes === 'string'
            ? bookData.notes
            : (typeof bookData.subtitle === 'string'
              ? bookData.subtitle
              : `External publication found via OpenLibrary archive for ISBN ${cleanIsbn}. Currently not stocked in campus warehouse.`),
          isLocalCatalog: false
        };
      }
    }
  } catch (extErr) {
    // OpenLibrary lookup timed out or network error
  }
  return null;
}

/**
 * Searches OpenLibrary by title and author when local catalog has no match.
 */
async function searchOpenLibraryByTitleAuthor(title: string, author?: string): Promise<any | null> {
  if (!title || title.trim().length < 3) return null;
  try {
    const query = new URLSearchParams({
      title: title.trim(),
      limit: '1'
    });
    if (author && author.trim()) {
      query.set('author', author.trim());
    }

    const openLibUrl = `https://openlibrary.org/search.json?${query.toString()}`;
    const openLibRes = await fetch(openLibUrl, { signal: AbortSignal.timeout(4000) });

    if (openLibRes.ok) {
      const data = await openLibRes.json();
      if (Array.isArray(data.docs) && data.docs.length > 0) {
        const doc = data.docs[0];
        const coverId = doc.cover_i;
        const isbn = Array.isArray(doc.isbn) && doc.isbn.length > 0 ? doc.isbn[0] : '';

        return {
          id: -1,
          title: doc.title || title,
          author: Array.isArray(doc.author_name)
            ? doc.author_name.join(', ')
            : (author || 'Unknown Author'),
          isbn,
          category: Array.isArray(doc.subject) && doc.subject.length > 0 ? doc.subject[0] : 'General Literature',
          categorySlug: 'general',
          publisher: Array.isArray(doc.publisher) && doc.publisher.length > 0 ? doc.publisher[0] : '',
          pages: doc.number_of_pages_median || 0,
          year: doc.first_publish_year || 0,
          language: 'English',
          coverImage: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : '',
          price: 0,
          discount: 0,
          stock: 0,
          rating: 0,
          description: `External publication found via OpenLibrary archive for "${doc.title}". Currently not stocked in campus warehouse.`,
          isLocalCatalog: false
        };
      }
    }
  } catch (searchErr) {
    // Search timeout or network error
  }
  return null;
}

/**
 * 1. Direct ISBN / Barcode Lookup
 * Supports ISBN-10, ISBN-13, EAN-13. Normalizes spaces & hyphens.
 * Searches local BookNest catalog first, falls back to OpenLibrary API if not in local warehouse.
 */
router.post('/isbn', async (req, res) => {
  const { isbn } = req.body;

  if (!isbn || typeof isbn !== 'string' || !isbn.trim()) {
    return res.status(400).json({ 
      success: false,
      error: 'A valid ISBN string is required.' 
    });
  }

  const cleanIsbn = normalizeIsbn(isbn);

  if (cleanIsbn.length < 9) {
    return res.status(400).json({
      success: false,
      error: `"${isbn}" is too short to be a valid ISBN or EAN code.`
    });
  }

  const catalog = getFullCatalog();
  const matchResult = matchBookAgainstCatalog({ isbn: cleanIsbn }, catalog);

  // 1. Found in local BookNest campus warehouse
  if (matchResult.matched && matchResult.bestMatch) {
    return res.json({
      success: true,
      matched: true,
      matchType: matchResult.matchType,
      confidence: matchResult.confidence,
      evidence: matchResult.evidence,
      book: { ...matchResult.bestMatch, isLocalCatalog: true },
      candidates: matchResult.candidates,
      isLocalCatalog: true
    });
  }

  // 2. Query external book metadata provider (OpenLibrary) if not found locally
  const externalBook = await lookupOpenLibraryByIsbn(cleanIsbn);
  if (externalBook) {
    return res.json({
      success: true,
      matched: true,
      matchType: 'ISBN_EXACT',
      confidence: 1.0,
      evidence: `Verified ISBN ${cleanIsbn} via OpenLibrary metadata archive (External Catalog).`,
      book: externalBook,
      candidates: [],
      isLocalCatalog: false
    });
  }

  // 3. Genuine honest not found (never invent a fake book)
  return res.status(404).json({
    success: false,
    matched: false,
    matchType: 'NO_MATCH',
    confidence: 0,
    evidence: `No catalog titles or external records found for ISBN ${cleanIsbn}.`,
    error: `No book found matching ISBN "${isbn}" in the BookNest warehouse catalog or external archives.`,
    detectedIsbn: cleanIsbn,
    candidates: []
  });
});

/**
 * 2. Optical Cover / Camera Vision Analysis
 * Runs OCR Title, Author, Publisher extraction and genuine catalog similarity ranking.
 * Implements full fallback pipeline:
 * 1. Barcode/ISBN check -> Local catalog -> OpenLibrary
 * 2. Title + Author check -> Local catalog -> OpenLibrary
 * 3. Honest rejection with clear reason (Text unclear, No book, Not configured, etc.)
 */
router.post('/analyze', async (req, res) => {
  const { imageBase64, mimeType } = req.body;

  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return res.status(400).json({ 
      success: false, 
      error: 'Base64 image data is required.' 
    });
  }

  // Validate supported file format
  const validMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const effectiveMime = mimeType ? mimeType.toLowerCase() : 'image/jpeg';
  if (!validMimes.includes(effectiveMime)) {
    return res.status(400).json({
      success: false,
      error: `Unsupported image format (${effectiveMime}). Only JPG, JPEG, PNG, and WEBP images are supported.`
    });
  }

  // Validate maximum image payload size (10MB base64 ~ 14M characters)
  if (imageBase64.length > 14 * 1024 * 1024) {
    return res.status(413).json({
      success: false,
      error: 'Image file size exceeds the 10MB limit. Please upload a compressed or standard photo.'
    });
  }

  // Check Gemini configuration before proceeding (BUG 4)
  if (!isGeminiConfigured()) {
    return res.status(503).json({
      success: false,
      matched: false,
      matchType: 'VISION_CONFIGURATION_ERROR',
      error: 'Gemini Vision is not configured on the backend.'
    });
  }

  try {
    const catalog = getFullCatalog();
    const extracted = await analyzeBookCover(imageBase64, effectiveMime);

    if (!extracted) {
      return res.status(404).json({
        success: false,
        matched: false,
        matchType: 'NO_MATCH',
        confidence: 0,
        error: 'Machine vision analysis failed to process the image frame.',
        candidates: []
      });
    }

    // Check if the image does not depict a book (BUG 9 state 5)
    if (extracted.isBook === false) {
      return res.status(404).json({
        success: false,
        matched: false,
        matchType: 'NO_BOOK_DETECTED',
        confidence: 0,
        error: 'The captured image does not appear to contain a book cover, spine, or barcode.',
        detectedMetadata: extracted,
        candidates: []
      });
    }

    // Check if image depicts a book but text is unclear/blurry (BUG 9 state 4)
    if (extracted.textUnclear || !extracted.hasOcrData) {
      return res.status(404).json({
        success: false,
        matched: false,
        matchType: 'TEXT_UNCLEAR',
        confidence: 0,
        error: 'Book cover detected, but printed text or barcode is too blurry or unclear to read reliably.',
        detectedMetadata: extracted,
        candidates: []
      });
    }

    // Step A: If machine vision detected a visible ISBN barcode/text
    if (extracted.isbn) {
      const cleanIsbn = normalizeIsbn(extracted.isbn);
      const isbnMatch = matchBookAgainstCatalog({ isbn: cleanIsbn }, catalog);

      if (isbnMatch.matched && isbnMatch.bestMatch) {
        return res.json({
          success: true,
          matched: true,
          matchType: 'ISBN_EXACT',
          confidence: 1.0,
          evidence: `Deterministic match on visible ISBN ${extracted.isbn} detected by machine vision.`,
          book: { ...isbnMatch.bestMatch, isLocalCatalog: true },
          candidates: isbnMatch.candidates,
          detectedMetadata: extracted,
          isLocalCatalog: true
        });
      }

      // Check OpenLibrary for this ISBN if not found in local catalog
      const externalBook = await lookupOpenLibraryByIsbn(cleanIsbn);
      if (externalBook) {
        return res.json({
          success: true,
          matched: true,
          matchType: 'ISBN_EXTERNAL',
          confidence: 1.0,
          evidence: `Machine vision detected ISBN ${cleanIsbn}. Verified via OpenLibrary archive (Not stocked locally).`,
          book: externalBook,
          candidates: [],
          detectedMetadata: extracted,
          isLocalCatalog: false
        });
      }
    }

    // Step B: Match Title + Author (+ rawTextLines) against BookNest local catalog
    const matchResult: MatchResult = matchBookAgainstCatalog({
      isbn: extracted.isbn,
      title: extracted.title,
      author: extracted.author,
      publisher: extracted.publisher,
      rawTextLines: extracted.rawTextLines
    }, catalog);

    // 1. Confident single local match (>= 0.80)
    if (matchResult.matched && matchResult.bestMatch) {
      return res.json({
        success: true,
        matched: true,
        matchType: matchResult.matchType,
        confidence: matchResult.confidence,
        evidence: matchResult.evidence,
        book: { ...matchResult.bestMatch, isLocalCatalog: true },
        candidates: matchResult.candidates,
        detectedMetadata: extracted,
        isLocalCatalog: true
      });
    }

    // 2. Multiple possible matches found in local catalog
    if (matchResult.candidates.length > 0) {
      return res.json({
        success: true,
        matched: false,
        matchType: 'MULTIPLE_POSSIBLE_MATCHES',
        confidence: matchResult.confidence,
        evidence: `Multiple possible catalog matches detected for extracted text "${extracted.title || 'Book Cover'}".`,
        book: null,
        candidates: matchResult.candidates,
        detectedMetadata: extracted,
        isLocalCatalog: true
      });
    }

    // Step C: Fallback to OpenLibrary external title/author lookup (BUG 2 Fallback 6)
    if (extracted.title) {
      const extBookByTitle = await searchOpenLibraryByTitleAuthor(extracted.title, extracted.author);
      if (extBookByTitle) {
        return res.json({
          success: true,
          matched: true,
          matchType: 'EXTERNAL_TITLE_MATCH',
          confidence: 0.85,
          evidence: `Identified "${extBookByTitle.title}" via OpenLibrary external archive. Currently not stocked in BookNest warehouse.`,
          book: extBookByTitle,
          candidates: [],
          detectedMetadata: extracted,
          isLocalCatalog: false
        });
      }
    }

    // 3. Extracted text was readable, but zero catalog or external records matched
    return res.status(404).json({
      success: false,
      matched: false,
      matchType: 'NO_MATCH',
      confidence: 0,
      evidence: matchResult.evidence,
      error: `Extracted text "${extracted.title || 'Unknown Title'}" was detected, but it does not match any current BookNest warehouse catalog or external library records.`,
      detectedMetadata: extracted,
      candidates: []
    });

  } catch (err: any) {
    console.error('Optical scanner error:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message || 'Optical vision analysis failed.' 
    });
  }
});

/**
 * 3. Textual / Title / Metadata Search Matcher
 * Runs the deterministic matcher on arbitrary user query or explicit metadata.
 */
router.post('/match-text', (req, res) => {
  const { query, title, author, isbn, rawTextLines } = req.body;

  const catalog = getFullCatalog();

  // If structured metadata was provided (for testing or direct lookup)
  if (title || author || isbn) {
    const matchResult = matchBookAgainstCatalog({ title, author, isbn, rawTextLines }, catalog);
    return res.json({
      success: true,
      matched: matchResult.matched,
      matchType: matchResult.matchType,
      confidence: matchResult.confidence,
      evidence: matchResult.evidence,
      book: matchResult.bestMatch ? { ...matchResult.bestMatch, isLocalCatalog: true } : null,
      candidates: matchResult.candidates
    });
  }

  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ error: 'Search query is required.' });
  }

  const isDigits = /^[0-9X-]+$/i.test(query.trim());

  const matchResult = isDigits
    ? matchBookAgainstCatalog({ isbn: query.trim() }, catalog)
    : matchBookAgainstCatalog({ title: query.trim() }, catalog);

  res.json({
    success: true,
    matched: matchResult.matched,
    matchType: matchResult.matchType,
    confidence: matchResult.confidence,
    evidence: matchResult.evidence,
    book: matchResult.bestMatch ? { ...matchResult.bestMatch, isLocalCatalog: true } : null,
    candidates: matchResult.candidates
  });
});

export default router;
