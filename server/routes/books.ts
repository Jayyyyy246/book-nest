import { Router } from 'express';
import { booksController } from '../controllers/booksController.js';
import { reviewsController } from '../controllers/reviewsController.js';
import { requireAdmin, optionalAuth, requireAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/books/search?q=
router.get('/search', optionalAuth, booksController.searchBooks);

// GET /api/books/category/:category
router.get('/category/:category', booksController.getBooksByCategory);

// GET /api/books
router.get('/', booksController.getBooks);

// POST /api/books (Admin required)
router.post('/', requireAdmin, booksController.createBook);

// GET /api/books/:id
router.get('/:id', optionalAuth, booksController.getBookById);

// PUT /api/books/:id (Admin required)
router.put('/:id', requireAdmin, booksController.updateBook);

// DELETE /api/books/:id (Admin required)
router.delete('/:id', requireAdmin, booksController.deleteBook);

// GET /api/books/:id/reviews
router.get('/:id/reviews', reviewsController.getBookReviews);

// POST /api/books/:id/reviews (Authenticated)
router.post('/:id/reviews', requireAuth, reviewsController.createReview);

export default router;
