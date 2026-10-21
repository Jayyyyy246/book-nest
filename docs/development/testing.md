# BookNest — Testing & Quality Assurance Guide

BookNest employs a multi-layered verification strategy combining static analysis, production bundle compilation, backend integration tests, browser UI automation, accessibility audits, and security regression checks.

---

## 1. Test Suite Overview

| Test Suite | Scope | Command | Total Tests |
|:---|:---|:---|:---:|
| **Type Checking & Lint** | TypeScript static analysis across client & server | `npm run lint` | 0 errors |
| **Production Build** | Vite production bundle compilation & tree shaking | `npm run build` | 0 errors |
| **Backend Integration** | API routing, SQLite transactions, Auth, AI, Scanner | `npm run test:e2e` | 126 tests |
| **Animated Lamp Login** | Lamp string physics, dark glassmorphism, accessibility | `node scripts/test-animated-lamp-login.mjs` | 48 tests |
| **Admin Authentication** | Admin credential verification, JWT tampering, RBAC | `node scripts/test-admin-auth.mjs` | 14 tests |
| **Accessibility (WCAG)** | Skip links, ARIA live regions, focus trap, dark mode | `node scripts/test-a11y.mjs` | 38 tests |
| **Total Test Battery** | Complete regression and compliance coverage | All suites | **226 tests (100% pass rate)** |

---

## 2. Running Test Suites

### 2.1 Static Analysis & Build Verification
Verify type safety and compile the production bundle:
```bash
npm run lint
npm run build
```

### 2.2 Backend E2E & Integration Suite
Runs comprehensive HTTP tests using an isolated in-memory or dedicated test database (`data/booknest.test.db`):
```bash
npm run test:e2e
```
Key scenarios verified:
- User registration, login, JWT validation, and token tampering prevention.
- Optical scanner validation, magic-byte inspection, and 15MB payload handling.
- Concurrency and race-condition prevention during checkouts.
- Order idempotency via `Idempotency-Key` headers.
- Rate limit enforcement across auth, AI, and scanner endpoints.
- Role-based authorization for administrative routes.

### 2.3 Browser Automation & Interaction Suites
*Ensure the dev server is running on `http://localhost:3000` before running Playwright browser scripts:*

```bash
# Test the animated lamp login experience (48 tests)
node scripts/test-animated-lamp-login.mjs

# Test admin authentication and role guards (14 tests)
node scripts/test-admin-auth.mjs

# Test accessibility, keyboard focus traps, and WCAG AA compliance (38 tests)
node scripts/test-a11y.mjs
```

---

## 3. Database Safety & Test Isolation

To prevent accidental data loss or corruption of development catalogs:
- **Automatic Test Isolation**: In `NODE_ENV=test`, the database path automatically resolves to `data/booknest.test.db`.
- **Database Safety Guard**: `server/config/index.ts` enforces a safety guard that throws an immediate error if a test process attempts to run against `data/booknest.db`.
- **Transaction Rollbacks**: Multi-item inventory tests verify atomic rollbacks upon failure to ensure catalog numbers never become negative or inconsistent.
