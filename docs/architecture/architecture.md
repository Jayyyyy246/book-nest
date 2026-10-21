# BookNest — System Architecture & Design

This document details the high-level architecture, module boundaries, database schema, security model, and data flow of the BookNest academic bookstore application.

---

## 1. High-Level Architecture Overview

BookNest uses a decoupled client-server architecture:
- **Frontend**: Single-Page Application (SPA) built with React 19, TypeScript, and Vite, featuring Tailwind CSS utility styling, modular feature views, and dedicated API domain clients.
- **Backend**: RESTful API service built with Node.js and Express in ESM mode, structured around controllers, services, repositories/database layer, custom middleware, and a unified error hierarchy.
- **Data Layer**: Embedded SQLite database (`data/booknest.db`) operating with Write-Ahead Logging (`WAL`), strict foreign keys (`PRAGMA foreign_keys = ON`), and in-memory test isolation (`data/booknest.test.db`).

```mermaid
graph TD
    Client["Browser / Client SPA (React 19 + TypeScript + Vite)"]
    
    subgraph Frontend["Frontend Layer (src/)"]
        Router["Hash Router & State Coordinator (App.tsx)"]
        FeatureViews["Feature Modules\n(StoreHomeView, CatalogView, BookDetail,\nScanner, AIAdvisor, AdminDashboard)"]
        Services["Domain API Services\n(authApi, booksApi, cartApi,\nordersApi, scannerApi, recommendationsApi)"]
        Components["Accessible UI Components\n(AnimatedLampLogin, Navbar, Footer, SlideOverCart)"]
    end
    
    subgraph Network["HTTP / REST API (Express Server)"]
        SecurityMW["Security & Compliance Layer\n(Helmet Headers, CORS, Rate Limiters)"]
        PayloadLimits["Strict Payload Limits\n(100KB Standard, 15MB Camera Scanner)"]
        RouterMW["Express Route Dispatchers\n(/api/auth, /api/books, /api/orders, etc.)"]
        AuthMW["JWT & Role Authorization Guard\n(authenticateToken, requireAdmin)"]
        Controllers["Controller Handlers\n(authController, booksController, ordersController, etc.)"]
        BizLogic["Business Services\n(gemini.ts, scannerMatcher.ts)"]
        ErrMW["Centralized Error Handler (errorHandler.ts)"]
    end
    
    subgraph Storage["Persistence & External Services"]
        SQLite[("SQLite Database\n(WAL Mode, Foreign Keys ON)")]
        GeminiAPI["Google Gemini AI API\n(gemini-3.5-flash-lite)"]
        OpenLibrary["Open Library REST API\n(Fallback Metadata Provider)"]
    end

    Client --> Router
    Router --> FeatureViews
    FeatureViews --> Components
    FeatureViews --> Services
    Services -->|HTTP / JSON with JWT| SecurityMW
    SecurityMW --> PayloadLimits
    PayloadLimits --> RouterMW
    RouterMW --> AuthMW
    AuthMW --> Controllers
    Controllers --> BizLogic
    Controllers --> ErrMW
    Controllers --> SQLite
    BizLogic --> GeminiAPI
    BizLogic --> OpenLibrary
```

---

## 2. Request Lifecycle & Layered Boundaries

Every incoming HTTP request traverses a clean, deterministic pipeline:

```mermaid
sequenceDiagram
    autonumber
    actor User as Client / User
    participant App as React SPA
    participant MW as Express Middleware
    participant Auth as Auth & Role Guard
    participant Ctrl as Route Controller
    participant DB as SQLite (WAL)
    participant Ext as Gemini / OpenLibrary

    User->>App: Interacts with Storefront (e.g. Place Order)
    App->>MW: POST /api/orders (Authorization: Bearer <JWT>, Idempotency-Key)
    MW->>MW: Check CORS, Rate Limits, and 100KB Payload
    MW->>Auth: Verify JWT signature & expiration
    Auth->>Ctrl: Attach req.user (id, email, role)
    Ctrl->>Ctrl: Validate payload & check Idempotency-Key
    Ctrl->>DB: BEGIN IMMEDIATE TRANSACTION
    Ctrl->>DB: Check stock & decrement inventory
    Ctrl->>DB: Insert into orders & order_items
    Ctrl->>DB: COMMIT
    Ctrl-->>App: HTTP 201 Created { id, orderNumber, total, items }
    App-->>User: Display Order Confirmation & Toast
```

---

## 3. Database Schema & Entity-Relationship Diagram

The SQLite schema enforces data integrity through foreign keys, unique constraints, and transaction boundaries.

```mermaid
erDiagram
    USERS ||--o{ ORDERS : places
    USERS ||--o{ REVIEWS : writes
    USERS ||--o{ CART_ITEMS : maintains
    USERS ||--o{ WISHLISTS : saves
    BOOKS ||--o{ ORDER_ITEMS : contains
    BOOKS ||--o{ REVIEWS : receives
    BOOKS ||--o{ CART_ITEMS : references
    BOOKS ||--o{ WISHLISTS : collected_in
    ORDERS ||--|{ ORDER_ITEMS : includes
    COUPONS ||--o{ ORDERS : applies

    USERS {
        INTEGER id PK
        TEXT email UK
        TEXT password_hash
        TEXT full_name
        TEXT phone
        TEXT role "student | admin"
        TEXT created_at
        TEXT updated_at
    }

    BOOKS {
        INTEGER id PK
        TEXT title
        TEXT author
        TEXT category
        TEXT isbn UK
        REAL price
        REAL original_price
        INTEGER stock
        REAL rating
        INTEGER review_count
        TEXT cover_image
        TEXT description
        INTEGER pages
        TEXT published_date
        INTEGER is_archived "0 | 1"
        TEXT created_at
    }

    ORDERS {
        INTEGER id PK
        TEXT order_number UK
        INTEGER user_id FK
        REAL total
        REAL subtotal
        REAL discount
        TEXT coupon_code
        TEXT status "Pending | Processing | Shipped | Delivered | Cancelled"
        TEXT shipping_address
        TEXT payment_method
        TEXT idempotency_key UK
        TEXT created_at
    }

    ORDER_ITEMS {
        INTEGER id PK
        INTEGER order_id FK
        INTEGER book_id FK
        INTEGER quantity
        REAL price
    }

    REVIEWS {
        INTEGER id PK
        INTEGER book_id FK
        INTEGER user_id FK
        INTEGER rating
        TEXT comment
        TEXT created_at
    }

    COUPONS {
        INTEGER id PK
        TEXT code UK
        REAL discount_percent
        REAL min_spend
        INTEGER is_active "0 | 1"
        TEXT expires_at
    }
```

---

## 4. Key Architectural Safeguards

### 4.1 Order Reliability & Concurrency Protection
1. **Atomic SQLite Transactions**: All checkout operations run inside `BEGIN IMMEDIATE TRANSACTION` blocks. If any book is out of stock, the entire order is aborted without inventory leakage.
2. **Idempotency Keys**: Clients send an `Idempotency-Key` header with checkout requests. Duplicate requests return the original response with an `Idempotent-Replayed: true` header without charging the user or decrementing stock twice.
3. **Safe Inventory Restoration**: When an order is marked `Cancelled`, inventory is incremented back. Repeated cancellations are idempotent and never double-restore stock.

### 4.2 Security Architecture
1. **Defense in Depth**: Frontend client validation is complemented by strict server-side validation. The backend is the sole authority for book prices, coupon calculation, inventory levels, and role privileges.
2. **Payload Protection**: Standard routes enforce a strict `100KB` body limit to eliminate resource exhaustion attacks. Only the optical scanner endpoint accepts up to `15MB` for high-resolution camera feeds.
3. **Rate Limiting**: Multi-window rate limiters defend `/api/auth` (15 req/15min), `/api/scanner` (30 req/min), and `/api/recommendations` (20 req/15min) against brute force and DDoS.
4. **JWT Hardening**: In production, `JWT_SECRET` is strictly validated to ensure minimum length (32 chars) and reject default strings.

### 4.3 AI Recommendation Resilience
The `/api/recommendations` endpoint employs a 3-tier fallback architecture:
1. **Tier 1 (Live AI Model)**: Google Gemini `gemini-3.5-flash-lite` provides personalized natural language recommendations.
2. **Tier 2 (Keyword Local Match)**: If the Gemini API key is unconfigured, expired, or unreachable, an intelligent fuzzy matching service ranks local campus books matching user query keywords.
3. **Tier 3 (Catalog Fallback)**: If no keyword matches, the service returns verified top-rated, in-stock campus inventory, ensuring the user always receives a valid, high-quality reading list.
