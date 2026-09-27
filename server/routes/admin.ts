import { Router } from 'express';
import { db } from '../db/database.js';
import { requireAdmin, AuthRequest } from '../middleware/auth.js';
import { booksController } from '../controllers/booksController.js';

const router = Router();

// Apply admin privilege check to all admin routes
router.use(requireAdmin);

// Dashboard metrics computed from real database records
router.get('/metrics', (req, res) => {
  const totalRevenue = (db.prepare('SELECT COALESCE(SUM(grand_total), 0) as total FROM orders').get() as any).total;
  const totalOrders = (db.prepare('SELECT COUNT(*) as count FROM orders').get() as any).count;
  const totalBooks = (db.prepare('SELECT COUNT(*) as count FROM books').get() as any).count;
  const totalStockUnits = (db.prepare('SELECT COALESCE(SUM(stock), 0) as total FROM books').get() as any).total;
  const lowStockCount = (db.prepare('SELECT COUNT(*) as count FROM books WHERE stock <= 10').get() as any).count;

  // Real breakdown of orders by status from SQLite
  const ordersByStatus = db.prepare(`
    SELECT status, COUNT(*) as count, COALESCE(SUM(grand_total), 0) as total
    FROM orders
    GROUP BY status
  `).all() as any[];

  // Real recent daily sales volume from SQLite
  const recentSales = db.prepare(`
    SELECT 
      DATE(created_at) as date,
      COUNT(*) as ordersCount,
      COALESCE(SUM(grand_total), 0) as dailyTotal
    FROM orders
    GROUP BY DATE(created_at)
    ORDER BY date DESC
    LIMIT 7
  `).all() as any[];

  // Real category inventory distribution
  const categoryBreakdown = db.prepare(`
    SELECT c.name as category, COUNT(b.id) as bookCount, COALESCE(SUM(b.stock), 0) as stockCount
    FROM categories c
    LEFT JOIN books b ON b.category_id = c.id
    GROUP BY c.id, c.name
    ORDER BY bookCount DESC
  `).all() as any[];

  res.json({
    metrics: {
      totalRevenue,
      totalOrders,
      totalBooks,
      totalStockUnits,
      lowStockCount,
      ordersByStatus,
      recentSales,
      categoryBreakdown
    }
  });
});

// Get all orders across the campus
router.get('/orders', (req, res) => {
  const orders = db.prepare(`
    SELECT 
      o.id,
      o.order_number as orderNumber,
      o.user_id as userId,
      u.name as customerName,
      u.email as customerEmail,
      o.full_name as recipientName,
      o.hostel_block as hostelBlock,
      o.room_no as roomNo,
      o.phone,
      o.grand_total as total,
      o.status,
      o.payment_method as payment,
      o.payment_status as paymentStatus,
      o.created_at as date,
      (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) as itemsCount
    FROM orders o
    JOIN users u ON o.user_id = u.id
    ORDER BY o.created_at DESC
  `).all() as any[];

  // Format date and room for admin table view
  const formattedOrders = orders.map(o => ({
    id: o.id,
    customerName: o.recipientName || o.customerName,
    room: `${o.hostelBlock}, ${o.roomNo}`,
    total: o.total,
    status: o.status,
    date: new Date(o.date).toLocaleDateString('en-IN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }),
    itemsCount: o.itemsCount,
    payment: o.payment
  }));

  res.json({ orders: formattedOrders });
});

// Update order dispatch status (Supports both PUT and PATCH)
const updateStatusHandler = (req: any, res: any) => {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ['Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
  }

  const result = db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Order not found.' });
  }

  res.json({ success: true, message: `Order #${id} status updated to ${status}.`, orderId: Number(id), status });
};

router.patch('/orders/:id/status', updateStatusHandler);
router.put('/orders/:id/status', updateStatusHandler);

// Add new book to catalog
router.post('/books', (req, res) => {
  const {
    title,
    author,
    category,
    price,
    discount = 0,
    stock = 10,
    isbn,
    publisher = 'Campus Academic Press',
    pages = 300,
    year = 2024,
    language = 'English',
    description = '',
    coverImage = 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&auto=format&fit=crop&q=80'
  } = req.body;

  return booksController.createBook(req, res);
});

// Update book details
router.put('/books/:id', booksController.updateBook);

// Update stock level
router.patch('/books/:id/stock', booksController.updateStock);

// Delete book
router.delete('/books/:id', booksController.deleteBook);

export default router;
