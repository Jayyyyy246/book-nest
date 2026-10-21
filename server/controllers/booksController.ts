import { Request, Response } from 'express';
import { db } from '../database/index.js';
import { AuthRequest } from '../middleware/auth.js';

export const booksController = {
  // GET /api/books (with filters, sorting, pagination)
  getBooks: (req: Request, res: Response) => {
    const { category, search, maxPrice, stockOnly, sortBy, limit, offset, includeArchived } = req.query;

    let query = `
      SELECT 
        b.id,
        b.title,
        a.name as author,
        COALESCE(c.name, 'Other') as category,
        COALESCE(c.slug, 'other') as categorySlug,
        b.price,
        b.discount,
        b.rating,
        b.stock,
        b.cover_image as coverImage,
        b.isbn,
        b.publisher,
        b.pages,
        b.publication_year as year,
        b.language,
        b.description,
        b.is_archived as isArchived,
        (SELECT COUNT(*) FROM reviews r WHERE r.book_id = b.id) as reviewCount
      FROM books b
      LEFT JOIN authors a ON b.author_id = a.id
      LEFT JOIN categories c ON b.category_id = c.id
      WHERE 1=1
    `;

    const params: any[] = [];

    if (includeArchived !== 'true') {
      query += ' AND (b.is_archived IS NULL OR b.is_archived = 0)';
    }

    if (category && category !== 'all') {
      query += ` AND (c.slug = ? OR LOWER(c.name) = LOWER(?) OR (c.slug IS NULL AND LOWER(?) = 'other'))`;
      params.push(category, category, category);
    }

    if (search && typeof search === 'string' && search.trim()) {
      const q = `%${search.trim().toLowerCase()}%`;
      query += ' AND (LOWER(b.title) LIKE ? OR LOWER(a.name) LIKE ? OR b.isbn LIKE ? OR LOWER(c.name) LIKE ?)';
      params.push(q, q, q, q);
    }

    if (maxPrice && !isNaN(Number(maxPrice))) {
      query += ' AND (b.price * (1.0 - b.discount / 100.0)) <= ?';
      params.push(Number(maxPrice));
    }

    if (stockOnly === 'true' || stockOnly === '1') {
      query += ' AND b.stock > 0';
    }

    // Sorting
    switch (sortBy) {
      case 'price-asc':
        query += ' ORDER BY (b.price * (1.0 - b.discount / 100.0)) ASC';
        break;
      case 'price-desc':
        query += ' ORDER BY (b.price * (1.0 - b.discount / 100.0)) DESC';
        break;
      case 'rating':
        query += ' ORDER BY b.rating DESC, b.id ASC';
        break;
      case 'discount':
        query += ' ORDER BY b.discount DESC, b.id ASC';
        break;
      case 'featured':
      default:
        query += ' ORDER BY b.id ASC';
        break;
    }

    if (limit && !isNaN(Number(limit))) {
      query += ' LIMIT ?';
      params.push(Number(limit));
      if (offset && !isNaN(Number(offset))) {
        query += ' OFFSET ?';
        params.push(Number(offset));
      }
    }

    const books = db.prepare(query).all(...params);
    res.json({ books, count: books.length });
  },

  // GET /api/books/search?q=
  searchBooks: (req: AuthRequest, res: Response) => {
    const q = req.query.q as string;
    if (!q || !q.trim()) {
      return res.status(400).json({ error: 'Search query parameter "q" is required.' });
    }

    const clean = `%${q.trim().toLowerCase()}%`;
    const books = db.prepare(`
      SELECT 
        b.id,
        b.title,
        a.name as author,
        COALESCE(c.name, 'Other') as category,
        COALESCE(c.slug, 'other') as categorySlug,
        b.price,
        b.discount,
        b.rating,
        b.stock,
        b.cover_image as coverImage,
        b.isbn,
        b.publisher,
        b.pages,
        b.publication_year as year,
        b.language,
        b.description,
        (SELECT COUNT(*) FROM reviews r WHERE r.book_id = b.id) as reviewCount
      FROM books b
      LEFT JOIN authors a ON b.author_id = a.id
      LEFT JOIN categories c ON b.category_id = c.id
      WHERE (b.is_archived IS NULL OR b.is_archived = 0)
        AND (LOWER(b.title) LIKE ? OR LOWER(a.name) LIKE ? OR b.isbn LIKE ? OR LOWER(COALESCE(c.name, 'Other')) LIKE ?)
      ORDER BY b.rating DESC
      LIMIT 25
    `).all(clean, clean, clean, clean) as any[];

    // Log to search_history
    try {
      db.prepare(`
        INSERT INTO search_history (user_id, query, results_count)
        VALUES (?, ?, ?)
      `).run(req.user?.id || null, q.trim(), books.length);
    } catch {}

    res.json({ books, count: books.length, query: q.trim() });
  },

  // GET /api/books/category/:category
  getBooksByCategory: (req: Request, res: Response) => {
    const { category } = req.params;

    const books = db.prepare(`
      SELECT 
        b.id,
        b.title,
        a.name as author,
        COALESCE(c.name, 'Other') as category,
        COALESCE(c.slug, 'other') as categorySlug,
        b.price,
        b.discount,
        b.rating,
        b.stock,
        b.cover_image as coverImage,
        b.isbn,
        b.publisher,
        b.pages,
        b.publication_year as year,
        b.language,
        b.description,
        b.is_archived as isArchived,
        (SELECT COUNT(*) FROM reviews r WHERE r.book_id = b.id) as reviewCount
      FROM books b
      LEFT JOIN authors a ON b.author_id = a.id
      LEFT JOIN categories c ON b.category_id = c.id
      WHERE (b.is_archived IS NULL OR b.is_archived = 0)
        AND (c.slug = ? OR LOWER(c.name) = LOWER(?) OR (c.slug IS NULL AND ? = 'other'))
      ORDER BY b.rating DESC
    `).all(category, category, category.toLowerCase()) as any[];

    res.json({ books, count: books.length, category });
  },

  // GET /api/books/:id
  getBookById: (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const isNumeric = !isNaN(Number(id));
    const includeArchived = req.query.includeArchived === 'true' || req.user?.role === 'admin';

    const book = db.prepare(`
      SELECT 
        b.id,
        b.title,
        a.name as author,
        a.bio as authorBio,
        COALESCE(c.name, 'Other') as category,
        COALESCE(c.slug, 'other') as categorySlug,
        b.price,
        b.discount,
        b.rating,
        b.stock,
        b.cover_image as coverImage,
        b.isbn,
        b.publisher,
        b.pages,
        b.publication_year as year,
        b.language,
        b.description,
        b.views,
        b.is_archived as isArchived
      FROM books b
      LEFT JOIN authors a ON b.author_id = a.id
      LEFT JOIN categories c ON b.category_id = c.id
      WHERE ${isNumeric ? 'b.id = ?' : 'b.isbn = ?'}
        ${includeArchived ? '' : 'AND (b.is_archived IS NULL OR b.is_archived = 0)'}
    `).get(isNumeric ? Number(id) : id) as any;

    if (!book) {
      return res.status(404).json({ error: 'Book not found in campus catalog.' });
    }

    // Increment views & record to book_views
    try {
      db.prepare('UPDATE books SET views = views + 1 WHERE id = ?').run(book.id);
      db.prepare('INSERT INTO book_views (book_id, user_id) VALUES (?, ?)').run(book.id, req.user?.id || null);
    } catch {}

    // Fetch verified reviews
    const reviews = db.prepare(`
      SELECT 
        r.id,
        r.book_id as bookId,
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
    `).all(book.id);

    res.json({ book, reviews });
  },

  // POST /api/books (Admin required)
  createBook: (req: Request, res: Response) => {
    const {
      title,
      author,
      category,
      price,
      discount = 0,
      stock = 10,
      isbn,
      publisher,
      pages,
      year,
      language = 'English',
      description,
      coverImage
    } = req.body;

    if (!title || !author || !category || price === undefined || !isbn) {
      return res.status(400).json({ error: 'Title, author, category, price, and ISBN are required.' });
    }

    // Existing ISBN check
    const existing = db.prepare('SELECT id FROM books WHERE isbn = ?').get(isbn);
    if (existing) {
      return res.status(400).json({ error: `A book with ISBN ${isbn} already exists.` });
    }

    // Find or create author
    let authorRow = db.prepare('SELECT id FROM authors WHERE LOWER(name) = LOWER(?)').get(author.trim()) as any;
    if (!authorRow) {
      const insAuthor = db.prepare('INSERT INTO authors (name, bio) VALUES (?, ?)').run(author.trim(), 'Campus Contributor');
      authorRow = { id: insAuthor.lastInsertRowid };
    }

    // Find or create category (with safe fallback to 'Other')
    const effectiveCategory = (category && typeof category === 'string' && category.trim()) ? category.trim() : 'Other';
    let catRow = db.prepare('SELECT id FROM categories WHERE LOWER(name) = LOWER(?) OR slug = LOWER(?)').get(effectiveCategory, effectiveCategory) as any;
    if (!catRow) {
      const slug = effectiveCategory.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const insCat = db.prepare('INSERT INTO categories (name, slug) VALUES (?, ?)').run(effectiveCategory, slug);
      catRow = { id: insCat.lastInsertRowid };
    }

    const defaultCover = coverImage || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&auto=format&fit=crop&q=80';

    const insertResult = db.prepare(`
      INSERT INTO books (
        title, author_id, category_id, isbn, publisher, publication_year,
        pages, language, description, price, discount, stock, cover_image, rating
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 5.0)
    `).run(
      title.trim(),
      authorRow.id,
      catRow.id,
      isbn.trim().replace(/[-\s]/g, ''),
      publisher || null,
      year ? Number(year) : new Date().getFullYear(),
      pages ? Number(pages) : 300,
      language,
      description || '',
      Number(price),
      Number(discount),
      Number(stock),
      defaultCover
    );

    const newBookId = Number(insertResult.lastInsertRowid);
    const createdBook = db.prepare(`
      SELECT 
        b.id, b.title, a.name as author, COALESCE(c.name, 'Other') as category, COALESCE(c.slug, 'other') as categorySlug,
        b.price, b.discount, b.rating, b.stock, b.cover_image as coverImage,
        b.isbn, b.publisher, b.pages, b.publication_year as year, b.language, b.description
      FROM books b
      LEFT JOIN authors a ON b.author_id = a.id
      LEFT JOIN categories c ON b.category_id = c.id
      WHERE b.id = ?
    `).get(newBookId);

    res.status(201).json({ success: true, book: createdBook });
  },

  // PUT /api/books/:id (Admin required)
  updateBook: (req: Request, res: Response) => {
    const { id } = req.params;
    const {
      title,
      author,
      category,
      price,
      discount,
      stock,
      description,
      coverImage,
      publisher,
      pages,
      year
    } = req.body;

    const existing = db.prepare('SELECT * FROM books WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json({ error: 'Book not found.' });
    }

    // Optional Author Update
    let authorId = existing.author_id;
    if (author && typeof author === 'string' && author.trim()) {
      let authorRow = db.prepare('SELECT id FROM authors WHERE LOWER(name) = LOWER(?)').get(author.trim()) as any;
      if (!authorRow) {
        const insAuthor = db.prepare('INSERT INTO authors (name) VALUES (?)').run(author.trim());
        authorId = insAuthor.lastInsertRowid;
      } else {
        authorId = authorRow.id;
      }
    }

    // Optional Category Update
    let categoryId = existing.category_id;
    if (category && typeof category === 'string' && category.trim()) {
      const trimmedCategory = category.trim();
      let catRow = db.prepare('SELECT id FROM categories WHERE LOWER(name) = LOWER(?) OR slug = LOWER(?)').get(trimmedCategory, trimmedCategory) as any;
      if (!catRow) {
        const slug = trimmedCategory.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const insCat = db.prepare('INSERT INTO categories (name, slug) VALUES (?, ?)').run(trimmedCategory, slug);
        categoryId = insCat.lastInsertRowid;
      } else {
        categoryId = catRow.id;
      }
    }

    db.prepare(`
      UPDATE books SET
        title = COALESCE(?, title),
        author_id = ?,
        category_id = ?,
        price = COALESCE(?, price),
        discount = COALESCE(?, discount),
        stock = COALESCE(?, stock),
        description = COALESCE(?, description),
        cover_image = COALESCE(?, cover_image),
        publisher = COALESCE(?, publisher),
        pages = COALESCE(?, pages),
        publication_year = COALESCE(?, publication_year)
      WHERE id = ?
    `).run(
      title ? title.trim() : null,
      authorId,
      categoryId,
      price !== undefined ? Number(price) : null,
      discount !== undefined ? Number(discount) : null,
      stock !== undefined ? Number(stock) : null,
      description || null,
      coverImage || null,
      publisher || null,
      pages ? Number(pages) : null,
      year ? Number(year) : null,
      id
    );

    const updatedBook = db.prepare(`
      SELECT 
        b.id, b.title, a.name as author, COALESCE(c.name, 'Other') as category, COALESCE(c.slug, 'other') as categorySlug,
        b.price, b.discount, b.rating, b.stock, b.cover_image as coverImage,
        b.isbn, b.publisher, b.pages, b.publication_year as year, b.language, b.description
      FROM books b
      LEFT JOIN authors a ON b.author_id = a.id
      LEFT JOIN categories c ON b.category_id = c.id
      WHERE b.id = ?
    `).get(id);

    res.json({ success: true, book: updatedBook });
  },

  // PATCH /api/books/:id/stock (Admin required)
  updateStock: (req: Request, res: Response) => {
    const { id } = req.params;
    const { stock } = req.body;

    if (stock === undefined || isNaN(Number(stock)) || Number(stock) < 0) {
      return res.status(400).json({ error: 'Valid stock number (>= 0) is required.' });
    }

    const result = db.prepare('UPDATE books SET stock = ? WHERE id = ?').run(Number(stock), id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Book not found.' });
    }

    res.json({ success: true, message: 'Stock level updated successfully.', bookId: Number(id), stock: Number(stock) });
  },

  // DELETE /api/books/:id (Admin required) - Safe Idempotent Soft Archiving
  deleteBook: (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      if (!id || isNaN(Number(id))) {
        return res.status(400).json({ error: 'Valid numeric book ID is required.' });
      }

      const existing = db.prepare('SELECT id, title, is_archived FROM books WHERE id = ?').get(id) as any;
      if (!existing) {
        return res.status(404).json({ error: 'Book not found.' });
      }

      // Idempotency check: if book is already archived, return clean success
      if (existing.is_archived === 1) {
        return res.json({
          success: true,
          message: `"${existing.title}" is already archived.`,
          bookId: Number(id),
          archived: true
        });
      }

      // Safe soft-deletion: Clean up active in-flight carts & wishlists, but PRESERVE order_items & invoices!
      db.transaction(() => {
        db.prepare('DELETE FROM cart_items WHERE book_id = ?').run(id);
        db.prepare('DELETE FROM wishlist WHERE book_id = ?').run(id);
        db.prepare('UPDATE books SET is_archived = 1 WHERE id = ?').run(id);
      })();

      res.json({
        success: true,
        message: `"${existing.title}" archived successfully from catalog.`,
        bookId: Number(id),
        archived: true
      });
    } catch (err: any) {
      console.error('Delete/Archive book error:', err);
      res.status(500).json({ error: err.message || 'Database error occurred while archiving book.' });
    }
  }
};
