# BookNest — Phase 2.2: API Access Control, Rate Limiting & CORS Hardening Report

**Document:** `docs/PHASE_2_2_API_HARDENING.md`  
**Phase:** Phase 2.2 — Controlled API Hardening, Access Control & Middleware Security  
**Status:** Complete  
**Date:** October 2026  
**Scope:** Remediation of findings SEC-01 (CORS), SEC-02 (Security Headers), SEC-03 (Rate Limiting), SEC-04 (Request Size Limits), SEC-05 (Error Leakage), SEC-06 (Prompt Injection/Access Control on AI Advisor), and AUTHZ-01 / AUTHZ-02 (Unrestricted AI & Scanner Resource Depletion).

---

## 1. Executive Summary

Phase 2.2 focused on hardening API access controls, preventing automated quota depletion and credential brute-forcing via tiered rate limiting, establishing explicit configurable CORS whitelisting, bounding request payload sizes, and sanitizing error responses without exposing internal implementation details or stack traces.

Key outcomes achieved in this phase:
- **Authentication Enforcement on AI Advisor:** `POST /api/recommendations/ai` strictly enforces server-side authentication (`requireAuth`), blocking anonymous requests from triggering upstream Google Gemini AI calls and consuming quota.
- **User-Level AI Rate Limiting:** Enforces `aiLimiter` (20 requests per 15 minutes), keyed by authenticated user ID (`user_<id>`) rather than raw IP. This critical design prevents students sharing a campus library, dorm, or NAT network IP from locking out other legitimate users.
- **Storefront Discovery Preservation on Scanner:** `POST /api/scanner/isbn`, `POST /api/scanner/analyze`, and `POST /api/scanner/match-text` remain accessible to in-store campus shoppers and visitors without forced login, while being protected by `scannerLimiter` (30 requests/minute) and strict input validation.
- **External Catalog Isolation & Purchase Protection:** Books retrieved exclusively from external archives (OpenLibrary) retain `id: -1`, `isLocalCatalog: false`, `price: 0`, and `stock: 0`. The order and cart controllers strictly prevent non-catalog books from being added to carts (HTTP 404) or purchased as inventory (HTTP 400).
- **Authentication Rate Limiting & Bypass Prevention:** Guarded `/api/auth/login`, `/api/auth/register`, and `/api/auth/google` with a unified in-memory sliding-window limiter (15 requests / 15 minutes per IP). Shared middleware mounting prevents attackers from bypassing limits by rotating between `/login` and `/google`.
- **Proxy-Aware Client Identification:** `getClientIp()` inspects `X-Forwarded-For` only when `trust proxy` is explicitly enabled in Express via `config.trustProxy`. This prevents trivial rate-limit bypasses via spoofed `X-Forwarded-For` request headers when untrusted.
- **Configurable CORS Origin Whitelisting:** Replaced wildcard global CORS (`cors()`) with explicit whitelisting derived from `config.appUrl`, `CORS_ALLOWED_ORIGINS`, and standard local development ports (`localhost:3000`, `127.0.0.1:3000`, `localhost:5000`, `127.0.0.1:5000`). Requests without an `Origin` header (such as curl, server-to-server, or test scripts) are permitted.
- **Tiered Payload Limits:** Non-scanner routes are restricted to a strict 100KB body limit (`HTTP 413` on oversize), preventing memory exhaustion attacks while permitting camera base64 uploads on scanner routes up to 10MB.
- **Defensive Security Headers:** Standard headers injected across all responses: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 0`, and `Referrer-Policy: strict-origin-when-cross-origin`.
- **Zero Test External Calls:** Injected mock boundaries (`setAiRecommendationProvider()` and `setExternalLookupProvider()`) ensure test suites run 100% deterministically without making paid or external API calls.
- **Database Safety:** The development database (`data/booknest.db`) was completely untouched (SHA-256 hash `66378651ef6cca4f95aae0d5a62dfa09a6fec7563e329df6bbbee37eccdf2dbe`, size `196,608` bytes, verified identical before and after all test runs).

---

## 2. Access Policy & Middleware Architecture

```
                               Incoming HTTP Request
                                         │
                                         ▼
                     ┌───────────────────────────────────────┐
                     │          securityHeaders              │
                     │  (nosniff, DENY, strict-origin, etc.) │
                     └───────────────────┬───────────────────┘
                                         │
                                         ▼
                     ┌───────────────────────────────────────┐
                     │          corsMiddleware               │
                     │  Allowed: APP_URL, CORS_ALLOWED_ORIGINS│
                     │  Allowed: localhost:3000, 127.0.0.1   │
                     │  Allowed: No-Origin (curl/mobile/test)│
                     │  Disallowed: Withhold Allow-Origin    │
                     └───────────────────┬───────────────────┘
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 │                                               │
                 ▼                                               ▼
     ┌───────────────────────┐                       ┌───────────────────────┐
     │  /api/scanner Routes  │                       │   Standard Routes     │
     │  express.json(10mb)   │                       │   express.json(100kb) │
     │  scannerLimiter (30/m)│                       └───────────┬───────────┘
     │  Public storefront    │                                   │
     └───────────────────────┘                   ┌───────────────┴───────────────┐
                                                 │                               │
                                                 ▼                               ▼
                                     ┌───────────────────────┐       ┌───────────────────────┐
                                     │   /api/auth Routes    │       │ /api/recommendations  │
                                     │   authLimiter (15/15m)│       │ /ai: requireAuth      │
                                     │   login, register, goog│       │ aiLimiter (20/15m/usr)│
                                     └───────────────────────┘       └───────────────────────┘
```

---

## 3. Detailed Remediations

### 1. Protection of `POST /api/recommendations/ai`
* **Access Policy:** Requires authentication (`requireAuth`). Unauthenticated requests are rejected with `HTTP 401 Unauthorized`. Both student and administrator roles are authorized. No new artificial roles were introduced.
* **Rate Limiting:** Guarded by `aiLimiter` (20 requests per 15 minutes). For authenticated users, the rate limit key is `user_<id>`, ensuring that high usage by one student does not exhaust the rate limit for other students sharing the same campus NAT IP. Returns `HTTP 429` with `Retry-After` header when exceeded.
* **Input Validation:**
  - `query`: Must be a string between 2 and 500 characters. Missing, blank, or oversized queries return `HTTP 400`.
  - `currentBookTitle`: If provided, must be a string <= 200 characters. Non-string or oversized values return `HTTP 400`.
* **Error Sanitization:** If the upstream Gemini model fails or times out (8-second timeout), the endpoint returns a clean `HTTP 502 Bad Gateway` (`{ error: 'AI recommendation service is temporarily unavailable. Please try again shortly.', isAiGenerated: false }`) without exposing internal API keys, model parameters, or stack traces.
* **Deterministic Testing:** Added `setAiRecommendationProvider()` to inject mock recommendation generators during automated test runs, guaranteeing zero live external network calls or costs.

### 2. Protection of `POST /api/scanner/analyze`, `/isbn`, and `/match-text`
* **Access Policy:** Preserved as a public storefront feature for in-store campus shoppers and visitors scanning book covers or barcodes without requiring login.
* **Rate Limiting:** Guarded by `scannerLimiter` (30 requests per minute). Returns `HTTP 429` when exceeded.
* **Input Validation & Size Bounds:**
  - `/isbn`: Validates that `isbn` is a string with normalized length >= 9. Rejects empty/short values with `HTTP 400`.
  - `/analyze`: Requires `imageBase64` string. Bounded to 14,680,064 characters (10MB binary equivalent); oversized payloads return `HTTP 413`. Restricts `mimeType` to `['image/jpeg', 'image/jpg', 'image/png', 'image/webp']`; invalid formats return `HTTP 400`.
* **Safe External Fallback & Inventory Protection:**
  - OpenLibrary lookups enforce a 4-second timeout (`AbortSignal.timeout(4000)`). If the external provider times out or fails, the endpoint returns an honest `HTTP 404` without crashing or leaking stack traces.
  - Results found exclusively in external archives are flagged `isLocalCatalog: false`, `id: -1`, `price: 0`, and `stock: 0`.
  - The order controller (`ordersController.ts`) verifies that books exist in the local database, rejecting orders for external book ID `-1` with `HTTP 400`.
  - The cart controller (`cartController.ts`) rejects adding external book ID `-1` with `HTTP 404`.

### 3. Authentication Rate Limiting & Proxy Protection
* **Protected Endpoints:**
  - `POST /api/auth/login`
  - `POST /api/auth/register`
  - `POST /api/auth/google`
* **Limits:** 15 requests per 15 minutes per IP (configurable via `AUTH_RATE_LIMIT_MAX` and `AUTH_RATE_LIMIT_WINDOW_MS`).
* **Bypass Prevention:** A single `authLimiter` instance is shared across `/login`, `/register`, and `/google`. Attackers cannot bypass the rate limit by rotating attempts across endpoints.
* **Trusted Proxy Handling:** Client IP extraction (`getClientIp()`) only parses the `X-Forwarded-For` header if `req.app.get('trust proxy')` is enabled. If disabled (default), Express connection socket addresses are used, preventing clients from bypassing rate limiting by sending spoofed `X-Forwarded-For` headers.
* **Headers Issued:** `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, and `Retry-After`.
* **Credential Privacy:** No passwords, Google tokens, or JWTs are logged during rate-limiting or authentication handling.
* **Test Isolation:** Exposes `resetAllRateLimiters()` allowing automated test suites to reset hit counters cleanly without arbitrary sleep delays.

### 4. CORS Whitelisting & Origin Hardening
* **Configurable Origin Whitelist:** Implemented in `server/middleware/cors.ts`.
  - Automatically permits `config.appUrl` (default `http://localhost:3000`).
  - Automatically permits local dev servers: `http://localhost:3000`, `http://127.0.0.1:3000`, `http://localhost:5000`, `http://127.0.0.1:5000`.
  - Permits additional production/staging origins configured in `CORS_ALLOWED_ORIGINS` (comma-separated).
* **Non-Browser Clients:** Requests without an `Origin` header (such as curl, native mobile clients, and test runners) are permitted.
* **Disallowed Origins:** Rejected by withholding `Access-Control-Allow-Origin`, preventing unauthorized browser contexts from reading response payloads.
* **Credentials:** Configured as `credentials: false` to align with BookNest's Bearer token architecture and eliminate credential leakage risks.
* **Exposed Headers:** Exposes `Retry-After`, `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` so authorized clients can read rate-limiting status.

### 5. Request Body Size Limits & Security Headers
* **Tiered Parser:**
  - `/api/scanner`: Mounted with dedicated `10MB` limit for camera uploads.
  - Global routes: Strict `100KB` limit to prevent memory exhaustion and DoS via large JSON payloads. Requests exceeding 100KB on standard routes return `HTTP 413`.
* **Headers Injected:**
  - `X-Content-Type-Options: nosniff` (blocks MIME-type sniffing).
  - `X-Frame-Options: DENY` (prevents clickjacking framing).
  - `X-XSS-Protection: 0` (modern standard per OWASP).
  - `Referrer-Policy: strict-origin-when-cross-origin` (prevents URL token/leakage in referrers).

---

## 4. Files Modified and Created

| File | Type | Description |
|---|---|---|
| `server/middleware/rateLimiter.ts` | **Created** | In-memory sliding-window rate limiter middleware with `authLimiter`, `aiLimiter`, `scannerLimiter`, `getClientIp()` with `trust proxy` checks, user-level keying, standard headers, and reset utilities. |
| `server/middleware/cors.ts` | **Created** | Configurable CORS middleware whitelisting `APP_URL`, `CORS_ALLOWED_ORIGINS`, and development origins with `exposedHeaders`. |
| `server/middleware/securityHeaders.ts` | **Created** | Injects standard defensive HTTP security headers (`nosniff`, `DENY`, `strict-origin-when-cross-origin`). |
| `server/routes/recommendations.ts` | **Modified** | Mounted `requireAuth` and `aiLimiter` on `POST /ai`, added input validation (2–500 chars), safe 502 error sanitization, and test injection provider `setAiRecommendationProvider()`. |
| `server/routes/scanner.ts` | **Modified** | Mounted `scannerLimiter` on `POST /isbn`, `POST /analyze`, and `POST /match-text`, sanitized catch block error responses, and preserved OpenLibrary 4-second timeout. |
| `server/routes/auth.ts` | **Modified** | Mounted shared `authLimiter` on `POST /login`, `POST /register`, and `POST /google`. |
| `server/server.ts` | **Modified** | Replaced wildcard `cors()` with `corsMiddleware`, added `securityHeaders`, configured `trust proxy` when enabled, mounted dedicated 10MB parser for scanner, and set global 100KB parser for standard routes with 413 error handling. |
| `server/config/index.ts` | **Modified** | Added `trustProxy`, `corsAllowedOrigins`, and configurable rate limit constants with sensible defaults. |
| `.env.example` | **Modified** | Documented `CORS_ALLOWED_ORIGINS`, `TRUST_PROXY`, and rate limit configuration variables. |
| `scripts/verify-all-fixes.mjs` | **Modified** | Added Section 6 containing comprehensive regression tests covering AI auth enforcement, user-level rate limiting, input validation, error sanitization, scanner public access, scanner validation, external catalog purchase prevention, auth rate limiting, alternate route sharing, spoofed proxy header prevention, CORS whitelisting, preflight requests, payload bounds, and security headers. |

---

## 5. Verification & Test Execution Results

All verification suites were run against isolated test databases. All tests passed with 100% success.

### 1. TypeScript & Lint Verification
* **Command:** `npm run lint` (`tsc --noEmit`)
* **Result:** Exit code 0, 0 errors.

### 2. End-to-End Test Suite (Isolated Test Database)
* **Command:** `npm run test:e2e` (`tsx scripts/verify-all-fixes.mjs`)
* **Result:** Exit code 0.
* **Outcome:** **79 Passed, 0 Failed**.
* **Phase 2.2 Test Results Output:**
  ```text
  --- 6. Testing Phase 2.2 API Hardening & Access Controls ---
    ✅ PASS: AI Endpoint: Unauthenticated request is rejected (HTTP 401)
    ✅ PASS: AI Endpoint: Missing query prompt is rejected (HTTP 400)
    ✅ PASS: AI Endpoint: Short query (<2 chars) is rejected (HTTP 400)
    ✅ PASS: AI Endpoint: Oversized query (>500 chars) is rejected (HTTP 400)
    ✅ PASS: AI Endpoint: Non-string currentBookTitle is rejected (HTTP 400)
    ✅ PASS: AI Endpoint: External AI failure returns safe HTTP 502
    ✅ PASS: AI Endpoint: External failure does not leak internal stack trace
    ✅ PASS: AI Endpoint: Authenticated user receives recommendations without external API call
    ✅ PASS: AI Rate Limiter includes Retry-After header
    ✅ PASS: AI Endpoint: Excessive requests trigger rate limit (HTTP 429)
    ✅ PASS: AI Endpoint: User-level rate limiting prevents unrelated user lockout on shared IP
    ✅ PASS: Scanner Endpoint: Unauthenticated catalog lookup is permitted for storefront visitors (HTTP 200)
    ✅ PASS: Scanner Endpoint: Missing ISBN is rejected (HTTP 400)
    ✅ PASS: Scanner Endpoint: Short ISBN (<9 chars) is rejected (HTTP 400)
    ✅ PASS: Scanner Endpoint: Missing imageBase64 is rejected (HTTP 400)
    ✅ PASS: Scanner Endpoint: Unsupported image MIME type (image/gif) is rejected (HTTP 400)
    ✅ PASS: Scanner Endpoint: Oversized imageBase64 payload (>14MB) is rejected (HTTP 413)
    ✅ PASS: Scanner: External catalog result has isLocalCatalog: false and id: -1
    ✅ PASS: Scanner: External catalog result has stock: 0 and price: 0 (not fabricated)
    ✅ PASS: Orders: External non-catalog search result (id: -1) cannot be purchased as local inventory (HTTP 400)
    ✅ PASS: Cart: External non-catalog search result (id: -1) cannot be added to cart (HTTP 404)
    ✅ PASS: Scanner: External provider timeout or failure gracefully returns HTTP 404
    ✅ PASS: Scanner Endpoint: Rapid requests trigger rate limit (HTTP 429)
    ✅ PASS: Auth Rate Limiter: Repeated failed attempts trigger rate limit (HTTP 429)
    ✅ PASS: Auth Rate Limiter: Alternate auth route (/api/auth/google) cannot bypass rate limit (HTTP 429)
    ✅ PASS: Auth Rate Limiter: Spoofed X-Forwarded-For header cannot bypass rate limiter when trust proxy is disabled
    ✅ PASS: CORS: Allowed origin receives Access-Control-Allow-Origin header
    ✅ PASS: CORS: Disallowed origin does NOT receive Access-Control-Allow-Origin header
    ✅ PASS: CORS: Preflight OPTIONS request from allowed origin returns Access-Control-Allow-Origin
    ✅ PASS: CORS: Request without Origin header succeeds normally
    ✅ PASS: Payload Limits: Standard route rejects payload >100KB with HTTP 413
    ✅ PASS: Security Headers: X-Content-Type-Options is nosniff
    ✅ PASS: Security Headers: X-Frame-Options is DENY
    ✅ PASS: Security Headers: Referrer-Policy is strict-origin-when-cross-origin
  ========================================================
  Test Results: 79 Passed, 0 Failed
  ========================================================
  ```

### 3. Deterministic Scanner Test Suite
* **Command:** `npm run test:scanner` (`tsx scripts/test-scanner.mjs`)
* **Result:** Exit code 0, **61 Passed, 0 Failed**.

### 4. Full-Stack Persistence Test Suite
* **Command:** `npm run test:persistence` (`tsx scripts/test-persistence.mjs`)
* **Result:** Exit code 0, **29 Passed, 0 Failed**.

### 5. Production Bundle Build
* **Command:** `npm run build` (`vite build`)
* **Result:** Exit code 0, built cleanly in 11.55s without errors.

### 6. Development Database Integrity
* **Target File:** `data/booknest.db`
* **Baseline SHA-256:** `66378651ef6cca4f95aae0d5a62dfa09a6fec7563e329df6bbbee37eccdf2dbe` (196,608 bytes)
* **Post-Phase 2.2 SHA-256:** `66378651ef6cca4f95aae0d5a62dfa09a6fec7563e329df6bbbee37eccdf2dbe` (196,608 bytes)
* **Status:** Verified 100% identical and completely untouched.

---

## 6. Dependency Changes

* No new external npm packages were introduced.
* Rate limiting and security headers were implemented natively in TypeScript to avoid unnecessary supply-chain dependencies, version drift, and bundle bloat.
* The existing `cors` package was configured with explicit origin validation rules and preflight caching.

---

## 7. Deployment Assumptions & Limitations

1. **Reverse Proxy Configuration (`TRUST_PROXY`):**  
   The application defaults `trust proxy` to `false`. If BookNest is deployed behind a reverse proxy (such as Cloud Run, Nginx, or Cloudflare), administrators must set `TRUST_PROXY="true"` in `.env` to enable secure proxy resolution. When disabled, client-supplied `X-Forwarded-For` headers are intentionally ignored to prevent spoofing.
2. **Single-Instance In-Memory Rate Limiting:**  
   The current rate limiter stores hit counts in Node process memory using sliding timestamps. This is appropriate for single-instance deployments and local development. If BookNest is horizontally scaled across multiple stateless instances in the future, rate-limiting state should be moved to a shared Redis store.
3. **CORS Origins in Production:**  
   In production, administrators should set `CORS_ALLOWED_ORIGINS` in `.env` to the domain hosting the frontend (e.g. `https://booknest.campus.edu`). If unset, it safely defaults to `APP_URL`.
4. **Rate Limiting Scope:**  
   Rate limiting reduces automated brute-force attacks and volumetric request floods, but is not a silver bullet against distributed botnets (DDoS), which should be mitigated at the edge/CDN layer (e.g., Cloudflare, Cloud Armor).

---

## 8. Remaining Scope for Subsequent Phases

1. **Phase 2.3 — Order Lifecycle & Idempotency Hardening:**
   - Implement idempotency keys on `POST /api/orders` (finding ORDER-01).
   - Harden transaction rollback guarantees and coupon reuse concurrency.
2. **Phase 2.4 — OAuth Callback Token Exposure (AUTH-05):**
   - Eliminate token in URL query parameter during OAuth redirect (`/?token=...`) by transitioning to short-lived authorization codes or secure cookies.

---

## 9. Phase 2.2 Sign-Off

Phase 2.2 remediations are complete, fully verified across all automated test suites, and ready for review.
