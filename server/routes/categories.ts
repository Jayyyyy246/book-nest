import { Router } from 'express';
import { db } from '../db/database.js';

const router = Router();

// Get categories with dynamic book count
router.get('/', (req, res) => {
  const categories = db.prepare(`
    SELECT 
      c.id,
      c.name,
      c.slug,
      c.description,
      c.icon,
      c.color,
      c.accent_bg as accentBg,
      COUNT(b.id) as count
    FROM categories c
    LEFT JOIN books b ON b.category_id = c.id
    GROUP BY c.id
    ORDER BY c.id ASC
  `).all();

  // Also include the total "All Categories" count
  const totalBooks = (db.prepare('SELECT COUNT(*) as count FROM books').get() as any).count;

  const allCategory = {
    id: 0,
    name: 'All Categories',
    slug: 'all',
    icon: 'fa-solid fa-shapes',
    color: 'text-amber-600',
    accentBg: 'bg-amber-50',
    count: totalBooks,
    description: 'Explore the complete BookNest collection'
  };

  res.json({
    categories: [allCategory, ...categories],
    totalBooks
  });
});

export default router;
