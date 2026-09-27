import { Router } from 'express';
import { db } from '../db/database.js';
import { ai } from '../services/gemini.js';

const router = Router();

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
    WHERE b.id = ?
  `).get(bookId) as any;

  if (!currentBook) {
    return res.status(404).json({ error: 'Book not found.' });
  }

  // 1. Try finding a co-purchased companion in order_items
  let companionId = null;
  const coPurchase = db.prepare(`
    SELECT oi2.book_id, COUNT(*) as frequency
    FROM order_items oi1
    JOIN order_items oi2 ON oi1.order_id = oi2.order_id
    WHERE oi1.book_id = ? AND oi2.book_id != ?
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
      WHERE category_id = (SELECT category_id FROM books WHERE id = ?) AND id != ? AND stock > 0
      ORDER BY rating DESC LIMIT 1
    `).get(bookId, bookId) as any;

    if (sameCat) {
      companionId = sameCat.id;
    } else {
      const anyOther = db.prepare('SELECT id FROM books WHERE id != ? AND stock > 0 ORDER BY rating DESC LIMIT 1').get(bookId) as any;
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
    WHERE b.id = ?
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
router.post('/ai', async (req, res) => {
  const { query, currentBookTitle } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'Query prompt is required.' });
  }

  if (!ai) {
    // Return curated campus picks if Gemini is not configured
    const topBooks = db.prepare(`
      SELECT b.id, b.title, a.name as author, c.name as category, b.price, b.cover_image as coverImage, b.rating
      FROM books b
      JOIN authors a ON b.author_id = a.id
      JOIN categories c ON b.category_id = c.id
      ORDER BY b.rating DESC LIMIT 3
    `).all();

    return res.json({
      recommendation: 'Here are our top rated campus literary and engineering recommendations based on student reviews.',
      suggestedBooks: topBooks,
      isAiGenerated: false
    });
  }

  try {
    const catalogTitles = (db.prepare('SELECT id, title, category_id FROM books').all() as any[]).map(b => `ID ${b.id}: "${b.title}"`).join(', ');

    const prompt = `You are the BookNest AI campus literary advisor.
A student asked: "${query}".
${currentBookTitle ? `They are currently reading: "${currentBookTitle}".` : ''}
Available Books in campus warehouse catalog: [${catalogTitles}].

Provide a warm, intelligent 2-3 sentence recommendation explaining which available book IDs best fit their request. Return STRICT JSON with keys: "explanation" (string), "recommendedBookIds" (array of numbers). Do not include markdown code block syntax.`;

    const candidateModels = ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
    let response: any = null;
    for (const model of candidateModels) {
      try {
        response = await ai.models.generateContent({
          model,
          contents: prompt
        });
        if (response && response.text) break;
      } catch (err) {
        console.warn(`Recommendations AI model ${model} failed, trying fallback...`);
      }
    }
    if (!response || !response.text) {
      throw new Error('AI recommendation generation failed across all candidate models');
    }

    const text = response.text || '{}';
    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanJson);

    const ids = parsed.recommendedBookIds || [];
    let books: any[] = [];
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      books = db.prepare(`
        SELECT b.id, b.title, a.name as author, c.name as category, b.price, b.discount, b.cover_image as coverImage, b.rating
        FROM books b
        JOIN authors a ON b.author_id = a.id
        JOIN categories c ON b.category_id = c.id
        WHERE b.id IN (${placeholders})
      `).all(...ids);
    }

    res.json({
      recommendation: parsed.explanation || 'Recommended for your academic journey.',
      suggestedBooks: books,
      isAiGenerated: true
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
