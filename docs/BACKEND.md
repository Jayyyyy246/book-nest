# BookNest Full-Stack Backend Architecture & Documentation

## 1. System Overview & Architecture

BookNest has been transitioned from a client-side React prototype into a production-grade full-stack web application. The platform provides transactional campus bookstore management, atomic order placement with inventory guarantees, persistent user sessions, and multi-tenant cart/wishlist management backed by SQLite with write-ahead logging (WAL).

### Layered Backend Structure (`server/`)

```
server/
├── server.ts                 # Express application initialization & middleware setup
├── index.ts                  # Server entrypoint with database bootstrapping
├── config/
│   └── index.ts              # Strongly typed server, JWT, DB, & port configurations
├── database/
│   └── index.ts              # SQLite connection, schema definition, indexes, & seed loader
├── middleware/
│   └── auth.ts               # JWT verification, authenticateToken, requireAdmin, optionalAuth
├── controllers/
│   ├── authController.ts     # User registration, bcrypt login, token issue, session check
│   ├── booksController.ts    # Catalog listing, full-text search, categories, admin CRUD
│   ├── cartController.ts     # User-bound cart persistence, item mutations, bulk synchronization
│   ├── wishlistController.ts # Wishlist toggle, addition, deletion, and sync
│   ├── ordersController.ts   # Atomic order placement, stock verification, admin dispatch
│   └── reviewsController.ts  # Verified campus reviews, rating calculation, ownership guards
├── routes/
│   ├── auth.ts               # /api/auth routes
│   ├── books.ts              # /api/books routes
│   ├── cart.ts               # /api/cart routes
│   ├── wishlist.ts           # /api/wishlist routes
│   ├── orders.ts             # /api/orders routes
│   ├── reviews.ts            # /api/reviews routes
│   └── admin.ts              # /api/admin metrics & warehouse control routes
└── services/                 # Business logic helpers
```

---

## 2. Database Design & Entity Relationships

The storage layer is built upon `better-sqlite3` configured with `PRAGMA journal_mode = WAL;`, `PRAGMA foreign_keys = ON;`, and `PRAGMA synchronous = NORMAL;` to guarantee durability, concurrency, and sub-millisecond query performance.

### Required Entities & Schema

1. **`users`**:
   - `id` INTEGER PRIMARY KEY AUTOINCREMENT
   - `name` TEXT NOT NULL
   - `email` TEXT UNIQUE NOT NULL
   - `password` TEXT NOT NULL (bcrypt hashed with 10 salt rounds)
   - `role` TEXT NOT NULL DEFAULT 'user' ('user' | 'admin' | 'faculty')
   - `avatar` TEXT, `phone` TEXT, `hostel_room` TEXT
   - `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP

2. **`categories`**:
   - `id` INTEGER PRIMARY KEY AUTOINCREMENT
   - `name` TEXT NOT NULL, `slug` TEXT UNIQUE NOT NULL, `description` TEXT

3. **`authors`**:
   - `id` INTEGER PRIMARY KEY AUTOINCREMENT
   - `name` TEXT NOT NULL, `bio` TEXT, `photo` TEXT

4. **`books`**:
   - `id` INTEGER PRIMARY KEY AUTOINCREMENT
   - `isbn` TEXT UNIQUE NOT NULL
   - `title` TEXT NOT NULL, `author` TEXT NOT NULL
   - `author_id` INTEGER REFERENCES authors(id)
   - `category` TEXT NOT NULL, `category_id` INTEGER REFERENCES categories(id)
   - `price` REAL NOT NULL, `discount` REAL DEFAULT 0
   - `rating` REAL DEFAULT 0, `reviews_count` INTEGER DEFAULT 0
   - `stock` INTEGER NOT NULL DEFAULT 0
   - `cover_image` TEXT NOT NULL, `publisher` TEXT, `year` INTEGER, `pages` INTEGER
   - `description` TEXT, `featured` INTEGER DEFAULT 0

5. **`cart` & `cart_items`**:
   - `cart`: `id`, `user_id` UNIQUE REFERENCES users(id) ON DELETE CASCADE
   - `cart_items`: `id`, `cart_id` REFERENCES cart(id) ON DELETE CASCADE, `book_id` REFERENCES books(id) ON DELETE CASCADE, `quantity` INTEGER NOT NULL CHECK (quantity > 0)
   - UNIQUE constraint on `(cart_id, book_id)`

6. **`wishlist`**:
   - `id` INTEGER PRIMARY KEY AUTOINCREMENT
   - `user_id` INTEGER REFERENCES users(id) ON DELETE CASCADE
   - `book_id` INTEGER REFERENCES books(id) ON DELETE CASCADE
   - UNIQUE constraint on `(user_id, book_id)`

7. **`orders` & `order_items`**:
   - `orders`: `id`, `user_id` REFERENCES users(id) ON DELETE CASCADE, `order_number` TEXT UNIQUE, `status` TEXT ('Confirmed' | 'Processing' | 'Shipped' | 'Delivered' | 'Cancelled'), `total_amount` REAL, `coupon_code` TEXT, `payment_method` TEXT, `delivery_address` TEXT (JSON serialized), `created_at` DATETIME
   - `order_items`: `id`, `order_id` REFERENCES orders(id) ON DELETE CASCADE, `book_id` REFERENCES books(id), `quantity` INTEGER, `price` REAL, `line_total` REAL

8. **`reviews`**:
   - `id` INTEGER PRIMARY KEY AUTOINCREMENT
   - `book_id` INTEGER REFERENCES books(id) ON DELETE CASCADE
   - `user_id` INTEGER REFERENCES users(id) ON DELETE CASCADE
   - `rating` INTEGER CHECK(rating >= 1 AND rating <= 5)
   - `comment` TEXT NOT NULL, `verified_purchase` INTEGER DEFAULT 1, `created_at` DATETIME

9. **`addresses`**:
   - `id` INTEGER PRIMARY KEY AUTOINCREMENT
   - `user_id` INTEGER REFERENCES users(id) ON DELETE CASCADE
   - `full_name` TEXT, `hostel_block` TEXT, `room_no` TEXT, `phone` TEXT, `is_default` INTEGER DEFAULT 0

10. **`book_views`**:
    - `id` INTEGER PRIMARY KEY AUTOINCREMENT
    - `book_id` INTEGER REFERENCES books(id) ON DELETE CASCADE
    - `user_id` INTEGER REFERENCES users(id) ON DELETE SET NULL
    - `ip_address` TEXT, `viewed_at` DATETIME DEFAULT CURRENT_TIMESTAMP

11. **`search_history`**:
    - `id` INTEGER PRIMARY KEY AUTOINCREMENT
    - `user_id` INTEGER REFERENCES users(id) ON DELETE CASCADE
    - `query` TEXT NOT NULL, `results_count` INTEGER, `searched_at` DATETIME DEFAULT CURRENT_TIMESTAMP

### Optimized Performance Indexes

- `idx_books_category` ON `books(category)`
- `idx_books_isbn` ON `books(isbn)`
- `idx_books_author` ON `books(author)`
- `idx_cart_user` ON `cart(user_id)`
- `idx_cart_items_cart` ON `cart_items(cart_id)`
- `idx_wishlist_user` ON `wishlist(user_id)`
- `idx_orders_user` ON `orders(user_id)`
- `idx_order_items_order` ON `order_items(order_id)`
- `idx_reviews_book` ON `reviews(book_id)`
- `idx_reviews_user` ON `reviews(user_id)`
- `idx_book_views_book` ON `book_views(book_id)`
- `idx_search_history_user` ON `search_history(user_id)`

---

## 3. REST API Specification

### Authentication (`/api/auth`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Register new user. Hashes password using bcrypt. Returns `{ user, token }`. |
| `POST` | `/api/auth/login` | Public | Authenticates credentials with bcrypt compare. Issues JWT token. |
| `POST` | `/api/auth/logout` | Authenticated | Clears session cookie / invalidates client-side token. |
| `GET` | `/api/auth/me` | Authenticated | Retrieves current authenticated user profile from token. |
| `GET` | `/api/auth/demo-users` | Public | Provides demo login profiles for testing convenience. |

### Books Catalog (`/api/books`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/books` | Public | Returns catalog with filtering (`category`, `maxPrice`, `stockOnly`, `sortBy`, `page`, `limit`). |
| `GET` | `/api/books/:id` | Public | Returns book details and logs entry to `book_views`. |
| `GET` | `/api/books/search?q=` | Public | Searches titles, authors, and ISBNs; logs query to `search_history`. |
| `GET` | `/api/books/category/:category` | Public | Returns books filtered by category slug or name. |
| `POST` | `/api/books` | Admin Only | Creates a new catalog item. Validates required fields. |
| `PUT` | `/api/books/:id` | Admin Only | Updates catalog item details and stock. |
| `DELETE` | `/api/books/:id` | Admin Only | Soft/hard removes book from catalog. |

### Shopping Cart (`/api/cart`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/cart` | Authenticated | Retrieves persisted cart object `{ [bookId]: quantity }` and populated items. |
| `POST` | `/api/cart/items` | Authenticated | Adds an item or increments its quantity in SQLite `cart_items`. |
| `PUT` | `/api/cart/items/:bookId` | Authenticated | Updates quantity directly. Removes if quantity <= 0. |
| `DELETE` | `/api/cart/items/:bookId` | Authenticated | Removes specific book from cart. |
| `DELETE` | `/api/cart` | Authenticated | Clears all items in user's active cart. |
| `POST` | `/api/cart/sync` | Authenticated | Merges offline/guest cart items with authenticated account cart. |

### Wishlist (`/api/wishlist`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/wishlist` | Authenticated | Returns array of book IDs and populated book objects. |
| `POST` | `/api/wishlist/:bookId` | Authenticated | Adds book to user wishlist. |
| `DELETE` | `/api/wishlist/:bookId` | Authenticated | Removes book from user wishlist. |
| `POST` | `/api/wishlist/toggle/:bookId` | Authenticated | Toggles wishlist status in a single call. |
| `POST` | `/api/wishlist/sync` | Authenticated | Synchronizes client wishlist with server database. |

### Orders & Checkout (`/api/orders` & `/api/admin/orders`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/orders` | Authenticated | **Atomic Transaction**: Validates inventory stock, locks rows, reduces book stock, inserts `orders` + `order_items`, and empties cart. |
| `GET` | `/api/orders` | Authenticated | Retrieves order history and line items for the logged-in user. |
| `GET` | `/api/orders/:id` | Authenticated | Retrieves detailed order invoice and manifest by ID. |
| `GET` | `/api/admin/orders` | Admin Only | Lists all campus orders across all users with delivery status. |
| `PUT` | `/api/admin/orders/:id/status` | Admin Only | Updates fulfillment status (`Processing`, `Shipped`, `Delivered`, etc.). |

### Reviews (`/api/reviews` & `/api/books/:id/reviews`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/books/:id/reviews` | Public | Returns verified reviews and average rating for a given book. |
| `POST` | `/api/books/:id/reviews` | Authenticated | Creates a review for the book. Updates book rating average. |
| `PUT` | `/api/reviews/:id` | Authenticated | Modifies an existing review. **Enforces author ownership**. |
| `DELETE` | `/api/reviews/:id` | Authenticated | Deletes review. **Only author or Admin** allowed. |

---

## 4. Authentication & Security Implementation

1. **Password Hashing**:
   Passwords are never stored in plaintext. `bcryptjs.hash(password, 10)` is executed upon registration and seed generation.
2. **JWT Authorization**:
   Signed with `HS256` using `JWT_SECRET`. Tokens include `{ id, email, role, name }` with a 7-day expiration.
3. **Role-Based Access Control (RBAC)**:
   - `authenticateToken`: Validates Bearer token in the `Authorization` header.
   - `requireAdmin`: Rejects non-admin requests with `403 Forbidden` (`{"error": "Forbidden: Administrative access required"}`).
   - **No Frontend Role Tampering**: Admin privilege is strictly derived from the decoded token identity stored on the backend. Frontend toggles for role elevation are eliminated.
4. **Order Placement Atomicity**:
   All checkout executions are wrapped in `db.transaction(() => { ... })()`. If any item exceeds available warehouse stock, the entire transaction is rolled back with `400 Bad Request` (`"Insufficient stock for book..."`).

---

## 5. Environment Variables & Configuration

Create a `.env` file in the project root:

```env
# Server Network Settings
PORT=5000
NODE_ENV=development

# JWT Secret Key
JWT_SECRET=booknest-super-secret-campus-jwt-key-2026-production

# SQLite Database Location
DB_PATH=./data/booknest.db

# Vite Client Frontend URL
VITE_API_URL=http://localhost:5000/api
```

---

## 6. Local Setup & Running

### Prerequisites
- Node.js (v18 or higher)
- npm (v9 or higher)

### Installation & Execution
```bash
# 1. Install all dependencies
npm install

# 2. Run both Backend Express server & Frontend Vite client concurrently:
npm run dev

# 3. Or run them independently:
npm run server   # Starts Express on http://localhost:5000
npm run client   # Starts Vite on http://localhost:3000
```

### Build & Verification Commands
```bash
# Type check TypeScript codebase
npm run lint         # npx tsc --noEmit

# Production bundle build
npm run build        # vite build -> outputs to dist/

# Run complete persistence and refresh test suite
npm run test:persistence
```

---

## 7. Test Credentials & Demo Accounts

The database is seeded with authentic hashed accounts:

| User Type | Email | Password | Role | Permissions |
|---|---|---|---|---|
| **Student** | `user@booknest.com` | `User@123` | `user` | Browsing, Cart, Wishlist, Order Placement, Personal History |
| **Administrator** | `admin@booknest.com` | `Admin@123` | `admin` | Warehouse Control, Catalog Mutations, Stock Updates, Order Status |
| **Faculty / Professor** | `prof@booknest.com` | `Prof@123` | `faculty` | Campus Academic Course Pack reservations, reviews |

---

## 8. Automated Persistence Verification

The automated test script `scripts/test-persistence.mjs` executes an end-to-end verification covering:
1. **REST API & Authentication**: Validates JWT issuance, student vs. admin role segregation, and 403 authorization guards on admin routes.
2. **Cart Persistence Across Refresh**: Adds a book to cart, reloads page via Playwright, and confirms cart count and drawer items remain intact.
3. **Wishlist Persistence Across Refresh**: Toggles wishlist item, reloads page, and confirms server-synced wishlist persistence.
4. **Order Placement & Refresh**: Places order through 3-step checkout wizard with inventory stock verification, verifies invoice generation, navigates to Orders view, reloads page, and ensures order history persists from SQLite.
5. **Session Continuity**: Signs out, confirms guest state, logs back in, and verifies all previously placed orders and items are fully restored.
6. **Live Inventory Synchronization**: Admin updates catalog stock level via API; user client immediately reflects updated quantity after reload.
