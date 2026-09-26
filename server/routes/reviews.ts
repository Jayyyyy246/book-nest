import { Router } from 'express';
import { reviewsController } from '../controllers/reviewsController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/reviews/book/:bookId
router.get('/book/:bookId', reviewsController.getBookReviews);

// POST /api/reviews/book/:bookId (Authenticated)
router.post('/book/:bookId', requireAuth, reviewsController.createReview);

// PUT /api/reviews/:id (Owner only)
router.put('/:id', requireAuth, reviewsController.updateReview);

// DELETE /api/reviews/:id (Owner or Admin only)
router.delete('/:id', requireAuth, reviewsController.deleteReview);

export default router;
