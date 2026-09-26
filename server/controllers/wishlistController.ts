import { Response } from 'express';
import { db } from '../database/index.js';
import { AuthRequest } from '../middleware/auth.js';

export const wishlistController = {
  // GET /api/wishlist
  getWishlist: (req: AuthRequest, res: Response) => {
    const userId = req.user?.id;
    const rows = db.prepare('SELECT book_id as bookId FROM wishlist WHERE user_id = ?').all(userId) as any[];
    res.json({ wishlist: rows.map(r => r.bookId) });
  },

  // POST /api/wishlist/:bookId
  addItem: (req: AuthRequest, res: Response) => {
    const userId = req.user?.id;
    const bookId = Number(req.params.bookId);

    const book = db.prepare('SELECT id, title FROM books WHERE id = ?').get(bookId) as any;
    if (!book) {
      return res.status(404).json({ error: 'Book not found.' });
    }

    db.prepare('INSERT OR IGNORE INTO wishlist (user_id, book_id) VALUES (?, ?)').run(userId, bookId);
    res.status(201).json({ success: true, message: `Added "${book.title}" to wishlist.`, bookId });
  },

  // DELETE /api/wishlist/:bookId
  removeItem: (req: AuthRequest, res: Response) => {
    const userId = req.user?.id;
    const bookId = Number(req.params.bookId);

    db.prepare('DELETE FROM wishlist WHERE user_id = ? AND book_id = ?').run(userId, bookId);
    res.json({ success: true, message: 'Removed from wishlist.', bookId });
  },

  // POST /api/wishlist/toggle/:bookId
  toggleItem: (req: AuthRequest, res: Response) => {
    const userId = req.user?.id;
    const bookId = Number(req.params.bookId);

    const existing = db.prepare('SELECT id FROM wishlist WHERE user_id = ? AND book_id = ?').get(userId, bookId);

    if (existing) {
      db.prepare('DELETE FROM wishlist WHERE user_id = ? AND book_id = ?').run(userId, bookId);
      return res.json({ action: 'removed', bookId, isWishlisted: false });
    } else {
      db.prepare('INSERT INTO wishlist (user_id, book_id) VALUES (?, ?)').run(userId, bookId);
      return res.json({ action: 'added', bookId, isWishlisted: true });
    }
  },

  // POST /api/wishlist/sync
  syncWishlist: (req: AuthRequest, res: Response) => {
    const userId = req.user?.id;
    const { guestWishlist } = req.body;

    if (Array.isArray(guestWishlist)) {
      const insertWishlist = db.prepare('INSERT OR IGNORE INTO wishlist (user_id, book_id) VALUES (?, ?)');
      const syncTx = db.transaction(() => {
        for (const id of guestWishlist) {
          if (!isNaN(Number(id))) {
            insertWishlist.run(userId, Number(id));
          }
        }
      });
      syncTx();
    }

    const rows = db.prepare('SELECT book_id as bookId FROM wishlist WHERE user_id = ?').all(userId) as any[];
    res.json({ wishlist: rows.map(r => r.bookId) });
  }
};
