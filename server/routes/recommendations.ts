import { Router } from 'express';
import { db } from '../db/database.js';
import { ai } from '../services/gemini.js';
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
      return res.json(mockResult);
    } catch (mockErr: any) {
      return res.status(502).json({
        error: 'External AI service error or timeout occurred.',
        isAiGenerated: false
      });
    }
  }

  if (!ai) {
    // Return curated campus picks if Gemini is not configured
    const topBooks = db.prepare(`
      SELECT b.id, b.title, a.name as author, c.name as category, b.price, b.cover_image as coverImage, b.rating
      FROM books b
      JOIN authors a ON b.author_id = a.id
      JOIN categories c ON b.category_id = c.id
      WHERE (b.is_archived IS NULL OR b.is_archived = 0)
      ORDER BY b.rating DESC LIMIT 3
    `).all();

    return res.json({
      recommendation: 'Here are our top rated campus literary and engineering recommendations based on student reviews.',
      suggestedBooks: topBooks,
      isAiGenerated: false
    });
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

    const candidateModels = ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
    let response: any = null;

    // Enforce safe 8-second timeout for AI completion
    const aiTimeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('AI generation timed out')), 8000)
    );

    const generatePromise = (async () => {
      for (const model of candidateModels) {
        try {
          const res = await ai.models.generateContent({
            model,
            contents: prompt
          });
          if (res && res.text) return res;
        } catch (err) {
          console.warn(`Recommendations AI model ${model} failed, trying fallback...`);
        }
      }
      return null;
    })();

    response = await Promise.race([generatePromise, aiTimeoutPromise]);

    if (!response || !response.text) {
      throw new Error('AI recommendation generation failed across candidate models');
    }

    const text = response.text || '{}';
    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanJson);

    const ids = Array.isArray(parsed.recommendedBookIds) ? parsed.recommendedBookIds : [];
    let books: any[] = [];
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      books = db.prepare(`
        SELECT b.id, b.title, a.name as author, c.name as category, b.price, b.discount, b.cover_image as coverImage, b.rating
        FROM books b
        JOIN authors a ON b.author_id = a.id
        JOIN categories c ON b.category_id = c.id
        WHERE b.id IN (${placeholders}) AND (b.is_archived IS NULL OR b.is_archived = 0)
      `).all(...ids);
    }

    res.json({
      recommendation: parsed.explanation || 'Recommended for your academic journey.',
      suggestedBooks: books,
      isAiGenerated: true
    });
  } catch (err: any) {
    // Never leak stack traces or provider internal error structures
    console.error('AI Recommendation processing failure:', err.message || err);
    res.status(502).json({
      error: 'AI recommendation service is temporarily unavailable. Please try again shortly.',
      isAiGenerated: false
    });
  }
});

export default router;
