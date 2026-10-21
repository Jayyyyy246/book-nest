import { Router } from 'express';
import { ordersController } from '../controllers/ordersController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Apply auth to all user order routes
router.use(requireAuth);

router.get('/', ordersController.getOrders);
router.post('/', ordersController.createOrder);
router.get('/:id', ordersController.getOrderById);
router.post('/:id/cancel', ordersController.cancelOrder);
router.patch('/:id/cancel', ordersController.cancelOrder);

export default router;
