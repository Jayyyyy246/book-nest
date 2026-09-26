import { Router } from 'express';
import { wishlistController } from '../controllers/wishlistController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Apply auth to all wishlist routes
router.use(requireAuth);

router.get('/', wishlistController.getWishlist);
router.post('/toggle/:bookId', wishlistController.toggleItem);
router.post('/sync', wishlistController.syncWishlist);
router.post('/:bookId', wishlistController.addItem);
router.delete('/:bookId', wishlistController.removeItem);

export default router;
