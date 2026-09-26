import { Router } from 'express';
import { db } from '../db/database.js';
import { requireAdmin, AuthRequest } from '../middleware/auth.js';

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

  if (!title || !author || !category || !price || !isbn) {
    return res.status(400).json({ error: 'Title, author, category, price, and ISBN are required.' });
  }

  // Ensure category exists
  let cat = db.prepare('SELECT id FROM categories WHERE name = ? OR slug = ?').get(category, category.toLowerCase().replace(/\s+/g, '-')) as any;
  if (!cat) {
    const slug = category.toLowerCase().replace(/\s+/g, '-');
    const catInsert = db.prepare('INSERT INTO categories (name, slug, description, icon, color, accent_bg) VALUES (?, ?, ?, ?, ?, ?)')
      .run(category, slug, `${category} shelf collection`, 'fa-solid fa-book', 'text-amber-600', 'bg-amber-50');
    cat = { id: catInsert.lastInsertRowid };
  }

  // Ensure author exists
  let auth = db.prepare('SELECT id FROM authors WHERE name = ?').get(author) as any;
  if (!auth) {
    const authInsert = db.prepare('INSERT INTO authors (name, bio) VALUES (?, ?)').run(author, `Author of ${title}`);
    auth = { id: authInsert.lastInsertRowid };
  }

  try {
    const bookInsert = db.prepare(`
      INSERT INTO books (
        title, author_id, category_id, isbn, publisher, publication_year,
        pages, language, description, price, discount, stock, cover_image, rating
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 4.8)
    `).run(
      title,
      auth.id,
      cat.id,
      isbn,
      publisher,
      year,
      pages,
      language,
      description,
      price,
      discount,
      stock,
      coverImage
    );

    const newBookId = bookInsert.lastInsertRowid;
    const newBook = db.prepare(`
      SELECT 
        b.id, b.title, a.name as author, c.name as category, c.slug as categorySlug,
        b.price, b.discount, b.rating, b.stock, b.cover_image as coverImage,
        b.isbn, b.publisher, b.pages, b.publication_year as year, b.language, b.description
      FROM books b
      JOIN authors a ON b.author_id = a.id
      JOIN categories c ON b.category_id = c.id
      WHERE b.id = ?
    `).get(newBookId);

    res.status(201).json({ success: true, message: `Added "${title}" to catalog.`, book: newBook });
  } catch (err: any) {
    if (err.message.includes('UNIQUE constraint failed: books.isbn')) {
      return res.status(400).json({ error: 'A book with this ISBN already exists.' });
    }
    res.status(400).json({ error: err.message });
  }
});

// Update book details
router.put('/books/:id', (req, res) => {
  const { id } = req.params;
  const { title, price, discount, stock, isbn, description, coverImage } = req.body;

  const result = db.prepare(`
    UPDATE books
    SET 
      title = COALESCE(?, title),
      price = COALESCE(?, price),
      discount = COALESCE(?, discount),
      stock = COALESCE(?, stock),
      isbn = COALESCE(?, isbn),
      description = COALESCE(?, description),
      cover_image = COALESCE(?, cover_image)
    WHERE id = ?
  `).run(title, price, discount, stock, isbn, description, coverImage, id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Book not found.' });
  }

  const updated = db.prepare(`
    SELECT 
      b.id, b.title, a.name as author, c.name as category, c.slug as categorySlug,
      b.price, b.discount, b.rating, b.stock, b.cover_image as coverImage,
      b.isbn, b.publisher, b.pages, b.publication_year as year, b.language, b.description
    FROM books b
    JOIN authors a ON b.author_id = a.id
    JOIN categories c ON b.category_id = c.id
    WHERE b.id = ?
  `).get(id);

  res.json({ success: true, message: `Updated "${title}".`, book: updated });
});

// Update stock level
router.patch('/books/:id/stock', (req, res) => {
  const { id } = req.params;
  const { stock } = req.body;

  if (stock === undefined || isNaN(Number(stock)) || Number(stock) < 0) {
    return res.status(400).json({ error: 'Valid stock number (>= 0) is required.' });
  }

  const result = db.prepare('UPDATE books SET stock = ? WHERE id = ?').run(Number(stock), id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Book not found.' });
  }

  res.json({ success: true, message: 'Stock levels updated successfully.', bookId: Number(id), stock: Number(stock) });
});

// Delete book
router.delete('/books/:id', (req, res) => {
  const { id } = req.params;

  const result = db.prepare('DELETE FROM books WHERE id = ?').run(id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Book not found.' });
  }

  res.json({ success: true, message: 'Book deleted from catalog.', bookId: Number(id) });
});

export default router;
