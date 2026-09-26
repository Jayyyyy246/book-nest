import express from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import { initDatabase } from './database/index.js';

import authRoutes from './routes/auth.js';
import booksRoutes from './routes/books.js';
import categoriesRoutes from './routes/categories.js';
import cartRoutes from './routes/cart.js';
import wishlistRoutes from './routes/wishlist.js';
import ordersRoutes from './routes/orders.js';
import adminRoutes from './routes/admin.js';
import reviewsRoutes from './routes/reviews.js';
import couponsRoutes from './routes/coupons.js';
import scannerRoutes from './routes/scanner.js';
import recommendationsRoutes from './routes/recommendations.js';

// Initialize SQLite database and seed initial tables/records if needed
initDatabase();

export const app = express();

app.use(cors());
app.use(express.json({ limit: config.uploadLimit }));
app.use(express.urlencoded({ extended: true, limit: config.uploadLimit }));

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'BookNest Academic Bookstore API',
    version: '2.0.0',
    database: 'SQLite (WAL mode)',
    timestamp: new Date().toISOString()
  });
});

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/books', booksRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/coupons', couponsRoutes);
app.use('/api/scanner', scannerRoutes);
app.use('/api/recommendations', recommendationsRoutes);

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('API Error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

export function startServer() {
  return app.listen(config.port, () => {
    console.log(`\n📚 BookNest Backend API Server running at http://localhost:${config.port}`);
    console.log(`   Health check available at http://localhost:${config.port}/api/health\n`);
  });
}
