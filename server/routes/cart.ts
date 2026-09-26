import { Router } from 'express';
import { cartController } from '../controllers/cartController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Apply auth to all cart routes - cart persists per authenticated user
router.use(requireAuth);

router.get('/', cartController.getCart);
router.post('/items', cartController.addItem);
router.put('/items/:bookId', cartController.updateItem);
router.delete('/items/:bookId', cartController.removeItem);
router.delete('/', cartController.clearCart);
router.post('/sync', cartController.syncCart);

export default router;
