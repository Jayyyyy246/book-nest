import { Router } from 'express';
import { db } from '../db/database.js';
import { ai, isGeminiConfigured, getGeminiClient } from '../services/gemini.js';
import { requireAuth } from '../middleware/auth.js';
import { aiLimiter } from '../middleware/rateLimiter.js';

const router = Router();

export type AiRecommendationProvider = (params: { query: string; currentBookTitle?: string }) => Promise<{
  recommendation: string;
  suggestedBooks: any[];
  isAiGenerated: boolean;
}>;

let customAiRecommendationProvider: AiRecommendationProvider | null = null;

export function setAiRecommendationProvider(provider: AiRecommendationProvider | null) {
  customAiRecommendationProvider = provider;
}

// Safe diagnostic logger: logs stage, status, category, hasApiKey without leaking secrets
function logAiDiagnostic(stage: string, details: {
  status?: number;
  errorCategory?: string;
  hasApiKey?: boolean;
  model?: string;
  durationMs?: number;
  message?: string;
} = {}) {
  const parts = [
    `[AI Advisor] Stage: ${stage}`,
    details.status !== undefined ? `Status: ${details.status}` : null,
    details.errorCategory ? `ErrorCategory: ${details.errorCategory}` : null,
    details.hasApiKey !== undefined ? `ApiKeyConfigured: ${details.hasApiKey}` : null,
    details.model ? `Model: ${details.model}` : null,
    details.durationMs !== undefined ? `Duration: ${details.durationMs}ms` : null,
    details.message ? `Note: ${details.message}` : null,
  ].filter(Boolean);

  console.log(parts.join(' | '));
}

// Deterministic catalog fallback based on real campus inventory
export function getCatalogFallbackRecommendations(query: string, currentBookTitle?: string) {
  const clean = (query || '').trim().toLowerCase();
  const words = clean.split(/[^a-zA-Z0-9]+/).filter(w => w.length >= 3);

  let excludeClause = '';
  const params: any[] = [];
  if (currentBookTitle && currentBookTitle.trim()) {
    excludeClause = 'AND LOWER(b.title) != LOWER(?)';
    params.push(currentBookTitle.trim());
  }

  // 1. Try keyword search across title, category, description, and author
  let matchingBooks: any[] = [];
  if (words.length > 0) {
    const likeClauses = words.map(() => '(LOWER(b.title) LIKE ? OR LOWER(c.name) LIKE ? OR LOWER(b.description) LIKE ? OR LOWER(a.name) LIKE ?)').join(' OR ');
    const searchParams: any[] = [];
    for (const w of words) {
      const term = `%${w}%`;
      searchParams.push(term, term, term, term);
    }

    matchingBooks = db.prepare(`
      SELECT
        b.id, b.title, a.name as author, c.name as category, c.slug as categorySlug,
        b.price, b.discount, b.rating, b.stock, b.cover_image as coverImage,
        b.isbn, b.publisher, b.pages, b.publication_year as year, b.language, b.description
      FROM books b
      JOIN authors a ON b.author_id = a.id
      JOIN categories c ON b.category_id = c.id
      WHERE (b.is_archived IS NULL OR b.is_archived = 0)
        ${excludeClause}
        AND (${likeClauses})
      ORDER BY b.rating DESC, b.stock DESC
      LIMIT 3
    `).all(...params, ...searchParams) as any[];
  }

  // 2. If no keyword matches, select highest rated catalog titles
  if (matchingBooks.length === 0) {
    matchingBooks = db.prepare(`
      SELECT
        b.id, b.title, a.name as author, c.name as category, c.slug as categorySlug,
        b.price, b.discount, b.rating, b.stock, b.cover_image as coverImage,
        b.isbn, b.publisher, b.pages, b.publication_year as year, b.language, b.description
      FROM books b
      JOIN authors a ON b.author_id = a.id
      JOIN categories c ON b.category_id = c.id
      WHERE (b.is_archived IS NULL OR b.is_archived = 0)
        ${excludeClause}
      ORDER BY b.rating DESC, b.stock DESC
      LIMIT 3
    `).all(...params) as any[];
  }

  if (matchingBooks.length === 0) {
    return {
      recommendation: 'No matching books are currently available in the campus warehouse catalog.',
      suggestedBooks: [],
      isAiGenerated: false
    };
  }

  const titles = matchingBooks.map(b => `"${b.title}"`).join(', ');
  const recommendation = words.length > 0
    ? `Curated campus collection recommendations for "${query}": ${titles}. Selected from verified university textbooks and faculty holdings.`
    : `Top-rated university reading recommendations based on campus scholarly reviews: ${titles}.`;

  return {
    recommendation,
    suggestedBooks: matchingBooks,
    isAiGenerated: false
  };
}

// Frequently Bought Together Bundle for a book
router.get('/bundle/:bookId', (req, res) => {
  const bookId = Number(req.params.bookId);

  const currentBook = db.prepare(`
    SELECT 
      b.id, b.title, a.name as author, c.name as category, c.slug as categorySlug,
      b.price, b.discount, b.rating, b.stock, b.cover_image as coverImage,
      b.isbn, b.publisher, b.pages, b.publication_year as year, b.language, b.description
    FROM books b
    JOIN authors a ON b.author_id = a.id
    JOIN categories c ON b.category_id = c.id
    WHERE b.id = ? AND (b.is_archived IS NULL OR b.is_archived = 0)
  `).get(bookId) as any;

  if (!currentBook) {
    return res.status(404).json({ error: 'Book not found.' });
  }

  // 1. Try finding a co-purchased companion in order_items that is currently active and in stock
  let companionId = null;
  const coPurchase = db.prepare(`
    SELECT oi2.book_id, COUNT(*) as frequency
    FROM order_items oi1
    JOIN order_items oi2 ON oi1.order_id = oi2.order_id
    JOIN books b2 ON oi2.book_id = b2.id
    WHERE oi1.book_id = ? AND oi2.book_id != ? AND (b2.is_archived IS NULL OR b2.is_archived = 0) AND b2.stock > 0
    GROUP BY oi2.book_id
    ORDER BY frequency DESC
    LIMIT 1
  `).get(bookId, bookId) as any;

  if (coPurchase) {
    companionId = coPurchase.book_id;
  } else {
    // 2. Fallback: Find highest rated in same category or another category
    const sameCat = db.prepare(`
      SELECT id FROM books 
      WHERE category_id = (SELECT category_id FROM books WHERE id = ?) AND id != ? AND stock > 0 AND (is_archived IS NULL OR is_archived = 0)
      ORDER BY rating DESC LIMIT 1
    `).get(bookId, bookId) as any;

    if (sameCat) {
      companionId = sameCat.id;
    } else {
      const anyOther = db.prepare('SELECT id FROM books WHERE id != ? AND stock > 0 AND (is_archived IS NULL OR is_archived = 0) ORDER BY rating DESC LIMIT 1').get(bookId) as any;
      companionId = anyOther?.id;
    }
  }

  if (!companionId) {
    return res.json({ bundle: null });
  }

  const companionBook = db.prepare(`
    SELECT 
      b.id, b.title, a.name as author, c.name as category, c.slug as categorySlug,
      b.price, b.discount, b.rating, b.stock, b.cover_image as coverImage,
      b.isbn, b.publisher, b.pages, b.publication_year as year, b.language, b.description
    FROM books b
    JOIN authors a ON b.author_id = a.id
    JOIN categories c ON b.category_id = c.id
    WHERE b.id = ? AND (b.is_archived IS NULL OR b.is_archived = 0)
  `).get(companionId) as any;

  const p1 = Math.round(currentBook.price * (1 - currentBook.discount / 100));
  const p2 = Math.round(companionBook.price * (1 - companionBook.discount / 100));
  const originalTotal = p1 + p2;
  const bundleDiscountPercent = 10;
  const bundlePrice = Math.round(originalTotal * (1 - bundleDiscountPercent / 100));
  const savings = originalTotal - bundlePrice;

  res.json({
    bundle: {
      currentBook,
      companionBook,
      originalTotal,
      bundlePrice,
      savings,
      discountPercent: bundleDiscountPercent
    }
  });
});

// AI Reading Recommendation Advisor
router.post('/ai', requireAuth, aiLimiter, async (req, res) => {
  const { query, currentBookTitle } = req.body;

  // Validate request structure and field types
  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ error: 'Query prompt string is required.' });
  }

  const cleanQuery = query.trim();

  if (cleanQuery.length < 2) {
    return res.status(400).json({ error: 'Query prompt must be at least 2 characters long.' });
  }

  if (cleanQuery.length > 500) {
    return res.status(400).json({ error: 'Query prompt exceeds maximum allowed length of 500 characters.' });
  }

  if (currentBookTitle !== undefined) {
    if (typeof currentBookTitle !== 'string') {
      return res.status(400).json({ error: 'currentBookTitle must be a string.' });
    }
    if (currentBookTitle.length > 200) {
      return res.status(400).json({ error: 'currentBookTitle exceeds maximum allowed length of 200 characters.' });
    }
  }

  const cleanBookTitle = currentBookTitle ? currentBookTitle.trim() : undefined;

  // If mock provider is injected (in tests), execute without calling external AI
  if (customAiRecommendationProvider) {
    try {
      const mockResult = await customAiRecommendationProvider({ query: cleanQuery, currentBookTitle: cleanBookTitle });
      logAiDiagnostic('mock_provider_success', { status: 200, hasApiKey: false });
      return res.json(mockResult);
    } catch (mockErr: any) {
      logAiDiagnostic('mock_provider_error', { status: 502, errorCategory: 'upstream_timeout', hasApiKey: false });
      return res.status(502).json({
        error: 'External AI service error or timeout occurred.',
        isAiGenerated: false
      });
    }
  }

  const hasKey = isGeminiConfigured();
  const geminiClient = getGeminiClient() || ai;
  logAiDiagnostic('request_received', { status: 200, hasApiKey: hasKey });

  if (!geminiClient || !hasKey) {
    logAiDiagnostic('fallback_no_key', { status: 200, hasApiKey: false, message: 'Gemini API key unconfigured, using deterministic catalog fallback' });
    const fallback = getCatalogFallbackRecommendations(cleanQuery, cleanBookTitle);
    return res.json(fallback);
  }

  try {
    const catalogTitles = (db.prepare('SELECT id, title, category_id FROM books WHERE (is_archived IS NULL OR is_archived = 0)').all() as any[])
      .map(b => `ID ${b.id}: "${b.title}"`)
      .join(', ');

    const prompt = `You are the BookNest AI campus literary advisor.
A student asked: "${cleanQuery}".
${cleanBookTitle ? `They are currently reading: "${cleanBookTitle}".` : ''}
Available Books in campus warehouse catalog: [${catalogTitles}].

Provide a warm, intelligent 2-3 sentence recommendation explaining which available book IDs best fit their request. Return STRICT JSON with keys: "explanation" (string), "recommendedBookIds" (array of numbers). Do not include markdown code block syntax.`;

    const candidateModels = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.8-flash'];
    let response: any = null;
    let usedModel: string | null = null;
    const startTime = Date.now();

    for (const model of candidateModels) {
      try {
        logAiDiagnostic('contacting_model', { model, hasApiKey: true });
        const modelPromise = geminiClient.models.generateContent({
          model,
          contents: prompt
        });
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Model ${model} timed out after 5s`)), 5000)
        );

        const res = await Promise.race([modelPromise, timeoutPromise]) as any;
        if (res && res.text) {
          response = res;
          usedModel = model;
          break;
        }
      } catch (modelErr: any) {
        logAiDiagnostic('model_attempt_failed', {
          model,
          errorCategory: 'model_unavailable_or_timeout',
          hasApiKey: true,
          message: modelErr?.message ? String(modelErr.message).slice(0, 60) : 'Model attempt error'
        });
      }
    }

    if (!response || !response.text) {
      logAiDiagnostic('all_models_exhausted', {
        status: 200,
        errorCategory: 'upstream_exhausted',
        hasApiKey: true,
        durationMs: Date.now() - startTime,
        message: 'All AI models exhausted or unavailable, providing deterministic catalog fallback'
      });
      const fallback = getCatalogFallbackRecommendations(cleanQuery, cleanBookTitle);
      return res.json(fallback);
    }

    const durationMs = Date.now() - startTime;
    logAiDiagnostic('provider_success', {
      status: 200,
      model: usedModel || 'unknown',
      durationMs,
      hasApiKey: true
    });

    const text = response.text || '{}';
    const cleanJson = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    let parsed: any = null;
    try {
      const match = cleanJson.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        parsed = JSON.parse(cleanJson);
      }
    } catch {
      logAiDiagnostic('json_parse_fallback', {
        status: 200,
        errorCategory: 'malformed_provider_output',
        hasApiKey: true,
        message: 'AI output was not valid JSON, providing deterministic catalog fallback'
      });
      const fallback = getCatalogFallbackRecommendations(cleanQuery, cleanBookTitle);
      return res.json(fallback);
    }

    const ids = Array.isArray(parsed.recommendedBookIds) ? parsed.recommendedBookIds : [];
    let books: any[] = [];
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      books = db.prepare(`
        SELECT
          b.id, b.title, a.name as author, c.name as category, c.slug as categorySlug,
          b.price, b.discount, b.rating, b.stock, b.cover_image as coverImage,
          b.isbn, b.publisher, b.pages, b.publication_year as year, b.language, b.description
        FROM books b
        JOIN authors a ON b.author_id = a.id
        JOIN categories c ON b.category_id = c.id
        WHERE b.id IN (${placeholders}) AND (b.is_archived IS NULL OR b.is_archived = 0)
      `).all(...ids);
    }

    if (books.length === 0) {
      // If AI recommended book IDs that are not in catalog, fallback to keyword catalog match
      const fallback = getCatalogFallbackRecommendations(cleanQuery, cleanBookTitle);
      return res.json({
        recommendation: parsed.explanation || fallback.recommendation,
        suggestedBooks: fallback.suggestedBooks,
        isAiGenerated: true
      });
    }

    res.json({
      recommendation: parsed.explanation || 'Recommended for your academic journey.',
      suggestedBooks: books,
      isAiGenerated: true
    });
  } catch (err: any) {
    // Safe fallback on unexpected failure: never crash or leave student empty-handed
    logAiDiagnostic('unexpected_failure_fallback', {
      status: 200,
      errorCategory: 'upstream_exception',
      hasApiKey: hasKey,
      message: 'Unexpected provider exception, providing deterministic catalog fallback'
    });
    const fallback = getCatalogFallbackRecommendations(cleanQuery, cleanBookTitle);
    res.json(fallback);
  }
});

export default router;
