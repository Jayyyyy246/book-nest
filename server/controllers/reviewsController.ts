import { Request, Response } from 'express';
import { db } from '../database/index.js';
import { AuthRequest } from '../middleware/auth.js';

export const reviewsController = {
  // GET /api/books/:id/reviews OR /api/reviews/book/:bookId
  getBookReviews: (req: Request, res: Response) => {
    const bookId = req.params.id || req.params.bookId;

    const reviews = db.prepare(`
      SELECT 
        r.id,
        r.book_id as bookId,
        r.user_id as userId,
        u.name as userName,
        r.rating,
        r.title,
        r.comment,
        r.is_verified as isVerified,
        r.created_at as date
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      WHERE r.book_id = ?
      ORDER BY r.created_at DESC
    `).all(bookId);

    const stats = db.prepare(`
      SELECT 
        AVG(rating) as avgRating,
        COUNT(*) as totalReviews
      FROM reviews
      WHERE book_id = ?
    `).get(bookId) as any;

    res.json({
      reviews,
      avgRating: stats?.avgRating ? Number(Number(stats.avgRating).toFixed(1)) : 5.0,
      totalReviews: stats?.totalReviews || 0
    });
  },

  // POST /api/books/:id/reviews OR /api/reviews/book/:bookId
  createReview: (req: AuthRequest, res: Response) => {
    const userId = req.user?.id;
    const bookId = Number(req.params.id || req.params.bookId);
    const { rating, title, comment } = req.body;

    if (!rating || !comment) {
      return res.status(400).json({ error: 'Rating (1-5) and comment are required.' });
    }

    const numRating = Number(rating);
    if (numRating < 1 || numRating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5 stars.' });
    }

    // Check if book exists
    const book = db.prepare('SELECT id FROM books WHERE id = ?').get(bookId);
    if (!book) {
      return res.status(404).json({ error: 'Book not found.' });
    }

    // Check if user has purchased this book for verification badge
    const hasPurchased = (db.prepare(`
      SELECT COUNT(*) as count 
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.user_id = ? AND oi.book_id = ?
    `).get(userId, bookId) as any).count > 0;

    const result = db.prepare(`
      INSERT INTO reviews (book_id, user_id, rating, title, comment, is_verified)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(bookId, userId, numRating, title || null, comment, hasPurchased ? 1 : 0);

    // Update book's average rating in books table
    const avg = (db.prepare('SELECT AVG(rating) as avg FROM reviews WHERE book_id = ?').get(bookId) as any).avg;
    db.prepare('UPDATE books SET rating = ? WHERE id = ?').run(Number(Number(avg).toFixed(2)), bookId);

    const newReview = db.prepare(`
      SELECT 
        r.id,
        r.book_id as bookId,
        r.user_id as userId,
        u.name as userName,
        r.rating,
        r.title,
        r.comment,
        r.is_verified as isVerified,
        r.created_at as date
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      WHERE r.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json({
      success: true,
      message: 'Review posted successfully!',
      review: newReview
    });
  },

  // PUT /api/reviews/:id (Owner only)
  updateReview: (req: AuthRequest, res: Response) => {
    const userId = req.user?.id;
    const { id } = req.params;
    const { rating, title, comment } = req.body;

    const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(id) as any;
    if (!review) {
      return res.status(404).json({ error: 'Review not found.' });
    }

    // Prevent modifying another user's review
    if (review.user_id !== userId && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized. You can only edit your own reviews.' });
    }

    const numRating = rating !== undefined ? Number(rating) : review.rating;
    if (numRating < 1 || numRating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5 stars.' });
    }

    db.prepare(`
      UPDATE reviews SET
        rating = ?,
        title = COALESCE(?, title),
        comment = COALESCE(?, comment)
      WHERE id = ?
    `).run(numRating, title || null, comment || null, id);

    // Update book average rating
    const avg = (db.prepare('SELECT AVG(rating) as avg FROM reviews WHERE book_id = ?').get(review.book_id) as any).avg;
    db.prepare('UPDATE books SET rating = ? WHERE id = ?').run(Number(Number(avg).toFixed(2)), review.book_id);

    const updatedReview = db.prepare(`
      SELECT 
        r.id,
        r.book_id as bookId,
        r.user_id as userId,
        u.name as userName,
        r.rating,
        r.title,
        r.comment,
        r.is_verified as isVerified,
        r.created_at as date
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      WHERE r.id = ?
    `).get(id);

    res.json({
      success: true,
      message: 'Review updated successfully!',
      review: updatedReview
    });
  },

  // DELETE /api/reviews/:id (Owner or Admin only)
  deleteReview: (req: AuthRequest, res: Response) => {
    const userId = req.user?.id;
    const { id } = req.params;

    const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(id) as any;
    if (!review) {
      return res.status(404).json({ error: 'Review not found.' });
    }

    // Prevent deleting another user's review
    if (review.user_id !== userId && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized. You can only delete your own reviews.' });
    }

    db.prepare('DELETE FROM reviews WHERE id = ?').run(id);

    // Recalculate book average rating
    const stats = db.prepare('SELECT AVG(rating) as avg FROM reviews WHERE book_id = ?').get(review.book_id) as any;
    const newRating = stats?.avg ? Number(Number(stats.avg).toFixed(2)) : 5.0;
    db.prepare('UPDATE books SET rating = ? WHERE id = ?').run(newRating, review.book_id);

    res.json({ success: true, message: 'Review deleted successfully.', reviewId: Number(id) });
  }
};
