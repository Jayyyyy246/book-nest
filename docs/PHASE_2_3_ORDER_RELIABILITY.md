# BOOKNEST — PHASE 2.3: ORDER AND INVENTORY RELIABILITY

**Milestone:** Phase 2.3 Deliverable  
**Date:** October 20, 2026  
**Status:** COMPLETE & VERIFIED  
**Development Database Integrity:** Pristine (`66378651ef6cca4f95aae0d5a62dfa09a6fec7563e329df6bbbee37eccdf2dbe` before and after)

---

## 1. Executive Summary

Phase 2.3 completes the core reliability, transactional consistency, and idempotency guarantees for BookNest's ordering and inventory management lifecycle. All confirmed defects identified in order processing, stock adjustments, concurrent checkouts, and admin order cancellations have been resolved and verified with empirical regression suites running on isolated test databases.

No external queueing systems or Redis instances were introduced; all idempotency records, atomic order creation routines, and stock integrity controls are powered natively by SQLite's write-locking transaction engine (`.transaction(...).immediate()`), maintaining single-binary deployment simplicity and robust crash-safe ACID consistency.

---

## 2. Confirmed Defects & Root Cause Analysis

| Finding ID | Component | Defect Description | Root Cause | Severity | Resolution Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **ORDER-01** | `server/controllers/ordersController.ts` | **Missing Idempotency Enforcement:** `cors.ts` exposed the `Idempotency-Key` header, but `ordersController.ts` completely ignored it during order creation. Network retries or rapid double-clicks created multiple orders and repeatedly depleted book inventory. | Server lacked an `idempotency_keys` table and key validation/cache lookup logic in `createOrder`. | **Critical** | **Fixed:** Persistent `idempotency_keys` table created dynamically; exact replay returns cached HTTP 201 with `Idempotent-Replayed: true` header; key reuse with differing payloads returns HTTP 409 Conflict. |
| **ORDER-02** | `server/controllers/ordersController.ts` | **Inventory Bypass via Duplicate Line Items:** When an order payload submitted multiple line items with the same `bookId` (e.g. `[{ bookId: 1, quantity: 2 }, { bookId: 1, quantity: 3 }]`), individual stock checks against stock of 3 passed for both items, overselling 5 units when only 3 existed. | Absence of payload line-item consolidation before validating and decrementing available stock. | **High** | **Fixed:** Added upfront consolidation map consolidating quantities by `bookId` before stock validation and transaction execution. |
| **ORDER-03** | `server/controllers/ordersController.ts` | **Missing Stock Restoration on Cancellation:** Admin updating order status to `'Cancelled'` changed the status flag but never restored purchased book quantities back to the warehouse catalog. | `updateOrderStatus` updated `status` in the `orders` table without inspecting or restoring associated `order_items`. | **High** | **Fixed:** Integrated atomic inventory restoration for all line items when transitioning an active order to `'Cancelled'`. |
| **ORDER-04** | `server/controllers/ordersController.ts` | **Stock Inflation on Repeated Status Transitions:** Repeatedly setting status to `'Cancelled'` or calling status endpoints idempotently risked repeated stock increments. | No idempotent check verifying whether the order was already in the target status or in a terminal cancelled state. | **High** | **Fixed:** Idempotent no-op when target status matches current status; irreversible terminal state prevents transitioning cancelled orders back to active states (`HTTP 400`). |
| **ORDER-05** | `server/controllers/ordersController.ts` | **Concurrent Checkout Race Condition:** Concurrent checkout requests could inspect positive stock simultaneously and run `UPDATE books SET stock = stock - ?`, driving stock into negative values. | Stock updates lacked row-level preconditions (`AND stock >= ?`) and `.immediate()` write-locking transactions. | **Critical** | **Fixed:** Enforced SQLite immediate write-lock transactions with row-level conditional guard `WHERE id = ? AND stock >= ?` ensuring zero overselling. |
| **ORDER-06** | `server/routes/admin.ts` | **Duplicate Unsynchronized Route Handlers:** `server/routes/admin.ts` declared an inline `updateStatusHandler` separate from `ordersController.ts` that lacked order cancellation stock logic. | Incomplete route consolidation between controller and route definitions. | **Medium** | **Fixed:** Routed both `PATCH` and `PUT` `/api/admin/orders/:id/status` directly through `ordersController.updateOrderStatus`. |

---

## 3. Architecture & Implementation Changes

### A. Persistent Server-Side Idempotency
- **Table Definition:** `idempotency_keys`
  ```sql
  CREATE TABLE IF NOT EXISTS idempotency_keys (
    key TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    request_hash TEXT NOT NULL,
    response_code INTEGER NOT NULL,
    response_body TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (key, user_id)
  )
  ```
- **Scoped by Authenticated User:** Keys are scoped per `(key, user_id)` primary key, ensuring User A's key cannot collide with or leak information to User B.
- **Payload Integrity Verification:** Computes a SHA-256 fingerprint of the normalized order payload:
  `sha256(userId + deliveryAddress + sortedConsolidatedItems + coupon + paymentMethod)`.
- **Handling Rules:**
  1. **New Key:** Order executes atomically. Upon commit, key, payload hash, and HTTP 201 response body are saved.
  2. **Replayed Key + Matching Hash:** Request does not re-execute database writes; returns the cached HTTP 201 response with header `Idempotent-Replayed: true`.
  3. **Replayed Key + Conflicting Hash:** Returns `HTTP 409 Conflict` with error message `"Idempotency key was previously used with a different request payload."`
  4. **Key Validation:** Keys exceeding 255 characters or empty strings are rejected with `HTTP 400`.

### B. Atomic Order Creation & Concurrency Guards
- **Consolidation:** Aggregates line items by `bookId` prior to database transactions, preventing split-item overselling.
- **Immediate Write Locking:** Uses `db.transaction(...).immediate()` to acquire SQLite write locks immediately, preventing deadlocks or race interleavings under concurrent checkouts.
- **Authoritative Server-Side Pricing:** Ignores client-provided unit prices, discounts, subtotal, and grand total. Recalculates authoritative prices directly from catalog rows:
  - Unit price: `round(price * (1 - discount / 100))`
  - Subtotal: `sum(unitPrice * quantity)`
  - Delivery fee: `subtotal >= 499 ? 0 : 49`
  - Grand total: `max(0, subtotal - couponDiscount + deliveryFee)`
- **Conditional Stock Decrement:**
  ```sql
  UPDATE books
  SET stock = stock - ?
  WHERE id = ? AND stock >= ?
  ```
  If `changes === 0`, an error is thrown and the transaction immediately rolls back all prior operations (restoring all inventory and inserting no order rows).

### C. Order Status & Inventory Integrity
- **Restoration on Cancellation:** When transitioning to `'Cancelled'`, queries `order_items` and increments `stock` for all items within an immediate transaction:
  ```sql
  UPDATE books SET stock = stock + ? WHERE id = ?
  ```
- **Idempotency Guard:** If the order is already in the target status, returns `HTTP 200` with the current order details without modifying stock.
- **Terminal State Guard:** Once an order is `'Cancelled'`, transitions to any other status (e.g. `'Processing'`, `'Shipped'`, `'Delivered'`) are rejected with `HTTP 400 Bad Request` to preserve inventory integrity.

---

## 4. Affected Files

1. `server/controllers/ordersController.ts`:
   - Added `ensureIdempotencyTable()` to auto-create idempotency table on active database.
   - Implemented `Idempotency-Key` extraction, hash checking, replay response caching, and 409 conflict detection.
   - Added item consolidation by `bookId` to prevent duplicate-item stock bypasses.
   - Upgraded order creation to `db.transaction(...).immediate()` with row-level conditional guards (`AND stock >= ?`).
   - Implemented exact single-restoration of inventory on order cancellation and terminal state protection.
2. `server/routes/admin.ts`:
   - Removed inline duplicate order status update handler and delegated all status transitions to `ordersController.updateOrderStatus`.
3. `server/database/index.ts`:
   - Cleaned SQL query formatting and eliminated trailing whitespaces.
4. `scripts/verify-all-fixes.mjs`:
   - Added Section 7 regression suite verifying idempotency replay, payload mismatch 409, user scoping, item consolidation, atomic rollback, concurrent checkout races, and cancellation stock restoration.

---

## 5. Verification & Test Results

### Test Execution Summary

| Test Command | Test Suite | Pass Count | Fail Count | Status | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `npm run lint` | TypeScript Typecheck (`tsc --noEmit`) | - | 0 errors | **PASSED** | 0 compilation errors across entire repo |
| `npm run test:e2e` | Comprehensive E2E Verification (`verify-all-fixes.mjs`) | 110 | 0 | **PASSED** | All 110 assertions passed (Sections 1 through 7) |
| `npm run test:scanner` | Deterministic Scanner Verification (`test-scanner.mjs`) | 61 | 0 | **PASSED** | Playwright + Mock/Live API tests passed |
| `npm run test:persistence`| Persistence & Refresh Suite (`test-persistence.mjs`) | 29 | 0 | **PASSED** | Cart, Wishlist, Order, Stock persistence passed |
| `npm run build` | Vite Production Build (`vite build`) | - | 0 errors | **PASSED** | Production bundles built cleanly in 658ms |
| `git diff --check` | Git Diff Whitespace Check | - | 0 issues | **PASSED** | Clean git diff check |

### Section 7: Order & Inventory Reliability Assertions (from `verify-all-fixes.mjs`)

```text
--- 7. Testing Phase 2.3 Order & Inventory Reliability ---
  ✅ PASS: 7.1 Initial order creation with Idempotency-Key succeeds (HTTP 201)
  ✅ PASS: 7.1 Duplicate submission returns cached order and Idempotent-Replayed: true header
  ✅ PASS: 7.1 Inventory decremented exactly once for idempotent duplicate submission (stock is 8, expected 8)
  ✅ PASS: 7.2 Idempotency-Key reuse with different payload returns HTTP 409 Conflict (got 409)
  ✅ PASS: 7.3 Idempotency-Key is scoped per user; different user using same key creates order successfully
  ✅ PASS: 7.4 Multi-item order with one out-of-stock item is rejected (HTTP 400)
  ✅ PASS: 7.4 Atomic rollback preserves all inventory when one item fails (Book A: 7, Book B: 1)
  ✅ PASS: 7.5 Consolidation rejects duplicate line items exceeding total stock (HTTP 400)
  ✅ PASS: 7.5 Valid consolidated multi-line order succeeds
  ✅ PASS: 7.5 Book C stock correctly decremented by consolidated total (3 - 2 = 1)
  ✅ PASS: 7.6 Concurrent checkout race condition prevented: 1 succeeded, 5 rejected
  ✅ PASS: 7.6 Book D stock is exactly 0 and never went negative (0)
  ✅ PASS: 7.7 Admin updates status to Processing
  ✅ PASS: 7.7 Repeated status update to Processing is idempotent
  ✅ PASS: 7.7 Order cancelled successfully by admin
  ✅ PASS: 7.7 Book D stock restored to 1 upon cancellation (got 1)
  ✅ PASS: 7.8 Repeating cancellation on already cancelled order returns HTTP 200
  ✅ PASS: 7.8 Book D stock remains exactly 1; repeated cancellation does not double-restore stock (got 1)
  ✅ PASS: 7.9 Cannot transition an already cancelled order to Shipped (HTTP 400)
```

---

## 6. Database Integrity Verification

To guarantee that development and production data remained strictly unmodified:

- **Baseline SHA-256 Hash of `data/booknest.db` (Pre-Phase 2.3):**
  `66378651ef6cca4f95aae0d5a62dfa09a6fec7563e329df6bbbee37eccdf2dbe`
- **Post-Verification SHA-256 Hash of `data/booknest.db` (Post-Phase 2.3):**
  `66378651ef6cca4f95aae0d5a62dfa09a6fec7563e329df6bbbee37eccdf2dbe`
- **Integrity Status:** **100% UNCHANGED (Pristine)**. All automated test suites strictly used isolated test databases (`data/booknest.test.db`).

---

## 7. Remaining Limitations

1. **Payment Provider Integration:** The application does not currently integrate an external payment gateway (e.g. Stripe, Razorpay). Orders currently record payment method metadata (`UPI`, `Card`, `Cash on Delivery`) directly without two-phase commit external authorization webhooks.
2. **Idempotency Key Retention Policy:** Keys are persisted in SQLite indefinitely. For enterprise scale, a scheduled cleanup routine pruning records older than 24–48 hours can be introduced.
3. **Partial Refund / Partial Cancellation:** Order cancellations are currently all-or-nothing (cancelling an order restores all line items). Individual line-item returns are not yet modeled in the schema.

---

## 8. Progress Blockers

- **Zero Blocking Issues:** All order reliability, idempotency, and inventory protection requirements have been satisfied.
- The BookNest foundation is stable, secure, and ready for upcoming product feature development.
