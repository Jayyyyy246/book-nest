# BookNest Folder Structure & Architectural Organization

**Document Version:** 2.0.0  
**Target Platform:** Full-Stack TypeScript (React 19 + Express 4 + Better-SQLite3)  
**Document Status:** Approved Target Architecture  

---

## 1. Architectural Motivation & Analysis

### 1.1 Problems with the Initial Layout
1. **Monolithic Coordinator (`src/App.tsx`):**
   At over 1,200 lines, `App.tsx` combined page routing, state persistence in `localStorage`, API polling, live search filtering, pagination, cart calculation, wishlist toggles, and UI modal orchestration. This made unit testing difficult and increased the blast radius of UI changes.
2. **Flat Component Pool (`src/components/`):**
   Storefront building blocks (`HeroSection`, `CategoryGrid`), complex multi-step modal workflows (`CheckoutFlowModal`, `EditorialScannerView`), and role-gated admin views (`AdminDashboard`) resided in the same flat folder without domain boundaries.
3. **Monolithic API Client (`src/api.ts`):**
   All 30+ HTTP API endpoints were bundled into a single object. Domain feature code had to import the full API surface rather than scoped clients.
4. **Redundant Database Directory (`server/db/` vs `server/database/`):**
   `server/db/database.ts` merely re-exported from `server/database/index.ts`, creating confusion over which import path to use.
5. **Lack of Standard Open-Source Governance:**
   Missing root `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, and CI workflows.

---

## 2. Target Directory Hierarchy

```text
book-nest/
├── .github/                              # GitHub configurations & automations
│   ├── workflows/
│   │   └── ci.yml                        # Automated CI workflow (lint, build, test)
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md                 # Structured bug report template
│   │   └── feature_request.md            # Structured feature proposal template
│   └── PULL_REQUEST_TEMPLATE.md          # Comprehensive PR checklist
│
├── docs/                                 # Architectural & developer documentation
│   ├── architecture/
│   │   ├── initial-audit.md              # Phase 0 baseline audit & health check
│   │   ├── folder-structure.md           # This document (structure, mappings, boundaries)
│   │   ├── architecture.md               # End-to-end system design & Mermaid diagrams
│   │   └── api-design.md                 # REST API specification & contracts
│   └── development/
│       ├── setup.md                      # Local environment onboarding guide
│       ├── testing.md                    # Test execution & regression guide
│       └── troubleshooting.md            # Diagnostics for common runtime issues
│
├── public/                               # Static public assets
├── data/                                 # SQLite database files & seed data
│   ├── booknest.db                       # Active campus warehouse database
│   ├── catalogue-seed-data.json          # Precompiled catalogue seed fixtures
│   └── booknest.test.db (gitignored)     # Isolated test database
│
├── src/                                  # Frontend Application (React 19 + Vite 8)
│   ├── assets/                           # Bundled media & branding assets
│   ├── components/                       # Shared layout & reusable presentation components
│   │   ├── layout/
│   │   │   ├── Navbar.tsx                # Primary application navigation & auth trigger
│   │   │   ├── HeroSection.tsx           # Storefront marquee banner & hero messaging
│   │   │   └── Footer.tsx                # Library footer, campus links, and badges
│   │   ├── common/
│   │   │   ├── BookCard.tsx              # Interactive book card with quick-view & cart trigger
│   │   │   ├── CategoryGrid.tsx          # Campus departmental category tiles
│   │   │   └── ScreenReaderAnnouncer.tsx # WCAG live region for assistive tech
│   │   └── index.ts                      # Backward-compatible component barrel re-export
│   │
│   ├── features/                         # Domain-driven feature modules
│   │   ├── auth/                         # Authentication & login experience
│   │   │   ├── AuthModal.tsx             # Main authentication modal
│   │   │   └── AnimatedLampLogin.tsx     # Cinematic pull-string reading lamp
│   │   ├── books/                        # Catalogue discovery & book details
│   │   │   ├── BookDetailPage.tsx        # Dedicated book detail page view
│   │   │   └── QuickViewModal.tsx        # Fast preview drawer with bundle offers
│   │   ├── cart/                         # Shopping cart & line calculations
│   │   │   └── SlideOverCart.tsx         # Slide-over cart panel with free delivery meter
│   │   ├── checkout/                     # Order placement & address capture
│   │   │   └── CheckoutFlowModal.tsx     # Idempotent campus checkout modal
│   │   ├── scanner/                      # Optical ISBN & camera scanner
│   │   │   └── EditorialScannerView.tsx  # Interactive scanner with OpenLibrary fallback
│   │   ├── orders/                       # Order history & cancellation
│   │   │   └── OrdersView.tsx            # Student order history & status tracking
│   │   ├── wishlist/                     # Saved reading list
│   │   │   └── WishlistView.tsx          # Saved items grid with one-click cart transfer
│   │   ├── recommendations/              # AI-powered book recommendations
│   │   │   └── AIReadingAdvisor.tsx      # Google Gemini campus reading advisor modal
│   │   └── admin/                        # Administrative operations & inventory
│   │       └── AdminDashboard.tsx        # Role-gated control tower with analytics
│   │
│   ├── hooks/                            # Custom reusable React hooks
│   │   ├── useModalA11y.ts               # Modal focus trap, escape key, and restoration
│   │   ├── useAuth.ts                    # User session, login, register, and demo accounts
│   │   ├── useCart.ts                    # Cart items, totals, discount coupons, and checkout
│   │   └── useWishlist.ts                # Saved books synchronization
│   │
│   ├── services/                         # External communication & API clients
│   │   ├── api/
│   │   │   ├── client.ts                 # Base HTTP request wrapper with JWT headers
│   │   │   ├── authApi.ts                # Authentication & session endpoints
│   │   │   ├── booksApi.ts               # Catalogue querying, filtering, and detail
│   │   │   ├── cartApi.ts                # Server-authoritative cart operations
│   │   │   ├── ordersApi.ts              # Idempotent checkout & order cancellation
│   │   │   ├── scannerApi.ts             # ISBN optical scanning & OpenLibrary search
│   │   │   ├── recommendationsApi.ts     # Gemini AI recommendation calls
│   │   │   └── adminApi.ts               # Inventory management & order dispatch
│   │   └── index.ts                      # Central API facade
│   │
│   ├── data/
│   │   └── bookCatalog.ts                # Fallback initial catalogue fixtures
│   ├── styles/
│   │   └── animated-lamp-login.css       # Scoped dark glassmorphism lamp styles
│   ├── types.ts                          # Shared frontend TypeScript interfaces
│   ├── api.ts                            # Backward-compatible API facade
│   ├── index.css                         # Tailwind CSS imports & global design tokens
│   ├── main.tsx                          # React DOM entry point
│   └── App.tsx                           # Clean, modular top-level view orchestrator
│
├── server/                               # Backend Application (Express 4 + Better-SQLite3)
│   ├── config/
│   │   └── index.ts                      # Environment validation & configuration tokens
│   ├── database/
│   │   └── index.ts                      # SQLite connection, DDL schema, WAL mode, migrations
│   ├── db/
│   │   └── database.ts                   # Backward-compatible re-export for legacy imports
│   ├── errors/
│   │   └── AppError.ts                   # Standardized HTTP error hierarchy
│   ├── middleware/
│   │   ├── auth.ts                       # JWT verification & role authorization
│   │   ├── cors.ts                       # Whitelist CORS origin validation
│   │   ├── errorHandler.ts               # Centralized error formatting & sanitization
│   │   ├── rateLimiter.ts                # IP/User scoped rate limiters
│   │   └── securityHeaders.ts            # CSP, HSTS, frame options, and permissions policy
│   ├── validators/
│   │   └── requestValidators.ts          # Input sanitization & request validation helpers
│   ├── controllers/                      # Request handling & HTTP response mapping
│   │   ├── authController.ts
│   │   ├── booksController.ts
│   │   ├── cartController.ts
│   │   ├── ordersController.ts
│   │   ├── reviewsController.ts
│   │   └── wishlistController.ts
│   ├── routes/                           # API route definitions
│   │   ├── auth.ts
│   │   ├── books.ts
│   │   ├── categories.ts
│   │   ├── cart.ts
│   │   ├── wishlist.ts
│   │   ├── orders.ts
│   │   ├── admin.ts
│   │   ├── reviews.ts
│   │   ├── coupons.ts
│   │   ├── scanner.ts
│   │   └── recommendations.ts
│   ├── services/                         # Business & third-party integrations
│   │   ├── gemini.ts                     # Google Gemini AI SDK integration
│   │   └── scannerMatcher.ts             # OCR/ISBN pattern matcher & OpenLibrary gateway
│   ├── server.ts                         # Express application setup & middleware assembly
│   └── index.ts                          # Backend process launcher
│
├── scripts/                              # Verification suites & catalogue migration tools
│   ├── test-animated-lamp-login.mjs      # Playwright lamp login suite (18 scenarios)
│   ├── test-admin-auth.mjs               # Admin authentication & role isolation suite
│   ├── test-a11y.mjs                     # Accessibility verification suite
│   ├── test-ai-advisor.mjs               # Gemini advisor fallback & live smoke tests
│   ├── verify-all-fixes.mjs              # 126-test comprehensive e2e regression suite
│   └── import-book-catalogue.mjs         # Safe 300-book catalogue import workflow
│
├── .env.example                          # Sanitized environment variable template
├── .gitignore                            # Clean exclusion rules
├── README.md                             # Professional repository documentation
├── CONTRIBUTING.md                       # Developer contribution guidelines
├── SECURITY.md                           # Vulnerability disclosure & security policies
├── package.json                          # Project manifest & npm scripts
├── tsconfig.json                         # TypeScript compiler configuration
└── vite.config.ts                        # Vite bundler & reverse proxy configuration
```

---

## 3. Existing-to-New File Mapping

| Original Location | Target Location | Rationale | Backward Compatibility |
| :--- | :--- | :--- | :--- |
| `src/components/Navbar.tsx` | `src/components/layout/Navbar.tsx` | Shared layout component | Re-exported via `src/components/index.ts` |
| `src/components/HeroSection.tsx` | `src/components/layout/HeroSection.tsx` | Storefront banner layout | Re-exported via `src/components/index.ts` |
| `src/components/BookCard.tsx` | `src/components/common/BookCard.tsx` | Reusable presentation atom | Re-exported via `src/components/index.ts` |
| `src/components/CategoryGrid.tsx` | `src/components/common/CategoryGrid.tsx` | Departmental shelf selector | Re-exported via `src/components/index.ts` |
| `src/components/AuthModal.tsx` | `src/features/auth/AuthModal.tsx` | Feature module (auth) | Re-exported via `src/components/index.ts` |
| `src/components/AnimatedLampLogin.tsx` | `src/features/auth/AnimatedLampLogin.tsx` | Feature module (auth) | Re-exported via `src/components/index.ts` |
| `src/components/BookDetailPage.tsx` | `src/features/books/BookDetailPage.tsx` | Feature module (books) | Re-exported via `src/components/index.ts` |
| `src/components/QuickViewModal.tsx` | `src/features/books/QuickViewModal.tsx` | Feature module (books) | Re-exported via `src/components/index.ts` |
| `src/components/SlideOverCart.tsx` | `src/features/cart/SlideOverCart.tsx` | Feature module (cart) | Re-exported via `src/components/index.ts` |
| `src/components/CheckoutFlowModal.tsx` | `src/features/checkout/CheckoutFlowModal.tsx` | Feature module (checkout) | Re-exported via `src/components/index.ts` |
| `src/components/EditorialScannerView.tsx` | `src/features/scanner/EditorialScannerView.tsx` | Feature module (scanner) | Re-exported via `src/components/index.ts` |
| `src/components/OrdersView.tsx` | `src/features/orders/OrdersView.tsx` | Feature module (orders) | Re-exported via `src/components/index.ts` |
| `src/components/WishlistView.tsx` | `src/features/wishlist/WishlistView.tsx` | Feature module (wishlist) | Re-exported via `src/components/index.ts` |
| `src/components/AIReadingAdvisor.tsx` | `src/features/recommendations/AIReadingAdvisor.tsx` | Feature module (advisor) | Re-exported via `src/components/index.ts` |
| `src/components/AdminDashboard.tsx` | `src/features/admin/AdminDashboard.tsx` | Feature module (admin) | Re-exported via `src/components/index.ts` |
| `src/api.ts` | `src/services/api/*` + `src/api.ts` | Broken into domain clients | `src/api.ts` facade preserved |
| `server/db/database.ts` | `server/database/index.ts` | Unified single source | `server/db/database.ts` re-export preserved |

---

## 4. Import Alias Strategy

The existing TypeScript and Vite configuration maps `@/*` to the project root:
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```
This is preserved. In addition, barrel re-exports (`src/components/index.ts`, `src/services/index.ts`) allow consumers to import components from their original paths or clean package-style specifiers.

---

## 5. Dependency Boundaries & Rules

1. **Feature Independence:** Feature modules in `src/features/` must not directly depend on each other's internal state. Cross-feature communication happens via shared hooks, application state, or event callbacks.
2. **UI vs Business Logic:** Presentation components in `src/components/` and `src/features/*/` focus exclusively on rendering and accessibility. Data fetching and mutations are delegated to custom hooks and `src/services/api/`.
3. **Server Authoritative Logic:** Cart totals, discount computations, order validation, and permission checks are enforced strictly by the backend. Client computations serve only as immediate optimistic UI indicators.
4. **Zero Secret Leakage:** Client-side bundles contain zero backend credentials or JWT signing secrets. Backend configuration strictly validates environment keys at startup.
