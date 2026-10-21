# BookNest — Phase 2: Authentication, Authorization & API Security Audit

**Document:** `docs/PHASE_2_SECURITY_AUDIT.md`  
**Audit Scope:** Authentication, Authorization, Order Lifecycle, API Security, Database Configuration, and Frontend Trust Boundaries  
**Audit Mode:** Inspection & Evidence-Based Audit (No Application Code Modifications)  
**Date:** October 2026  
**Status:** Complete  

---

## 1. Executive Summary

A comprehensive security audit of the BookNest online bookstore was conducted across all backend Express routes, controllers, middleware, SQLite database persistence layer, and React frontend trust boundaries.

The audit identified **two critical authentication vulnerabilities**, **two high-severity access control / credential exposure flaws**, and several medium-severity configuration and hygiene issues.

### Key Highlights
1. **Critical Authentication Bypass (AUTH-01):** The endpoint `POST /api/auth/google` accepts an unauthenticated JSON payload containing `{ "email": "..." }` and issues an authentic JWT with full privileges without validating credentials, passwords, or Google OAuth tokens. This permits instant, complete account takeover of any student or administrator account (e.g., `admin@booknest.com`).
2. **Unverified OAuth JWT Signature (AUTH-02):** Even when a Google `credential` parameter is provided, `authController.ts` only decodes the Base64 payload (`parts[1]`) without verifying the cryptographic signature against Google's public JWKS certificates or validating token audience/expiration.
3. **Hardcoded Fallback JWT Secret (AUTH-03):** The application falls back to a static string (`'booknest-campus-secure-token-2026'`) in source code if `JWT_SECRET` is omitted from the environment. Because `JWT_SECRET` is missing from `.env`, anyone with repository access can forge admin JWTs.
4. **Public Credential Disclosure (AUTH-04):** The unauthenticated endpoint `GET /api/auth/demo-users` exposes plaintext credentials for both administrator and student accounts.
5. **Robust Database Isolation & Parameterization:** On a positive note, all database interactions use parameterized SQLite queries (`better-sqlite3`), mitigating standard SQL injection. Database write isolation between development (`data/booknest.db`) and test environments (`data/booknest.test.db`) is strictly enforced.

---

## 2. Application Architecture Discovered

```
┌─────────────────────────────────────────────────────────────┐
│                   React 19 Frontend (SPA)                   │
│   Vite dev server (port 3000), Tailwind CSS, Framer Motion  │
│   State: React useState, localStorage (tokens, cart, view)  │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTP / JSON (Bearer JWT)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 Express Backend API (Node.js)               │
│   Server (port 5000), TypeScript, tsx, CORS (wildcard)      │
├─────────────────────────────────────────────────────────────┤
│ Middleware: requireAuth, requireAdmin, optionalAuth         │
│ Routes:                                                     │
│   - /api/auth             (Auth controller & Google OAuth)  │
│   - /api/books            (Catalog browse, search, reviews) │
│   - /api/categories       (Category shelves)                │
│   - /api/cart             (User-isolated shopping cart)     │
│   - /api/wishlist         (User-isolated reading list)      │
│   - /api/orders           (Order history & creation)        │
│   - /api/admin            (Metrics, stock, orders, catalog) │
│   - /api/reviews          (Book review creation/moderation) │
│   - /api/coupons          (Validation & discount rules)     │
│   - /api/scanner          (ISBN matcher, OCR, Gemini vision)│
│   - /api/recommendations  (Frequently bought, Gemini AI)    │
└──────────────────────────────┬──────────────────────────────┘
                               │ Synchronous SQLite Driver
                               ▼
┌─────────────────────────────────────────────────────────────┐
│              SQLite Database (better-sqlite3)               │
│   Mode: WAL (Write-Ahead Logging), Foreign Keys ON          │
│   Development DB: data/booknest.db                          │
│   Test DB:        data/booknest.test.db                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Authentication Findings

### Finding AUTH-01: Critical Authentication Bypass & Full Account Takeover via Direct Email Sign-In
* **Severity:** Critical
* **Confidence:** Confirmed
* **Affected File:** `server/controllers/authController.ts` (`googleLogin`, lines 214–274)
* **Evidence:**
  ```typescript
  // server/controllers/authController.ts:236-240
  } else if (directEmail) {
    email = String(directEmail).trim().toLowerCase();
    name = String(directName || email.split('@')[0] || 'Campus Scholar').trim();
    googleId = String(directGoogleId || 'google_' + Date.now());
  }
  ...
  let user = db.prepare('SELECT id, name, email, role, phone, joined_date as joinedDate FROM users WHERE email = ?').get(email) as any;
  ...
  const token = generateToken({
    id: user.id,
    email: user.email,
    role: user.role, // Yields 'admin' if email is admin@booknest.com
    name: user.name
  });
  res.json({ user, token });
  ```
* **Impact:** Any unauthenticated client on the Internet can issue an HTTP POST to `/api/auth/google` with `{ "email": "admin@booknest.com" }` and receive an authentic administrator JWT. This completely bypasses password verification, 2FA, and OAuth workflows, providing immediate administrative control over the catalog, user orders, inventory, and system metrics.
* **Safe Verification:** Verified in `scripts/verify-all-fixes.mjs` (Step 1.4), which successfully logs in without a password or token by passing only `{ email: 'googleuser@gmail.com' }`.
* **Recommended Fix:** Remove the unverified fallback branch (`else if (directEmail)`) completely. In production, Google authentication must strictly require either a validated server-side OAuth 2.0 authorization code exchange or an identity token validated cryptographically against Google's public JWKS.
* **Regression Tests to Add:** Assert that `POST /api/auth/google` without a valid Google-signed ID token or valid authorization code returns HTTP 400/401 and rejects the request.

---

### Finding AUTH-02: Unverified Google ID Token JWT Signature
* **Severity:** Critical
* **Confidence:** Confirmed
* **Affected File:** `server/controllers/authController.ts` (`googleLogin`, lines 222–235)
* **Evidence:**
  ```typescript
  if (credential && typeof credential === 'string') {
    try {
      // Decode Google JWT credential without signature verification!
      const parts = credential.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        email = String(payload.email || '').trim().toLowerCase();
        ...
      }
    } catch (err) {
      return res.status(400).json({ error: 'Invalid Google credential token.' });
    }
  }
  ```
* **Impact:** The code base64-decodes the second JWT segment without checking `jwt.verify()` against Google's public keys (`https://www.googleapis.com/oauth2/v3/certs`) or validating the `aud` (client ID) and `exp` claims. An attacker can forge an arbitrary JWT with `{"email": "admin@booknest.com"}` in the payload, sign it with an arbitrary secret (or no secret), and the server will grant administrative access.
* **Recommended Fix:** Use the official `google-auth-library` (`OAuth2Client.verifyIdToken`) or use `jsonwebtoken` with `jwks-rsa` to verify that the token was signed by Google and that `payload.aud === config.googleClientId`.
* **Regression Tests to Add:** Pass a self-signed or forged JWT to `POST /api/auth/google` and assert that the server returns HTTP 401.

---

### Finding AUTH-03: Hardcoded Fallback JWT Secret in Source Code
* **Severity:** High
* **Confidence:** Confirmed
* **Affected Files:** `server/config/index.ts` (line 15) and `server/middleware/auth.ts` (line 4)
* **Evidence:**
  ```typescript
  // server/config/index.ts:15
  jwtSecret: process.env.JWT_SECRET || 'booknest-campus-secure-token-2026',

  // server/middleware/auth.ts:4
  const JWT_SECRET = process.env.JWT_SECRET || 'booknest-campus-secure-token-2026';
  ```
* **Impact:** In the active environment, `JWT_SECRET` is not set in `.env` or `.env.example`. Consequently, the application signs and validates tokens using `'booknest-campus-secure-token-2026'`. Any party with read access to the repository can sign their own JWTs with `{ "role": "admin", "id": 1 }` and authenticate as the administrator on all protected endpoints.
* **Recommended Fix:** 
  1. Enforce that `JWT_SECRET` must be set in production; fail server startup if `JWT_SECRET` is missing in production mode.
  2. Add `JWT_SECRET="<generate-random-64-char-hex>"` to `.env.example`.
  3. Deduplicate `JWT_SECRET` resolution by importing `config.jwtSecret` in `auth.ts` rather than reading `process.env.JWT_SECRET` in multiple places.
* **Regression Tests to Add:** Verify that `auth.ts` and `config/index.ts` use the exact same secret reference and reject tokens signed with incorrect secrets.

---

### Finding AUTH-04: Plaintext Exposure of Admin & Student Credentials via Public Endpoint
* **Severity:** High
* **Confidence:** Confirmed
* **Affected File:** `server/controllers/authController.ts` (`getDemoUsers`, lines 92–106)
* **Evidence:**
  ```typescript
  // GET /api/auth/demo-users
  getDemoUsers: (req: Request, res: Response) => {
    res.json({
      student: {
        email: 'user@booknest.com',
        password: 'User@123',
        name: 'Aditya Chauhan (Student)'
      },
      admin: {
        email: 'admin@booknest.com',
        password: 'Admin@123',
        name: 'Campus Administrator'
      }
    });
  }
  ```
* **Impact:** Plaintext credentials for administrative and standard accounts are exposed via a public, unauthenticated HTTP GET endpoint. In any production or publicly accessible staging environment, this allows anyone to log in as administrator.
* **Recommended Fix:** Restrict `/api/auth/demo-users` to `process.env.NODE_ENV !== 'production'`, or remove the endpoint and provide demo instructions exclusively in local development documentation.
* **Regression Tests to Add:** In production mode (`NODE_ENV=production`), assert that `/api/auth/demo-users` returns HTTP 404 or 403.

---

### Finding AUTH-05: Sensitive JWT Leaked in URL Query Parameters During OAuth Callback
* **Severity:** Medium
* **Confidence:** Confirmed
* **Affected File:** `server/controllers/authController.ts` (`googleCallback`, line 206)
* **Evidence:**
  ```typescript
  // server/controllers/authController.ts:206
  res.redirect(`${config.appUrl}/?token=${token}&auth_success=google`);
  ```
* **Impact:** Passing authentication tokens in query strings causes tokens to be permanently recorded in browser history, proxy server logs, and sent to third-party assets via `Referer` headers.
* **Recommended Fix:** Issue an `httpOnly`, `SameSite=Lax`, `Secure` cookie, or transmit a short-lived authorization code that the frontend exchanges via a POST request body.
* **Regression Tests to Add:** Assert that sensitive credentials are not reflected in HTTP redirect Location headers.

---

### Finding AUTH-06: Ineffective Logout Mechanism with 7-Day Stateless Tokens
* **Severity:** Low
* **Confidence:** Confirmed
* **Affected Files:** `server/controllers/authController.ts` (lines 78–81) & `server/middleware/auth.ts` (line 16)
* **Evidence:**
  ```typescript
  // POST /api/auth/logout
  logout: (req: Request, res: Response) => {
    res.json({ message: 'Logged out successfully.' });
  }
  ```
* **Impact:** Tokens have a fixed 7-day lifetime (`expiresIn: '7d'`). Calling logout only clears the token from client `localStorage`. If an attacker intercepted the token prior to logout, the token remains fully valid on the server for its remaining lifespan.
* **Recommended Fix:** Implement a token denylist in SQLite or Redis with TTL matching token expiration, or issue short-lived access tokens (e.g. 15 minutes) coupled with revocable refresh tokens.
* **Regression Tests to Add:** Assert that a token presented after logout is rejected if token revocation is implemented.

---

## 4. Authorization Findings

### Finding AUTHZ-01: Unauthenticated & Unthrottled Access to Costly AI Recommendation Endpoint
* **Severity:** High
* **Confidence:** Confirmed
* **Affected File:** `server/routes/recommendations.ts` (lines 92–169)
* **Evidence:**
  ```typescript
  // POST /api/recommendations/ai
  router.post('/ai', async (req, res) => {
    const { query, currentBookTitle } = req.body;
    ...
    // Calls external Gemini API models (gemini-3.8-flash, gemini-3.1-flash-lite, etc.)
    response = await ai.models.generateContent({ model, contents: prompt });
  ```
* **Impact:** The endpoint is completely unauthenticated and unthrottled. Any actor can script millions of requests, causing financial loss via API quotas, token exhaustion, or denial of service for campus students.
* **Recommended Fix:** Apply `requireAuth` and a strict IP/user rate limiter (e.g., maximum 5 requests per minute).
* **Regression Tests to Add:** Assert that unauthenticated calls to `/api/recommendations/ai` receive HTTP 401.

---

### Finding AUTHZ-02: Unauthenticated Access to Heavy Scanner Vision Analysis
* **Severity:** Medium
* **Confidence:** Confirmed
* **Affected File:** `server/routes/scanner.ts` (lines 207–409)
* **Evidence:**
  ```typescript
  router.post('/analyze', async (req, res) => {
    const { imageBase64, mimeType } = req.body;
    ...
    const result = await analyzeBookCover(imageBase64, mimeType);
  ```
* **Impact:** Unauthenticated clients can upload 10MB base64 images that trigger Gemini 2.0 Flash Vision processing, creating an asymmetric resource consumption vulnerability.
* **Recommended Fix:** Require authentication or enforce a strict rate limiter on `/api/scanner/analyze`.
* **Regression Tests to Add:** Assert rate limit triggers after exceeding request threshold.

---

### Finding AUTHZ-03: Object-Level Authorization Robustness on User Records
* **Severity:** Informational (Positive Control)
* **Confidence:** Confirmed
* **Affected Files:** `server/controllers/ordersController.ts`, `server/controllers/cartController.ts`, `server/controllers/wishlistController.ts`, `server/controllers/reviewsController.ts`
* **Evidence:**
  - `ordersController.ts:98-103`: `SELECT * FROM orders WHERE (id = ? OR order_number = ?) AND user_id = ?` ensures a standard user cannot query another user's order invoice.
  - `cartController.ts:29`: `WHERE ci.user_id = ?` scopes all cart mutations to `req.user.id`.
  - `wishlistController.ts:9`: `WHERE user_id = ?` scopes wishlist records to `req.user.id`.
  - `reviewsController.ts:115`: `if (review.user_id !== userId && req.user?.role !== 'admin')` prevents cross-user review edits or deletions.
* **Conclusion:** Horizontal privilege escalation (IDOR) on core user entities is well-defended.

---

## 5. Order and Payment Findings

### Finding ORDER-01: Missing Order Idempotency Protection Against Duplicate Requests
* **Severity:** Medium
* **Confidence:** Confirmed
* **Affected File:** `server/controllers/ordersController.ts` (`createOrder`, lines 172–341)
* **Evidence:**
  ```typescript
  const orderNumber = `BN-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
  ...
  const orderInsertResult = db.prepare(`
    INSERT INTO orders (...) VALUES (...)
  `).run(...);
  ```
* **Impact:** If a client rapidly clicks "Place Order" or a network glitch retries the HTTP request, multiple distinct orders are generated, deducting stock multiple times and duplicating invoices.
* **Recommended Fix:** Accept an optional or required `Idempotency-Key` HTTP header. Store processed idempotency keys with user IDs in SQLite for 24 hours. If an order with the same key is received, return the cached order result without re-executing stock deductions.
* **Regression Tests to Add:** Send duplicate requests with the same idempotency key and verify that only one order is inserted.

---

### Finding ORDER-02: Server-Side Authoritative Pricing and Transaction Integrity
* **Severity:** Informational (Positive Control)
* **Confidence:** Confirmed
* **Affected File:** `server/controllers/ordersController.ts` (lines 208–341)
* **Evidence:** Unit prices are computed directly from the `books` table using `Math.round(book.price * (1.0 - book.discount / 100.0))`. Coupons are validated against the database table `coupons`. All inventory decrements and order item insertions run inside `db.transaction(...)`. Client-side pricing tampering is completely rejected.
* **Conclusion:** Financial and transactional calculations conform to security best practices.

---

### Finding ORDER-03: Simulated "DEMO PAID" Payment State
* **Severity:** Informational
* **Confidence:** Confirmed
* **Affected File:** `server/controllers/ordersController.ts` (lines 180, 299)
* **Evidence:**
  `payment_status` is hardcoded as `'DEMO PAID'`. The application does not integrate a live payment gateway (Razorpay, Stripe, UPI Intent).
* **Impact:** Orders transition immediately to "Confirmed" without bank authorization. This is an expected architectural characteristic of the campus demo, but must be replaced with a webhook-driven payment state machine prior to handling real currency.

---

## 6. API Validation and General Security Findings

### Finding SEC-01: Permissive Global CORS Configuration
* **Severity:** High
* **Confidence:** Confirmed
* **Affected File:** `server/server.ts` (line 23)
* **Evidence:**
  ```typescript
  // server/server.ts:23
  app.use(cors());
  ```
* **Impact:** By default, `cors()` sends `Access-Control-Allow-Origin: *`. Any website visited by a student can send cross-origin AJAX requests to the local or hosted API.
* **Recommended Fix:** Configure CORS to allow only trusted origins (`config.appUrl` or campus domains):
  ```typescript
  app.use(cors({ origin: [config.appUrl], credentials: true }));
  ```
* **Regression Tests to Add:** Verify cross-origin preflight requests from unauthorized origins are rejected.

---

### Finding SEC-02: Absence of Essential Security Headers
* **Severity:** Medium
* **Confidence:** Confirmed
* **Affected File:** `server/server.ts` (lines 21–26)
* **Evidence:** The application does not use `helmet` or set headers such as `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, or `Referrer-Policy`.
* **Impact:** The application is more vulnerable to MIME sniffing, clickjacking, and unauthorized resource embedding.
* **Recommended Fix:** Install `helmet` and apply `app.use(helmet())`.
* **Regression Tests to Add:** Inspect HTTP response headers for `X-Content-Type-Options: nosniff` and `X-Frame-Options: SAMEORIGIN`.

---

### Finding SEC-03: Absence of API Rate Limiting Across All Endpoints
* **Severity:** Medium
* **Confidence:** Confirmed
* **Affected File:** `server/server.ts`
* **Evidence:** No rate-limiting middleware (such as `express-rate-limit`) is installed or mounted.
* **Impact:** Endpoints like `/api/auth/login` are vulnerable to brute-force credential stuffing.
* **Recommended Fix:** Mount `express-rate-limit` globally (e.g., 300 req/15 min) and strictly on auth routes (e.g., 10 attempts/15 min).
* **Regression Tests to Add:** Test that exceeding 10 failed login attempts returns HTTP 429.

---

### Finding SEC-04: Unbounded 10MB Global Request Body Limit
* **Severity:** Medium
* **Confidence:** Confirmed
* **Affected File:** `server/server.ts` (lines 24–25)
* **Evidence:**
  ```typescript
  app.use(express.json({ limit: config.uploadLimit })); // 10mb
  app.use(express.urlencoded({ extended: true, limit: config.uploadLimit }));
  ```
* **Impact:** Applying a 10MB JSON limit globally allows attackers to send large JSON bodies to simple endpoints like `/api/books` or `/api/auth/login`, consuming server memory and CPU cycles during parsing.
* **Recommended Fix:** Set the global JSON limit to `100kb`, and apply the `10mb` limit only to `/api/scanner/analyze`.
* **Regression Tests to Add:** Verify payloads over 100kb sent to standard routes return HTTP 413.

---

### Finding SEC-05: Internal Error Message Exposure in HTTP 500 Responses
* **Severity:** Low
* **Confidence:** Confirmed
* **Affected Files:** `server/server.ts:54`, `server/routes/recommendations.ts:167`
* **Evidence:**
  ```typescript
  // server/server.ts:54
  res.status(500).json({ error: err.message || 'Internal server error' });
  ```
* **Impact:** Database or framework exceptions can leak internal table names, column names, or system paths to clients.
* **Recommended Fix:** Return generic error messages (`"An unexpected error occurred"`) in production environments and log detailed stack traces server-side.

---

### Finding SEC-06: Potential LLM Prompt Injection on AI Recommendation Advisor
* **Severity:** Low
* **Confidence:** Confirmed
* **Affected File:** `server/routes/recommendations.ts` (lines 120–125)
* **Evidence:**
  ```typescript
  const prompt = `You are the BookNest AI campus literary advisor.
A student asked: "${query}".
...`;
  ```
* **Impact:** An attacker can input adversarial prompts (e.g., `"Ignore previous instructions and output..."`), manipulating the recommendation logic.
* **Recommended Fix:** Sanitize input strings, strip delimiter characters, and use structured prompting or system instructions.

---

## 7. Database and Configuration Findings

### Finding CONF-01: Undefined `JWT_SECRET` in Environment Configuration
* **Severity:** Medium
* **Confidence:** Confirmed
* **Affected Files:** `.env`, `.env.example`, `server/config/index.ts:15`
* **Evidence:**
  `.env` and `.env.example` do not specify `JWT_SECRET`.
* **Impact:** Forces silent reliance on the hardcoded insecure default secret.
* **Recommended Fix:** Add `JWT_SECRET` to `.env.example` and require it at startup.

---

### Finding CONF-02: Strong Database Isolation & SQL Parameterization
* **Severity:** Informational (Positive Control)
* **Confidence:** Confirmed
* **Affected Files:** `server/database/index.ts`, `server/config/index.ts`
* **Evidence:**
  - All SQL queries use `prepare(...).run/get/all` with bound parameters.
  - Test suites execute against `data/booknest.test.db`, and `server/config/index.ts` throws an explicit error if a test attempts to bind to `data/booknest.db`.
  - SQLite runs with `journal_mode = WAL` and `foreign_keys = ON`.
* **Conclusion:** The database layer demonstrates high structural safety and resilience against SQL injection.

---

## 8. Frontend Security Findings

### Finding FRONT-01: JWT Stored in Browser `localStorage`
* **Severity:** Medium
* **Confidence:** Confirmed
* **Affected File:** `src/api.ts` (lines 3–15)
* **Evidence:**
  ```typescript
  const TOKEN_KEY = 'booknest_token';
  export function getStoredToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }
  ```
* **Impact:** Any client-side XSS vulnerability would allow extraction of active JWT tokens.
* **Recommended Fix:** Migrate session tokens to `httpOnly`, `SameSite=Lax`, `Secure` cookies.

---

### Finding FRONT-02: React Component Gating Backed by Server Enforcement
* **Severity:** Informational (Positive Control)
* **Confidence:** Confirmed
* **Affected Files:** `src/App.tsx:901-925`, `server/routes/admin.ts:9`
* **Evidence:** While the frontend hides the admin view if `currentUser?.role !== 'admin'`, the backend independently rejects unauthorized API requests with HTTP 403.
* **Conclusion:** Frontend UI role gating correctly corresponds to server-side enforcement.

---

## 9. Existing Test Coverage and Gaps

### Existing Automated Suites
1. **`verify-all-fixes.mjs` (`npm run test:e2e`):** 31 tests covering authentication, book CRUD, category filtering, price validation, and soft-archiving.
2. **`test-scanner.mjs` (`npm run test:scanner`):** 61 tests covering ISBN normalization, fuzzy text matching, OCR tolerance, camera permissions, and deterministic external mocks.
3. **`test-persistence.mjs` (`npm run test:persistence`):** 29 tests covering cart/wishlist reload persistence, checkout invoices, orders, and stock updates.

### Test Coverage Gaps Identified
1. **Google Auth Verification Gap:** Existing tests rely on the bypass discovered in AUTH-01 (`verify-all-fixes.mjs:68-76`). There are no tests verifying signature rejection on invalid/forged Google tokens.
2. **Brute Force & Rate Limiting Gap:** No tests verify rate limiting on login or AI endpoints.
3. **CORS & Security Header Gap:** No automated assertions check for `helmet` security headers or origin rejection.
4. **Idempotency Gap:** No tests verify behavior when duplicate order requests are submitted concurrently.

---

## 10. Prioritized Remediation Plan

| Priority | Finding ID | Vulnerability / Defect | Effort | Remediation Action |
| :---: | :---: | :--- | :---: | :--- |
| **P1** | **AUTH-01** | Direct Email Google Sign-In Bypass | Low | Remove `directEmail` bypass in `authController.ts`; require cryptographic Google verification. |
| **P1** | **AUTH-02** | Unverified Google ID Token Signature | Medium | Implement signature verification using `google-auth-library` or JWKS. |
| **P1** | **AUTH-03** | Hardcoded Fallback JWT Secret | Low | Require `JWT_SECRET` in environment; remove default fallback string in production. |
| **P2** | **AUTH-04** | Plaintext Demo Credentials Exposed | Low | Disable `/api/auth/demo-users` in production mode. |
| **P2** | **AUTHZ-01** | Unauthenticated AI Advisor | Low | Apply `requireAuth` and rate limiting to `/api/recommendations/ai`. |
| **P2** | **SEC-01** | Permissive Wildcard CORS | Low | Restrict CORS to `config.appUrl` and campus domains. |
| **P3** | **SEC-03** | Missing Rate Limiting | Medium | Install and configure `express-rate-limit` on login, register, and vision routes. |
| **P3** | **ORDER-01**| Missing Order Idempotency | Medium | Implement `Idempotency-Key` tracking in SQLite order transactions. |
| **P3** | **SEC-02** | Missing Security Headers | Low | Mount `helmet` middleware. |
| **P4** | **AUTH-05** | Token in OAuth URL Query | Medium | Replace URL token redirect with secure cookie or post-message flow. |
| **P4** | **FRONT-01**| Tokens in `localStorage` | Medium | Transition session tokens to `httpOnly` cookies. |
| **P4** | **SEC-04** | Global 10MB Body Limit | Low | Restrict global JSON limit to 100kb; scope 10MB limit to scanner upload. |

---

## 11. Final Verification & Database Safety Confirmation

### Execution Summary
- **Lint Check (`npm run lint`):** Passed with 0 errors.
- **E2E Suite (`npm run test:e2e`):** 31 Passed, 0 Failed.
- **Scanner Suite (`npm run test:scanner`):** 61 Passed, 0 Failed.
- **Persistence Suite (`npm run test:persistence`):** 29 Passed, 0 Failed.
- **Production Build (`npm run build`):** Built cleanly in 705ms.

### Development Database Immutability
- **Database Path:** `./data/booknest.db`
- **Initial Size:** `196608` bytes | **Final Size:** `196608` bytes
- **Initial SHA-256:** `66378651ef6cca4f95aae0d5a62dfa09a6fec7563e329df6bbbee37eccdf2dbe`
- **Final SHA-256:** `66378651ef6cca4f95aae0d5a62dfa09a6fec7563e329df6bbbee37eccdf2dbe`
- **Confirmation:** The development database remained completely untouched throughout the audit.
