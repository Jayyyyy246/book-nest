import { Response } from 'express';
import { db } from '../database/index.js';
import { AuthRequest } from '../middleware/auth.js';

export const cartController = {
  // GET /api/cart
  getCart: (req: AuthRequest, res: Response) => {
    const userId = req.user?.id;

    const items = db.prepare(`
      SELECT 
        ci.id as cartItemId,
        ci.book_id as bookId,
        ci.quantity,
        b.id,
        b.title,
        a.name as author,
        c.name as category,
        c.slug as categorySlug,
        b.price,
        b.discount,
        b.stock,
        b.cover_image as coverImage,
        b.isbn
      FROM cart_items ci
      JOIN books b ON ci.book_id = b.id
      JOIN authors a ON b.author_id = a.id
      JOIN categories c ON b.category_id = c.id
      WHERE ci.user_id = ?
      ORDER BY ci.created_at ASC
    `).all(userId) as any[];

    const cartMap: Record<number, number> = {};
    items.forEach(item => {
      cartMap[item.bookId] = item.quantity;
    });

    res.json({
      items,
      cart: cartMap,
      count: items.reduce((sum, item) => sum + item.quantity, 0)
    });
  },

  // POST /api/cart/items
  addItem: (req: AuthRequest, res: Response) => {
    const userId = req.user?.id;
    const { bookId, quantity = 1 } = req.body;

    if (!bookId) {
      return res.status(400).json({ error: 'bookId is required.' });
    }

    const book = db.prepare('SELECT id, title, stock, is_archived FROM books WHERE id = ?').get(bookId) as any;
    if (!book) {
      return res.status(404).json({ error: 'Book not found.' });
    }

    if (book.is_archived === 1) {
      return res.status(400).json({ error: `"${book.title}" is archived and no longer available.` });
    }

    if (book.stock <= 0) {
      return res.status(400).json({ error: `"${book.title}" is out of stock.` });
    }

    const existing = db.prepare('SELECT id, quantity FROM cart_items WHERE user_id = ? AND book_id = ?').get(userId, bookId) as any;
    const targetQty = existing ? existing.quantity + quantity : quantity;

    if (targetQty > book.stock) {
      return res.status(400).json({ error: `Cannot add more. Only ${book.stock} units available in campus stock.` });
    }

    if (existing) {
      db.prepare('UPDATE cart_items SET quantity = ? WHERE id = ?').run(targetQty, existing.id);
    } else {
      db.prepare('INSERT INTO cart_items (user_id, book_id, quantity) VALUES (?, ?, ?)').run(userId, bookId, targetQty);
    }

    // Update cart header timestamp
    db.prepare(`
      INSERT INTO cart (user_id, updated_at) VALUES (?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
    `).run(userId);

    res.json({ success: true, message: `Added "${book.title}" to cart.`, bookId, quantity: targetQty });
  },

  // PUT /api/cart/items/:bookId
  updateItem: (req: AuthRequest, res: Response) => {
    const userId = req.user?.id;
    const bookId = Number(req.params.bookId);
    const { quantity } = req.body;

    if (quantity <= 0) {
      db.prepare('DELETE FROM cart_items WHERE user_id = ? AND book_id = ?').run(userId, bookId);
      return res.json({ success: true, message: 'Item removed from cart.', bookId, quantity: 0 });
    }

    const book = db.prepare('SELECT id, title, stock, is_archived FROM books WHERE id = ?').get(bookId) as any;
    if (!book) {
      return res.status(404).json({ error: 'Book not found.' });
    }

    if (book.is_archived === 1) {
      return res.status(400).json({ error: `"${book.title}" is archived and no longer available.` });
    }

    if (quantity > book.stock) {
      return res.status(400).json({ error: `Only ${book.stock} units available in campus stock.` });
    }

    db.prepare(`
      INSERT INTO cart_items (user_id, book_id, quantity) 
      VALUES (?, ?, ?)
      ON CONFLICT(user_id, book_id) DO UPDATE SET quantity = excluded.quantity
    `).run(userId, bookId, quantity);

    db.prepare(`
      INSERT INTO cart (user_id, updated_at) VALUES (?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
    `).run(userId);

    res.json({ success: true, bookId, quantity });
  },

  // DELETE /api/cart/items/:bookId
  removeItem: (req: AuthRequest, res: Response) => {
    const userId = req.user?.id;
    const bookId = Number(req.params.bookId);

    db.prepare('DELETE FROM cart_items WHERE user_id = ? AND book_id = ?').run(userId, bookId);
    res.json({ success: true, message: 'Item removed from cart.', bookId });
  },

  // DELETE /api/cart
  clearCart: (req: AuthRequest, res: Response) => {
    const userId = req.user?.id;
    db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(userId);
    res.json({ success: true, message: 'Cart cleared.' });
  },

  // POST /api/cart/sync (Merge guest cart upon login)
  syncCart: (req: AuthRequest, res: Response) => {
    const userId = req.user?.id;
    const { guestCart } = req.body;

    if (!guestCart || typeof guestCart !== 'object') {
      return res.status(400).json({ error: 'Invalid guest cart data.' });
    }

    const syncTx = db.transaction(() => {
      for (const [bookIdStr, qty] of Object.entries(guestCart)) {
        const bookId = Number(bookIdStr);
        const quantity = Number(qty);
        if (quantity > 0) {
          const book = db.prepare('SELECT id, stock FROM books WHERE id = ?').get(bookId) as any;
          if (book && book.stock > 0) {
            const finalQty = Math.min(book.stock, quantity);
            db.prepare(`
              INSERT INTO cart_items (user_id, book_id, quantity)
              VALUES (?, ?, ?)
              ON CONFLICT(user_id, book_id) DO UPDATE SET quantity = MAX(cart_items.quantity, excluded.quantity)
            `).run(userId, bookId, finalQty);
          }
        }
      }
    });

    syncTx();

    const items = db.prepare('SELECT book_id as bookId, quantity FROM cart_items WHERE user_id = ?').all(userId) as any[];
    const cartMap: Record<number, number> = {};
    items.forEach(i => { cartMap[i.bookId] = i.quantity; });

    res.json({ success: true, cart: cartMap });
  }
};
