import express from 'express';
import { config } from './config/index.js';
import { initDatabase } from './database/index.js';
import { corsMiddleware } from './middleware/cors.js';
import { securityHeaders } from './middleware/securityHeaders.js';

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

// Trust Proxy Configuration (only when supported/enabled)
if (config.trustProxy) {
  app.set('trust proxy', config.trustProxy);
}

// Security Headers and CORS Policy
app.use(securityHeaders);
app.use(corsMiddleware);

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

// Dedicated 10MB parser for optical scanner routes (camera base64 images)
app.use(
  '/api/scanner',
  express.json({ limit: config.uploadLimit }),
  express.urlencoded({ extended: true, limit: config.uploadLimit }),
  scannerRoutes
);

// Standard routes: strict 100kb payload limit to prevent resource exhaustion (SEC-04)
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Mount Remaining Routes
app.use('/api/auth', authRoutes);
app.use('/api/books', booksRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/coupons', couponsRoutes);
app.use('/api/recommendations', recommendationsRoutes);

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err.type === 'entity.too.large' || err.status === 413) {
    return res.status(413).json({ error: 'Request payload exceeds maximum allowed size.' });
  }

  // Handle malformed JSON body from body-parser
  if (err instanceof SyntaxError && (err as any).status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Malformed JSON payload in request body.' });
  }

  console.error('API Error:', err.message || err);
  const isProd = config.nodeEnv === 'production';
  res.status(err.status || 500).json({
    error: isProd ? 'Internal server error' : (err.message || 'Internal server error')
  });
});

export function startServer() {
  return app.listen(config.port, () => {
    console.log(`\n📚 BookNest Backend API Server running at http://localhost:${config.port}`);
    console.log(`   Health check available at http://localhost:${config.port}/api/health\n`);
  });
}
