# BookNest — Phase 2.2.1: API Security Edge-Case Verification Report

**Document:** `docs/PHASE_2_2_1_VERIFICATION.md`  
**Phase:** Phase 2.2.1 — API Security Edge-Case Verification & Quality Audit  
**Date:** October 2026  
**Status:** Complete & Fully Verified  
**Baseline Database SHA-256:** `66378651ef6cca4f95aae0d5a62dfa09a6fec7563e329df6bbbee37eccdf2dbe`  
**Post-Verification SHA-256:** `66378651ef6cca4f95aae0d5a62dfa09a6fec7563e329df6bbbee37eccdf2dbe` (Intact & Untouched)  

---

## 1. Executive Summary

Phase 2.2.1 performed an empirical verification and edge-case audit of the security controls implemented in Phase 2.2 (`docs/PHASE_2_2_API_HARDENING.md`). The audit inspected:
1. **Rate Limiting Architecture:** Shared limiters across authentication endpoints, ordering of authentication vs. rate-limiting on user-keyed AI quotas, bypass resistance against proxy spoofing and alternate routing, and sliding-window counter consistency.
2. **Body Parser & Optical Scanner Bounds:** Middleware execution ordering, Base64 character and length validation, malformed JSON error containment, and upload size alignment between body parsers and application-layer handlers.
3. **CORS & Access Control:** Method coverage for `PATCH` operations, preflight headers, credential posture (`credentials: false`), and verification that origin-less requests cannot bypass server-side authorization.
4. **Security Headers & Content Security Policy (CSP):** Header adequacy, addition of `Permissions-Policy` for camera and sensory hardware, and a comprehensive feasibility assessment of CSP against frontend dependencies (Google Fonts, Font Awesome CDN, Unsplash, OpenLibrary, and Vite HMR).
5. **Full Regression Suites:** Verification across unit, end-to-end API, optical scanner, and browser persistence test suites without live external service calls.

All 5 core test suites passed with **0 errors and 0 failures**.

---

## 2. Security Findings & Edge-Case Remediations

| Finding ID | Severity | Status | Description | Fix Applied |
|---|---|---|---|---|
| **SEC-EDGE-01** | Medium | **Fixed** | CORS preflight rejected `PATCH` requests on admin book stock and order status endpoints. | Added `'PATCH'` to `corsOptions.methods` and `'Idempotency-Key'` to `allowedHeaders` in `server/middleware/cors.ts`. |
| **SEC-EDGE-02** | Low | **Fixed** | Malformed JSON payloads caused body-parser to throw `SyntaxError`, falling into generic 500 error handling. | Added explicit `SyntaxError` status 400 check in `server/server.ts` global error handler returning controlled HTTP 400. |
| **SEC-EDGE-03** | Low | **Fixed** | Optical scanner did not validate Base64 character set or empty data URLs before processing. | Added empty-check and regex `/^[A-Za-z0-9+/=\r\n]+$/` validation in `server/routes/scanner.ts`. |
| **SEC-EDGE-04** | Low | **Fixed** | Parser `uploadLimit` default (`10mb`) was smaller than a 10MB binary image encoded in Base64 (~14MB). | Updated `uploadLimit` default to `'15mb'` in `server/config/index.ts` to accommodate up to 10MB raw binary images. |
| **SEC-EDGE-05** | Low | **Fixed** | Missing `Permissions-Policy` header on responses to restrict sensitive hardware features. | Added `Permissions-Policy: camera=(self), microphone=(), geolocation=()` to `server/middleware/securityHeaders.ts`. |
| **SEC-EDGE-06** | Info | **Documented** | CSP feasibility: Strict CSP in backend middleware risks breaking external fonts, CDN icons, and remote covers. | Conducted dependency audit; documented production CSP policy recommendations without breaking storefront assets. |
| **SEC-EDGE-07** | Info | **Documented** | In-memory rate limiting resets on restart and does not share state across multi-instance clusters. | Verified as optimal for single-instance; documented architectural constraints and Redis migration path. |
| **SEC-EDGE-08** | Info | **Verified** | Requests without an `Origin` header are handled as CORS non-browser requests, not as authenticated calls. | Verified backend authentication (`requireAuth`) is enforced on all protected endpoints regardless of `Origin`. |

---

## 3. Deep-Dive Investigations

### A. Rate-Limiter Correctness (`server/middleware/rateLimiter.ts`)

#### 1. Coverage & Shared Limiting
* **Authentication Routes:** `/api/auth/login`, `/api/auth/register`, and `/api/auth/google` (POST) are protected by the shared `authLimiter` instance (15 requests per 15 minutes).
* **Bypass Prevention:** Attackers rotating attempts between `/login` and `/google` hit the exact same IP bucket. When the limit is exceeded on `/login`, requests to `/google` are immediately rejected with `HTTP 429 Too Many Requests`.
* **Public Discovery:** In-store book discovery (`/api/scanner/isbn`, `/api/scanner/analyze`, `/api/scanner/match-text`) is protected by `scannerLimiter` (30 requests/minute) without requiring customer login.

#### 2. User-Keyed AI Quotas vs. Authentication Ordering
* In `server/routes/recommendations.ts`:
  ```typescript
  router.post('/ai', requireAuth, aiLimiter, async (req, res) => { ... });
  ```
* **Verification:** `requireAuth` is mounted **before** `aiLimiter`.
  - Unauthenticated requests are rejected immediately with `HTTP 401 Unauthorized` before reaching `aiLimiter`.
  - Legitimate authenticated requests populate `req.user.id`. The `aiLimiter` extracts `user_${user.id}` as the rate limit key.
  - This prevents campus NAT or dormitory lockouts where hundreds of students share a single public IPv4 address.
  - Anonymous callers cannot consume legitimate users' rate-limit buckets.

#### 3. Proxy Header Security & Spoofing Defense
* In `server/middleware/rateLimiter.ts`, `getClientIp(req)` extracts `X-Forwarded-For` **only** if Express `trust proxy` is explicitly enabled:
  ```typescript
  export function getClientIp(req: Request): string {
    const isProxyTrusted = Boolean(req.app && req.app.get('trust proxy'));
    if (isProxyTrusted) {
      const rawForwarded = req.headers['x-forwarded-for'];
      const forwarded = Array.isArray(rawForwarded) ? rawForwarded[0] : rawForwarded;
      if (typeof forwarded === 'string' && forwarded.trim()) {
        return forwarded.split(',')[0].trim();
      }
      if (req.ip) return req.ip;
    }
    return req.ip || req.socket?.remoteAddress || 'unknown-client';
  }
  ```
* **Spoofing Verification:** When `trust proxy` is false (default), random or forged `X-Forwarded-For: 1.2.3.4` headers are ignored. The connection's real remote address is used. Attackers cannot bypass the rate limiter by generating random `X-Forwarded-For` values.
* **Array Header Handling:** If an attacker sends multiple `X-Forwarded-For` headers or comma-separated lists, the parser securely extracts the client entry without throwing runtime exceptions.

#### 4. Header Consistency & Resets
* Standard rate-limiting headers are emitted on every evaluated request:
  - `RateLimit-Limit`: Maximum requests permitted per window.
  - `RateLimit-Remaining`: Count remaining before lockout.
  - `RateLimit-Reset`: Unix timestamp (seconds) when window clears.
  - `Retry-After`: Emitted on HTTP 429 indicating seconds to wait.
* Counters automatically clear expired timestamps using a sliding timestamp window and an internal background cleanup timer (`cleanupTimer.unref()`).
* For deterministic testing, `resetAllRateLimiters()` clears in-memory maps cleanly without sleep delays.

---

### B. Body-Parser and Image-Size Limits

#### 1. Middleware Ordering & Route-Specific Limit Isolation
In `server/server.ts`:
```typescript
// 1. Dedicated 15MB parser for optical scanner routes (camera base64 images)
app.use(
  '/api/scanner',
  express.json({ limit: config.uploadLimit }),
  express.urlencoded({ extended: true, limit: config.uploadLimit }),
  scannerRoutes
);

// 2. Standard routes: strict 100kb payload limit to prevent resource exhaustion (SEC-04)
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
```
* **Ordering Verification:** Express matches routes sequentially. Requests to `/api/scanner/*` are consumed by the dedicated 15MB parser before reaching the standard 100KB parser. Standard routes (`/api/auth`, `/api/orders`, `/api/books`) are protected by the strict 100KB limit.

#### 2. Base64 Size Consistency (`SEC-EDGE-04`)
* Binary images encoded as Base64 expand by approximately 33.3% (`4 / 3` ratio).
* A 10MB raw binary photo produces ~13.98MB of Base64 text.
* Previously, `uploadLimit` was configured as `'10mb'`. This created an inconsistency where a valid 9MB binary photo (~12MB Base64) was rejected by the parser with HTTP 413 before reaching the route's 10MB binary validation check.
* **Fix Applied:** `config.uploadLimit` was updated to `'15mb'` (configurable via `UPLOAD_LIMIT`). This ensures full 10MB binary images pass through the body parser to the application validator, which enforces the binary equivalent length (`14,680,064` characters).

#### 3. Base64 Character Set Validation & Malformed Payloads (`SEC-EDGE-03`)
* In `server/routes/scanner.ts`:
  ```typescript
  const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9.+_-]+;base64,/, '').trim();
  if (!cleanBase64) {
    return res.status(400).json({ success: false, error: 'Base64 image data is empty.' });
  }
  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(cleanBase64)) {
    return res.status(400).json({ success: false, error: 'Invalid Base64 character encoding in image data.' });
  }
  ```
* **Protection:** Rejects empty data URLs (`data:image/jpeg;base64,`) and corrupted strings containing non-Base64 symbols with `HTTP 400 Bad Request` prior to upstream model dispatch.

#### 4. Malformed JSON Body Error Containment (`SEC-EDGE-02`)
* When an invalid JSON string (e.g., `{"query": `) is posted, Express's `body-parser` generates an internal `SyntaxError` with `status: 400` and `body` property.
* In `server/server.ts`, the error handler catches this explicitly:
  ```typescript
  if (err instanceof SyntaxError && (err as any).status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Malformed JSON payload in request body.' });
  }
  ```
* **Protection:** The server responds with `HTTP 400` and does not crash, leak internal parser stack traces, or fall into generic 500 error reporting.

---

### C. CORS and Backend Authorization

#### 1. Method Coverage (`SEC-EDGE-01`)
* `corsOptions.methods` was missing `'PATCH'`.
* **Issue:** BookNest admin endpoints require `PATCH` for inventory management (`PATCH /api/admin/books/:id/stock`) and order processing (`PATCH /api/admin/orders/:id/status`). Browser preflight `OPTIONS` requests for `PATCH` operations from legitimate frontend origins were rejected by CORS.
* **Fix Applied:** Added `'PATCH'` to `corsOptions.methods` and `'Idempotency-Key'` to `allowedHeaders` in `server/middleware/cors.ts`.

#### 2. Origin Whitelisting & Disallowed Origins
* Allowed origins: `config.appUrl` (default `http://localhost:3000`), local dev ports (`http://localhost:3000`, `http://127.0.0.1:3000`, `http://localhost:5000`, `http://127.0.0.1:5000`), and comma-separated domains from `CORS_ALLOWED_ORIGINS`.
* Allowed origins receive `Access-Control-Allow-Origin: <origin>` and preflight response caching (`Access-Control-Max-Age: 86400`).
* Disallowed browser origins (e.g., `http://malicious-site.com`) do NOT receive an `Access-Control-Allow-Origin` header, preventing browser contexts from reading responses.

#### 3. Origin-less Requests and Backend Authorization Invariance (`SEC-EDGE-08`)
* CORS is a browser client security specification. Non-browser clients (such as curl, native mobile applications, automated backend scripts, and microservice workers) do not submit an `Origin` header.
* In `corsOptions.origin`, `if (!origin) return callback(null, true);` permits these requests to proceed past the CORS middleware layer.
* **Critical Authorization Verification:**
  - Removing or omitting the `Origin` header does **NOT** grant administrative or authenticated access.
  - Every sensitive endpoint (`/api/auth/me`, `/api/cart/*`, `/api/wishlist/*`, `/api/orders/*`, `/api/admin/*`, `/api/recommendations/ai`) strictly enforces backend token validation via `requireAuth` or `requireAdmin`.
  - A regression test confirms that sending an origin-less request to `/api/admin/metrics` or `/api/recommendations/ai` without a Bearer token returns `HTTP 401 Unauthorized`.

---

### D. Security Headers & Content Security Policy (CSP)

#### 1. Active Security Headers
In `server/middleware/securityHeaders.ts`:
* `X-Content-Type-Options: nosniff`: Prevents MIME-type sniffing attacks.
* `X-Frame-Options: DENY`: Blocks framing and clickjacking attacks.
* `X-XSS-Protection: 0`: Complies with OWASP recommendation to disable buggy legacy XSS auditor.
* `Referrer-Policy: strict-origin-when-cross-origin`: Prevents sensitive query params/tokens from leaking in HTTP referrers.
* `Permissions-Policy: camera=(self), microphone=(), geolocation=()` (`SEC-EDGE-05`): Grants same-origin camera access for book cover scanning while locking down microphone and geolocation APIs.

#### 2. Content Security Policy (CSP) Feasibility Assessment (`SEC-EDGE-06`)
An audit of BookNest frontend dependencies revealed the following asset requirements:
1. **Inline Scripts (`index.html`):** The storefront contains an inline theme-initialization script to prevent screen flicker before CSS loads:
   ```html
   <script>
     (function() {
       const savedTheme = localStorage.getItem('theme');
       ...
     })();
   </script>
   ```
   A rigid `script-src 'self'` policy without `'unsafe-inline'` or a server-generated per-request cryptographic nonce would block theme initialization.
2. **External Typography & CDN Stylesheets:**
   - Google Fonts: `https://fonts.googleapis.com` (CSS) and `https://fonts.gstatic.com` (WOFF2 font binaries).
   - Font Awesome: `https://cdnjs.cloudflare.com` (CSS & webfonts).
3. **External Book Cover Imagery:**
   - Unsplash CDN: `https://images.unsplash.com`
   - OpenLibrary Covers: `https://covers.openlibrary.org`
4. **Vite Development Server (HMR):**
   - Connects to WebSockets (`ws://localhost:*` or `ws://127.0.0.1:*`) and dynamic script module evaluation (`'unsafe-eval'`).

#### Recommended Production CSP Header
Hardcoding a restrictive CSP on the Express backend during development risks breaking local development HMR and storefront styles. When deploying BookNest behind a production reverse proxy (e.g. Nginx, Cloudflare, or Cloud Run), the following policy is recommended:

```http
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data: blob: https://images.unsplash.com https://covers.openlibrary.org; connect-src 'self' https://openlibrary.org; frame-ancestors 'none';
```

---

## 4. Regression Verification & Test Results

All test suites were executed. Zero errors were encountered.

### 1. TypeScript Static Typecheck (`npm run lint`)
* **Command:** `npm run lint` (`tsc --noEmit`)
* **Result:** Exit Code 0, **0 Type Errors**.

### 2. End-to-End API Security Test Suite (`npm run test:e2e`)
* **Command:** `npm run test:e2e` (`tsx scripts/verify-all-fixes.mjs`)
* **Result:** Exit Code 0, **85 Passed, 0 Failed**.
* **Key Tests Added & Verified in Section 6:**
  - AI Endpoint authentication requirement (HTTP 401).
  - AI query length bounds (2–500 chars) and sanitization (HTTP 400).
  - AI mock provider error sanitization (HTTP 502, zero stack traces).
  - AI rate-limiting with user-level keying (`user_<id>`).
  - Scanner public storefront access without authentication (HTTP 200).
  - Scanner ISBN bounds and invalid format rejection (HTTP 400).
  - Scanner Base64 character validation and empty data URL rejection (HTTP 400).
  - Scanner Base64 payload limits (>14MB returns HTTP 413).
  - External catalog purchase rejection in orders (HTTP 400) and cart (HTTP 404).
  - Shared authentication rate limiter across `/login`, `/register`, and `/google` (HTTP 429).
  - Spoofed `X-Forwarded-For` rejection when `trust proxy` is disabled.
  - CORS origin whitelisting, rejection of unauthorized origins, and preflight `OPTIONS` for `PATCH`.
  - Backend authentication invariance for requests without `Origin` headers.
  - Standard route body limit (100KB returns HTTP 413).
  - Malformed JSON payload containment (returns HTTP 400, no server crash).
  - Security headers presence (`nosniff`, `DENY`, `strict-origin`, `Permissions-Policy`).

### 3. Deterministic Scanner Test Suite (`npm run test:scanner`)
* **Command:** `npm run test:scanner` (`tsx scripts/test-scanner.mjs`)
* **Result:** Exit Code 0, **61 Passed, 0 Failed**.
* **Validation:** Verified deterministic OpenLibrary mocks, OCR fallback routines, barcode fallback handling, demo mode labeling, and camera permission denial recovery.

### 4. Full-Stack Persistence Test Suite (`npm run test:persistence`)
* **Command:** `npm run test:persistence` (`tsx scripts/test-persistence.mjs`)
* **Result:** Exit Code 0, **29 Passed, 0 Failed**.
* **Validation:** Verified student and admin authentication, cart persistence across full page reload, wishlist persistence across reload, order placement persistence, and live admin stock synchronization.

### 5. Production Bundle Build (`npm run build`)
* **Command:** `npm run build` (`vite build`)
* **Result:** Exit Code 0. Clean production bundle built in 481ms.

### 6. Development Database Integrity
* **Target File:** `data/booknest.db`
* **Baseline SHA-256:** `66378651ef6cca4f95aae0d5a62dfa09a6fec7563e329df6bbbee37eccdf2dbe`
* **Post-Verification SHA-256:** `66378651ef6cca4f95aae0d5a62dfa09a6fec7563e329df6bbbee37eccdf2dbe`
* **Status:** Verified 100% identical and completely untouched.

---

## 5. Architectural Characteristics & Limitations

1. **In-Memory Rate Limiting (`SEC-EDGE-07`):**  
   The current rate-limiting implementation uses Node.js in-process memory.
   - *Limitation 1:* Rate counters reset when the Node process restarts.
   - *Limitation 2:* If BookNest is deployed across multiple horizontal container replicas, each container maintains an isolated counter.
   - *Recommendation:* For current single-container or campus on-premise deployments, in-memory rate limiting is optimal (zero latency, zero external infrastructure). If scaled horizontally across multiple instances in the future, migrate storage to Redis via `rate-limit-redis`.
2. **Reverse Proxy Configuration (`TRUST_PROXY`):**  
   `trust proxy` remains disabled (`false`) by default to prevent client header spoofing. When deploying behind a production load balancer (e.g. AWS ALB, GCP Cloud Run, Nginx), operators must set `TRUST_PROXY="true"` in `.env` to enable proper client IP resolution.
3. **CORS Configuration in Production:**  
   In production environments, operators must configure `CORS_ALLOWED_ORIGINS` with the production frontend domain (e.g., `https://booknest.campus.edu`).

---

## 6. Phase 2.2.1 Completion Sign-Off

All API security edge cases, body-parser bounds, CORS headers, security headers, and rate-limiting behaviors have been verified, regression tested, and documented. The codebase is secure, stable, and ready for Phase 2.3.
