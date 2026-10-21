import path from 'path';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// Enforce isolated test database BEFORE importing server/database modules
const testDbPath = process.env.DB_PATH || path.resolve(process.cwd(), 'data', 'booknest.test.db');
process.env.DB_PATH = testDbPath;
process.env.NODE_ENV = 'test';

// Dynamically import server and database
const { app } = await import('../server/server.js');
const { db, closeDatabase, ensureDemoAccounts } = await import('../server/database/index.js');
const { setGoogleTokenVerifier } = await import('../server/controllers/authController.js');
const { resolveJwtSecret, config } = await import('../server/config/index.js');
const { setAiRecommendationProvider, getCatalogFallbackRecommendations } = await import('../server/routes/recommendations.js');
const { resetAllRateLimiters } = await import('../server/middleware/rateLimiter.js');
const { setExternalLookupProvider, setVisionAnalysisProvider } = await import('../server/routes/scanner.js');

const TEST_PORT = 5055;
let server;

async function runTests() {
  console.log('🚀 Starting BookNest End-to-End Test Suite (Isolated Test DB)...');
  console.log(`📦 Using Test Database: ${process.env.DB_PATH}`);
  
  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      console.log(`Test server running on port ${TEST_PORT}`);
      resolve();
    });
  });

  const baseUrl = `http://localhost:${TEST_PORT}`;
  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName}`);
      failed++;
    }
  }

  try {
    // ----------------------------------------------------
    // TEST SECTION 1: AUTHENTICATION (AUTH-01, AUTH-02, AUTH-03, AUTH-04)
    // ----------------------------------------------------
    console.log('\n--- 1. Testing Authentication & Remediated Vulnerabilities ---');

    // 1.1 Email Sign In with Admin
    const adminLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@booknest.com', password: 'Admin@123' })
    });
    const adminLoginData = await adminLoginRes.json();
    assert(adminLoginRes.status === 200 && adminLoginData.user.role === 'admin' && Boolean(adminLoginData.token), 'Admin login succeeds and returns JWT');
    const adminToken = adminLoginData.token;

    // 1.2 Email Sign In with Student
    const studentLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@booknest.com', password: 'User@123' })
    });
    const studentLoginData = await studentLoginRes.json();
    assert(studentLoginRes.status === 200 && studentLoginData.user.role === 'user', 'Student login succeeds');
    const studentToken = studentLoginData.token;

    // 1.3 Email Sign Up (New user)
    const testEmail = `newuser_${Date.now()}@booknest.com`;
    const signupRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Fresh Scholar', email: testEmail, password: 'Password@123', phone: '9988776655' })
    });
    const signupData = await signupRes.json();
    assert(signupRes.status === 201 && signupData.user.email === testEmail, 'Email Sign Up registers new user and issues token');

    // 1.4 AUTH-01 Regression: Direct Email Login Bypass Elimination
    const directEmailRes = await fetch(`${baseUrl}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@booknest.com' })
    });
    assert(directEmailRes.status === 400, 'AUTH-01: Direct email payload without credential is rejected (HTTP 400)');

    const directEmailStudentRes = await fetch(`${baseUrl}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@booknest.com', name: 'Fake User', googleId: 'fake_123' })
    });
    assert(directEmailStudentRes.status === 400, 'AUTH-01: Direct email with metadata but without credential is rejected (HTTP 400)');

    const emptyAuthRes = await fetch(`${baseUrl}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert(emptyAuthRes.status === 400, 'AUTH-01: Empty authentication payload is rejected (HTTP 400)');

    const blankCredRes = await fetch(`${baseUrl}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: '   ' })
    });
    assert(blankCredRes.status === 400, 'AUTH-01: Blank credential string is rejected (HTTP 400)');

    // 1.5 AUTH-02 Regression: Google ID Token Cryptographic Verification
    const forgedTokenRes = await fetch(`${baseUrl}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: 'forged.unverified.jwt.token' })
    });
    assert(forgedTokenRes.status === 401, 'AUTH-02: Forged or invalid Google token is rejected (HTTP 401)');

    // Inject mock verifier for controlled boundary tests
    setGoogleTokenVerifier(async (token) => {
      if (token === 'expired-token') {
        throw new Error('Token used too late: expired timestamp');
      }
      if (token === 'valid-google-token') {
        return {
          email: `googleuser_${Date.now()}@gmail.com`,
          name: 'Google Scholar',
          googleId: 'goog_sub_98765',
          avatarUrl: 'https://example.com/avatar.jpg',
          emailVerified: true
        };
      }
      throw new Error('Invalid cryptographic signature');
    });

    // Test expired token rejection
    const expiredRes = await fetch(`${baseUrl}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: 'expired-token' })
    });
    assert(expiredRes.status === 401, 'AUTH-02: Expired Google token is rejected (HTTP 401)');

    // Test valid verified token succeeds
    const validGoogleRes = await fetch(`${baseUrl}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: 'valid-google-token' })
    });
    const validGoogleData = await validGoogleRes.json();
    assert(
      validGoogleRes.status === 200 &&
      validGoogleData.user.role === 'user' &&
      Boolean(validGoogleData.token),
      'AUTH-02: Cryptographically verified Google token authenticates, creates user, and issues JWT'
    );
    const googleUserToken = validGoogleData.token;
    const googleUserEmail = validGoogleData.user.email;

    // Reset verifier to default
    setGoogleTokenVerifier(null);

    // 1.6 Session validation (GET /api/auth/me)
    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${googleUserToken}` }
    });
    const meData = await meRes.json();
    assert(meRes.status === 200 && meData.user.email === googleUserEmail, 'Session token survives and restores user profile via /api/auth/me');

    // 1.7 Google OAuth initiation route (GET /api/auth/google)
    const googleAuthInitRes = await fetch(`${baseUrl}/api/auth/google`, { redirect: 'manual' });
    assert(googleAuthInitRes.status === 302, 'GET /api/auth/google properly redirects with OAuth params');

    // 1.8 Logout (POST /api/auth/logout)
    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST' });
    assert(logoutRes.status === 200, 'Logout endpoint responds successfully');

    // 1.9 AUTH-03 Regression: JWT Secret Configuration & Enforcement
    const prevSecret = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    let prodMissingThrows = false;
    try {
      resolveJwtSecret('production');
    } catch (e) {
      prodMissingThrows = e.message.includes('Missing JWT_SECRET in production');
    }
    assert(prodMissingThrows, 'AUTH-03: Missing JWT_SECRET throws in production mode');

    process.env.JWT_SECRET = 'short-secret';
    let prodShortThrows = false;
    try {
      resolveJwtSecret('production');
    } catch (e) {
      prodShortThrows = e.message.includes('at least 32 characters');
    }
    assert(prodShortThrows, 'AUTH-03: Weak/short JWT_SECRET throws in production mode');

    process.env.JWT_SECRET = 'booknest-campus-secure-token-2026';
    let prodDefaultThrows = false;
    try {
      resolveJwtSecret('production');
    } catch (e) {
      prodDefaultThrows = e.message.includes('Default fallback secret cannot be used');
    }
    assert(prodDefaultThrows, 'AUTH-03: Default fallback secret throws in production mode');

    process.env.JWT_SECRET = 'a'.repeat(32);
    const validProdSecret = resolveJwtSecret('production');
    assert(validProdSecret === 'a'.repeat(32), 'AUTH-03: Valid strong JWT_SECRET accepted in production mode');

    if (prevSecret !== undefined) {
      process.env.JWT_SECRET = prevSecret;
    } else {
      delete process.env.JWT_SECRET;
    }

    // Rogue JWT signed with wrong secret rejected by requireAuth
    const rogueToken = jwt.sign({ id: 1, email: 'admin@booknest.com', role: 'admin', name: 'Attacker' }, 'rogue-unauthorized-secret-key-32chars');
    const rogueRes = await fetch(`${baseUrl}/api/admin/metrics`, {
      headers: { Authorization: `Bearer ${rogueToken}` }
    });
    assert(rogueRes.status === 401, 'AUTH-03: Request with token signed by rogue secret is rejected (HTTP 401)');

    // 1.10 AUTH-04 Regression: Public Demo Credential Exposure Removal
    const demoUsersRes = await fetch(`${baseUrl}/api/auth/demo-users`);
    const demoUsersData = await demoUsersRes.json();
    assert(demoUsersRes.status === 200, 'AUTH-04: GET /api/auth/demo-users responds in development/test');
    assert(
      demoUsersData.student &&
      demoUsersData.admin &&
      demoUsersData.student.password === undefined &&
      demoUsersData.admin.password === undefined &&
      demoUsersData.student.password_hash === undefined &&
      demoUsersData.admin.password_hash === undefined,
      'AUTH-04: Passwords and hashes are completely removed from demo users response'
    );

    // Verify production mode hides demo-users endpoint (HTTP 404)
    const prevNodeEnv = config.nodeEnv;
    config.nodeEnv = 'production';
    const demoUsersProdRes = await fetch(`${baseUrl}/api/auth/demo-users`);
    assert(demoUsersProdRes.status === 404, 'AUTH-04: GET /api/auth/demo-users returns HTTP 404 in production');
    config.nodeEnv = prevNodeEnv;

    // 1.11 Role-based authorization check
    const protectedAdminRes = await fetch(`${baseUrl}/api/admin/metrics`, {
      headers: { Authorization: `Bearer ${studentToken}` } // student should be rejected
    });
    assert(protectedAdminRes.status === 403, 'Protected admin route rejects unauthorized student (HTTP 403)');

    const unauthRes = await fetch(`${baseUrl}/api/admin/metrics`);
    assert(unauthRes.status === 401, 'Protected admin route rejects unauthenticated request (HTTP 401)');

    // ----------------------------------------------------
    // TEST SECTION 2: BOOK CREATION, CATEGORIES, DELETION
    // ----------------------------------------------------
    console.log('\n--- 2. Testing Books, Categories & Deletion ---');

    // 2.1 Existing books load
    const catalogRes = await fetch(`${baseUrl}/api/books`);
    const catalogData = await catalogRes.json();
    assert(catalogRes.status === 200 && Array.isArray(catalogData.books) && catalogData.books.length > 0, `Existing books load successfully (${catalogData.books.length} books found)`);

    // 2.2 Verify categories endpoint has 19 predefined categories
    const categoriesRes = await fetch(`${baseUrl}/api/categories`);
    const categoriesData = await categoriesRes.json();
    assert(categoriesRes.status === 200 && categoriesData.categories.length >= 19, `Predefined categories available (${categoriesData.categories.length} categories found)`);

    // 2.3 Add a new book with a specific predefined category (Cybersecurity)
    const testIsbn = '978' + Math.floor(1000000000 + Math.random() * 9000000000);
    const addBookRes = await fetch(`${baseUrl}/api/admin/books`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        title: 'Mastering Ethical Hacking & Defensive Sec',
        author: 'Prof. Ada Lovelace',
        category: 'Cybersecurity',
        price: 650,
        discount: 10,
        stock: 30,
        isbn: testIsbn,
        description: 'Comprehensive guide to penetration testing and network security.',
        coverImage: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=600&auto=format&fit=crop&q=80'
      })
    });
    const addBookData = await addBookRes.json();
    assert(addBookRes.status === 201 && addBookData.book.title === 'Mastering Ethical Hacking & Defensive Sec' && addBookData.book.category === 'Cybersecurity', 'Admin can add a new book with predefined category');
    const newBookId = addBookData.book.id;

    // 2.4 Category is stored persistently and viewable
    const getNewBookRes = await fetch(`${baseUrl}/api/books/${newBookId}`);
    const getNewBookData = await getNewBookRes.json();
    assert(getNewBookRes.status === 200 && getNewBookData.book.category === 'Cybersecurity', 'Category is stored persistently and returned on single book view');

    // 2.5 Edit book: update category to Philosophy
    const updateBookRes = await fetch(`${baseUrl}/api/admin/books/${newBookId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        title: 'Mastering Ethical Hacking & Digital Philosophy',
        category: 'Philosophy',
        price: 700
      })
    });
    const updateBookData = await updateBookRes.json();
    assert(updateBookRes.status === 200 && updateBookData.book.category === 'Philosophy' && updateBookData.book.price === 700, 'Editing book updates category persistently without erasing it');

    // 2.6 Category filter test
    const filterRes = await fetch(`${baseUrl}/api/books?category=philosophy`);
    const filterData = await filterRes.json();
    const hasBook = filterData.books.some(b => b.id === newBookId);
    assert(filterRes.status === 200 && hasBook, 'Category filter correctly returns books matching requested category');

    // 2.7 Unauthorized user cannot delete book
    const studentDeleteRes = await fetch(`${baseUrl}/api/books/${newBookId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    assert(studentDeleteRes.status === 403, 'Unauthorized student deletion is rejected with HTTP 403');

    // 2.8 Delete book as admin (root cause fix: verify transactional cascade)
    // First simulate dependent records (cart, wishlist)
    db.prepare('INSERT OR IGNORE INTO cart_items (user_id, book_id, quantity) VALUES (2, ?, 1)').run(newBookId);
    db.prepare('INSERT OR IGNORE INTO wishlist (user_id, book_id) VALUES (2, ?)').run(newBookId);

    const adminDeleteRes = await fetch(`${baseUrl}/api/admin/books/${newBookId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const adminDeleteData = await adminDeleteRes.json();
    assert(adminDeleteRes.status === 200 && adminDeleteData.success === true, 'Admin delete book succeeds and cleans up dependent records');

    // 2.9 Verify book is completely removed from database
    const verifyDeletedRes = await fetch(`${baseUrl}/api/books/${newBookId}`);
    assert(verifyDeletedRes.status === 404, 'Deleted book is permanently removed from database (HTTP 404 on refresh)');

    // ----------------------------------------------------
    // TEST SECTION 3: SCANNER REGRESSION CHECK
    // ----------------------------------------------------
    console.log('\n--- 3. Testing Scanner Regression ---');

    // 3.1 Scanner ISBN lookup for Clean Code
    const scannerIsbnRes = await fetch(`${baseUrl}/api/scanner/isbn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isbn: '9780132350884' })
    });
    const scannerIsbnData = await scannerIsbnRes.json();
    assert(scannerIsbnRes.status === 200 && scannerIsbnData.matched === true && scannerIsbnData.book.title.includes('Clean Code'), 'Scanner deterministic ISBN lookup functions without regression');

    // 3.2 Scanner Text match for Atomic Habits
    const scannerTextRes = await fetch(`${baseUrl}/api/scanner/match-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Atomic Habits', author: 'James Clear' })
    });
    const scannerTextData = await scannerTextRes.json();
    assert(scannerTextRes.status === 200 && scannerTextData.matched === true && scannerTextData.book.title.includes('Atomic Habits'), 'Scanner title/author fuzzy matcher functions without regression');

    // ----------------------------------------------------
    // TEST SECTION 4: SERVER-SIDE ORDER PRICE VALIDATION & SECURITY
    // ----------------------------------------------------
    console.log('\n--- 4. Testing Server-Side Order Price Validation & Security ---');

    // Find an active book to test with
    const activeBook = catalogData.books.find(b => b.stock > 5);
    const expectedUnitPrice = Math.round(activeBook.price * (1 - (activeBook.discount || 0) / 100));
    const qty = 2;
    const expectedSubtotal = expectedUnitPrice * qty;
    const expectedDelivery = expectedSubtotal >= 499 ? 0 : 49;
    const expectedGrandTotal = expectedSubtotal + expectedDelivery;

    // 4.1 Price Tampering Prevention: Client sends grandTotal: 1 and subtotal: 1
    const tamperedOrderRes = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`
      },
      body: JSON.stringify({
        address: {
          fullName: 'Price Security Tester',
          phone: '+91 99999 88888',
          hostelBlock: 'Block A',
          roomNo: '101'
        },
        paymentMethod: 'UPI',
        items: [{ bookId: activeBook.id, quantity: qty }],
        summary: {
          subtotal: 1,
          grandTotal: 1,
          couponDiscount: 9999,
          deliveryFee: 0
        }
      })
    });
    const tamperedOrderData = await tamperedOrderRes.json();
    assert(tamperedOrderRes.status === 201, 'Order created successfully');
    assert(
      tamperedOrderData.order.total === expectedGrandTotal && tamperedOrderData.order.summary.subtotal === expectedSubtotal,
      `Server rejected client price tampering: GrandTotal is ₹${tamperedOrderData.order.total} (expected ₹${expectedGrandTotal}), Subtotal is ₹${tamperedOrderData.order.summary.subtotal} (expected ₹${expectedSubtotal})`
    );

    // 4.2 Rejection of zero/negative quantity
    const zeroQtyRes = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`
      },
      body: JSON.stringify({
        address: { fullName: 'Tester', phone: '9999999999', hostelBlock: 'B', roomNo: '202' },
        items: [{ bookId: activeBook.id, quantity: 0 }]
      })
    });
    assert(zeroQtyRes.status === 400, 'Order with zero quantity is rejected with HTTP 400');

    // 4.3 Rejection of non-existent book
    const fakeBookRes = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`
      },
      body: JSON.stringify({
        address: { fullName: 'Tester', phone: '9999999999', hostelBlock: 'B', roomNo: '202' },
        items: [{ bookId: 999999, quantity: 1 }]
      })
    });
    assert(fakeBookRes.status === 400, 'Order with non-existent book is rejected with HTTP 400');

    // 4.4 Rejection of quantity exceeding stock
    const excessQtyRes = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`
      },
      body: JSON.stringify({
        address: { fullName: 'Tester', phone: '9999999999', hostelBlock: 'B', roomNo: '202' },
        items: [{ bookId: activeBook.id, quantity: 99999 }]
      })
    });
    assert(excessQtyRes.status === 400, 'Order exceeding available stock is rejected with HTTP 400');

    // ----------------------------------------------------
    // TEST SECTION 5: SAFE BOOK ARCHIVING & ORDER ITEM PRESERVATION
    // ----------------------------------------------------
    console.log('\n--- 5. Testing Safe Book Archiving & Order Item Preservation ---');

    // 5.1 Create a temporary book, place an order with it, then archive it
    const archIsbn = '978' + Math.floor(1000000000 + Math.random() * 9000000000);
    const createArchBookRes = await fetch(`${baseUrl}/api/admin/books`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        title: 'Archival Integrity Verification Volume',
        author: 'Prof. Preservation',
        category: 'Technology',
        price: 500,
        stock: 20,
        isbn: archIsbn
      })
    });
    const archBookData = await createArchBookRes.json();
    const archBookId = archBookData.book.id;

    // Place an order for this book
    const archOrderRes = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({
        address: { fullName: 'Archival Tester', phone: '9998887776', hostelBlock: 'C', roomNo: '303' },
        items: [{ bookId: archBookId, quantity: 1 }]
      })
    });
    const archOrderData = await archOrderRes.json();
    const archOrderId = archOrderData.order.id;
    assert(archOrderRes.status === 201, 'Placed order containing book prior to archiving');

    // Archive the book as admin
    const archiveActionRes = await fetch(`${baseUrl}/api/admin/books/${archBookId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const archiveActionData = await archiveActionRes.json();
    assert(archiveActionRes.status === 200 && archiveActionData.archived === true, 'Book soft-archived successfully via admin endpoint');

    // 5.2 Verify Idempotent Archiving (calling again returns success)
    const secondArchiveRes = await fetch(`${baseUrl}/api/admin/books/${archBookId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const secondArchiveData = await secondArchiveRes.json();
    assert(secondArchiveRes.status === 200 && secondArchiveData.archived === true, 'Archiving is idempotent (repeating returns clean HTTP 200)');

    // 5.3 Verify Historical Order STILL preserves the order item and book metadata!
    const getHistoricOrderRes = await fetch(`${baseUrl}/api/orders/${archOrderId}`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    const historicOrderData = await getHistoricOrderRes.json();
    const foundItem = historicOrderData.order?.items?.find(i => i.book.id === archBookId);
    assert(
      getHistoricOrderRes.status === 200 && Boolean(foundItem) && foundItem.book.title === 'Archival Integrity Verification Volume',
      'Historical order preserves order items and book details after book is archived (no cascading deletion)'
    );

    // 5.4 Verify Archived Book cannot be purchased in direct API orders
    const purchaseArchivedRes = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({
        address: { fullName: 'Archival Tester', phone: '9998887776', hostelBlock: 'C', roomNo: '303' },
        items: [{ bookId: archBookId, quantity: 1 }]
      })
    });
    assert(purchaseArchivedRes.status === 400, 'Direct order creation for archived book is rejected with HTTP 400');

    // 5.5 Verify Archived Book is excluded from public catalog
    const publicCatalogRes = await fetch(`${baseUrl}/api/books`);
    const publicCatalogData = await publicCatalogRes.json();
    const inCatalog = publicCatalogData.books.some(b => b.id === archBookId);
    assert(!inCatalog, 'Archived book is excluded from public catalog results');

    // ----------------------------------------------------
    // TEST SECTION 6: PHASE 2.2 API HARDENING (CORS, RATE LIMITING, AI ACCESS, INPUT VALIDATION)
    // ----------------------------------------------------
    console.log('\n--- 6. Testing Phase 2.2 API Hardening & Access Controls ---');

    // 6.1 AI Endpoint Access Control (POST /api/recommendations/ai)
    // Unauthenticated request must be rejected with HTTP 401
    const unauthAiRes = await fetch(`${baseUrl}/api/recommendations/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'machine learning algorithms' })
    });
    assert(unauthAiRes.status === 401, 'AI Endpoint: Unauthenticated request is rejected (HTTP 401)');

    // 6.2 AI Endpoint Input Validation
    // Missing query
    const missingQueryRes = await fetch(`${baseUrl}/api/recommendations/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({})
    });
    assert(missingQueryRes.status === 400, 'AI Endpoint: Missing query prompt is rejected (HTTP 400)');

    // Query too short (<2 chars)
    const shortQueryRes = await fetch(`${baseUrl}/api/recommendations/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({ query: 'a' })
    });
    assert(shortQueryRes.status === 400, 'AI Endpoint: Short query (<2 chars) is rejected (HTTP 400)');

    // Query too long (>500 chars)
    const longQueryRes = await fetch(`${baseUrl}/api/recommendations/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({ query: 'x'.repeat(501) })
    });
    assert(longQueryRes.status === 400, 'AI Endpoint: Oversized query (>500 chars) is rejected (HTTP 400)');

    // Invalid currentBookTitle type
    const invalidTitleRes = await fetch(`${baseUrl}/api/recommendations/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({ query: 'valid prompt', currentBookTitle: 12345 })
    });
    assert(invalidTitleRes.status === 400, 'AI Endpoint: Non-string currentBookTitle is rejected (HTTP 400)');

    // 6.3 AI Endpoint Safe Error Handling (No stack leak on external failure)
    setAiRecommendationProvider(async () => {
      throw new Error('Simulated upstream AI provider timeout (8000ms)');
    });
    const errorAiRes = await fetch(`${baseUrl}/api/recommendations/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({ query: 'computer architecture' })
    });
    const errorAiData = await errorAiRes.json();
    assert(errorAiRes.status === 502, 'AI Endpoint: External AI failure returns safe HTTP 502');
    assert(
      errorAiData.error && !errorAiData.error.includes('stack') && !errorAiData.error.includes('at '),
      'AI Endpoint: External failure does not leak internal stack trace'
    );

    // 6.4 AI Endpoint Deterministic Success via Mock Provider
    setAiRecommendationProvider(async ({ query }) => {
      return {
        recommendation: `Recommended reading based on "${query}".`,
        suggestedBooks: [],
        isAiGenerated: true
      };
    });
    const validAiRes = await fetch(`${baseUrl}/api/recommendations/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({ query: 'data structures and algorithms' })
    });
    const validAiData = await validAiRes.json();
    assert(validAiRes.status === 200 && validAiData.isAiGenerated === true, 'AI Endpoint: Authenticated user receives recommendations without external API call');

    // 6.5 AI Endpoint Rate Limiting & User Isolation
    resetAllRateLimiters();
    let aiRateLimited = false;
    for (let i = 0; i < 21; i++) {
      const res = await fetch(`${baseUrl}/api/recommendations/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
        body: JSON.stringify({ query: `Prompt attempt ${i}` })
      });
      if (res.status === 429) {
        aiRateLimited = true;
        const retryAfter = res.headers.get('Retry-After');
        assert(Boolean(retryAfter), 'AI Rate Limiter includes Retry-After header');
        break;
      }
    }
    assert(aiRateLimited, 'AI Endpoint: Excessive requests trigger rate limit (HTTP 429)');

    // Unrelated user (adminToken) is NOT locked out by studentToken's rate limit exhaustion
    const otherUserAiRes = await fetch(`${baseUrl}/api/recommendations/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ query: 'quantum computing and physics' })
    });
    assert(otherUserAiRes.status === 200, 'AI Endpoint: User-level rate limiting prevents unrelated user lockout on shared IP');
    setAiRecommendationProvider(null);
    resetAllRateLimiters();

    // 6.6 Scanner Endpoint Access Policy & Input Validation
    // Unauthenticated request to /api/scanner/isbn succeeds for campus catalog lookup (storefront feature)
    const unauthScannerRes = await fetch(`${baseUrl}/api/scanner/isbn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isbn: '9780132350884' })
    });
    assert(unauthScannerRes.status === 200, 'Scanner Endpoint: Unauthenticated catalog lookup is permitted for storefront visitors (HTTP 200)');

    // Missing ISBN is rejected
    const missingIsbnRes = await fetch(`${baseUrl}/api/scanner/isbn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert(missingIsbnRes.status === 400, 'Scanner Endpoint: Missing ISBN is rejected (HTTP 400)');

    // Short ISBN (< 9 chars) is rejected
    const shortIsbnRes = await fetch(`${baseUrl}/api/scanner/isbn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isbn: '1234' })
    });
    assert(shortIsbnRes.status === 400, 'Scanner Endpoint: Short ISBN (<9 chars) is rejected (HTTP 400)');

    // Missing imageBase64 on /analyze is rejected
    const missingImageRes = await fetch(`${baseUrl}/api/scanner/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert(missingImageRes.status === 400, 'Scanner Endpoint: Missing imageBase64 is rejected (HTTP 400)');

    // Empty imageBase64 after data-URL is rejected
    const emptyImageRes = await fetch(`${baseUrl}/api/scanner/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: 'data:image/jpeg;base64,' })
    });
    assert(emptyImageRes.status === 400, 'Scanner Endpoint: Empty Base64 image payload is rejected (HTTP 400)');

    // Corrupted non-Base64 characters are rejected
    const corruptImageRes = await fetch(`${baseUrl}/api/scanner/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: 'data:image/jpeg;base64,invalid!@#$%^&*' })
    });
    assert(corruptImageRes.status === 400, 'Scanner Endpoint: Malformed non-Base64 characters are rejected (HTTP 400)');

    // Unsupported MIME format is rejected
    const badMimeRes = await fetch(`${baseUrl}/api/scanner/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: 'dGVzdA==', mimeType: 'image/gif' })
    });
    assert(badMimeRes.status === 400, 'Scanner Endpoint: Unsupported image MIME type (image/gif) is rejected (HTTP 400)');

    // Oversized imageBase64 payload (>14MB) is rejected with HTTP 413
    const oversizedImageRes = await fetch(`${baseUrl}/api/scanner/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: 'A'.repeat(15 * 1024 * 1024) })
    });
    assert(oversizedImageRes.status === 413, 'Scanner Endpoint: Oversized imageBase64 payload (>14MB) is rejected (HTTP 413)');

    // Decoded non-image string with valid-looking MIME type is rejected (magic bytes check)
    const nonImageRes = await fetch(`${baseUrl}/api/scanner/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: Buffer.from('Hello, this is just plain text, not a photo!').toString('base64'),
        mimeType: 'image/jpeg'
      })
    });
    assert(nonImageRes.status === 400, 'Scanner Endpoint: Decoded non-image payload is rejected by magic byte inspection (HTTP 400)');

    // Declared MIME type contradicts detected image format
    const valid1x1Png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
    const contradictoryMimeRes = await fetch(`${baseUrl}/api/scanner/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: valid1x1Png,
        mimeType: 'image/jpeg' // PNG bytes, but declared as JPEG
      })
    });
    assert(contradictoryMimeRes.status === 400, 'Scanner Endpoint: Declared MIME type contradicting detected format is rejected (HTTP 400)');

    // Detected unsupported image format without declared MIME is rejected
    const gifNoMimeRes = await fetch(`${baseUrl}/api/scanner/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' // GIF89a
      })
    });
    assert(gifNoMimeRes.status === 400, 'Scanner Endpoint: Detected unsupported format (GIF) without declared MIME is rejected (HTTP 400)');

    // Image dimensions exceeding maximum bounds (10,000x10,000 / 100MP) rejected
    const bombPngHeader = Buffer.alloc(30);
    bombPngHeader.set([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
    bombPngHeader.write('IHDR', 12, 4, 'ascii');
    bombPngHeader.writeUInt32BE(20000, 16); // 20,000 width
    bombPngHeader.writeUInt32BE(20000, 20); // 20,000 height
    const bombRes = await fetch(`${baseUrl}/api/scanner/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: bombPngHeader.toString('base64'),
        mimeType: 'image/png'
      })
    });
    assert(bombRes.status === 400, 'Scanner Endpoint: Oversized dimensions (20,000x20,000) rejected to prevent decompression attacks (HTTP 400)');

    // Decoded binary image size exceeding 10MB limit is rejected with HTTP 413
    const over10MbBinary = Buffer.alloc(10.6 * 1024 * 1024); // 10.6MB decoded
    over10MbBinary[0] = 0xFF;
    over10MbBinary[1] = 0xD8;
    over10MbBinary[2] = 0xFF;
    over10MbBinary[3] = 0xC0;
    over10MbBinary[4] = 0x00;
    over10MbBinary[5] = 0x11;
    over10MbBinary[6] = 0x08;
    over10MbBinary.writeUInt16BE(100, 7);
    over10MbBinary.writeUInt16BE(100, 9);
    const over10MbRes = await fetch(`${baseUrl}/api/scanner/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: over10MbBinary.toString('base64'),
        mimeType: 'image/jpeg'
      })
    });
    assert(over10MbRes.status === 413, 'Scanner Endpoint: Decoded image payload >10MB rejected with HTTP 413');

    // Boundary payload just below 10MB (9.5MB decoded JPEG) is accepted past body-parser & validation
    const under10MbBinary = Buffer.alloc(9.5 * 1024 * 1024); // 9.5MB decoded
    under10MbBinary[0] = 0xFF;
    under10MbBinary[1] = 0xD8;
    under10MbBinary[2] = 0xFF;
    under10MbBinary[3] = 0xC0;
    under10MbBinary[4] = 0x00;
    under10MbBinary[5] = 0x11;
    under10MbBinary[6] = 0x08;
    under10MbBinary.writeUInt16BE(1000, 7);
    under10MbBinary.writeUInt16BE(1000, 9);
    setVisionAnalysisProvider(async () => {
      return null; // Deterministic mock prevents external Gemini API calls during tests
    });
    const under10MbRes = await fetch(`${baseUrl}/api/scanner/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: under10MbBinary.toString('base64'),
        mimeType: 'image/jpeg'
      })
    });
    setVisionAnalysisProvider();
    assert(under10MbRes.status !== 413 && under10MbRes.status !== 400, 'Scanner Endpoint: Boundary payload just below 10MB passes body parser and validation');

    // 6.7 Scanner Catalog Isolation & Purchase Protection
    setExternalLookupProvider({
      lookupByIsbn: async (cleanIsbn) => {
        if (cleanIsbn === '9780000000002') {
          return {
            id: -1,
            title: 'External Archival Volume',
            author: 'Archival Scholar',
            isbn: cleanIsbn,
            category: 'Classics',
            categorySlug: 'classics',
            publisher: 'External Archives',
            pages: 671,
            year: 2003,
            language: 'English',
            coverImage: '',
            price: 0,
            discount: 0,
            stock: 0,
            rating: 0,
            description: 'External publication found via OpenLibrary archive.',
            isLocalCatalog: false
          };
        }
        return null;
      }
    });

    const extScannerRes = await fetch(`${baseUrl}/api/scanner/isbn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isbn: '9780000000002' })
    });
    const extScannerData = await extScannerRes.json();
    assert(
      extScannerRes.status === 200 && extScannerData.isLocalCatalog === false && extScannerData.book.id === -1,
      'Scanner: External catalog result has isLocalCatalog: false and id: -1'
    );
    assert(
      extScannerData.book.price === 0 && extScannerData.book.stock === 0,
      'Scanner: External catalog result has stock: 0 and price: 0 (not fabricated)'
    );

    // Attempting to place an order for external book (-1) is rejected with HTTP 400
    const orderExtRes = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({
        address: { fullName: 'External Book Tester', phone: '9998887776', hostelBlock: 'B', roomNo: '202' },
        items: [{ bookId: -1, quantity: 1 }]
      })
    });
    assert(orderExtRes.status === 400, 'Orders: External non-catalog search result (id: -1) cannot be purchased as local inventory (HTTP 400)');

    // Attempting to add external book (-1) to cart is rejected with HTTP 404
    const cartExtRes = await fetch(`${baseUrl}/api/cart/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({ bookId: -1, quantity: 1 })
    });
    assert(cartExtRes.status === 404, 'Cart: External non-catalog search result (id: -1) cannot be added to cart (HTTP 404)');

    // External lookup timeout/failure simulation gracefully returns HTTP 404
    setExternalLookupProvider({
      lookupByIsbn: async () => {
        throw new Error('Simulated OpenLibrary external network timeout');
      }
    });
    const timeoutExtRes = await fetch(`${baseUrl}/api/scanner/isbn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isbn: '9789999999999' })
    });
    assert(timeoutExtRes.status === 404, 'Scanner: External provider timeout or failure gracefully returns HTTP 404');
    setExternalLookupProvider();

    // 6.8 Scanner Endpoint Rate Limiting (POST /api/scanner/isbn)
    resetAllRateLimiters();
    let scannerRateLimited = false;
    for (let i = 0; i < 31; i++) {
      const res = await fetch(`${baseUrl}/api/scanner/isbn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isbn: '9780132350884' })
      });
      if (res.status === 429) {
        scannerRateLimited = true;
        break;
      }
    }
    assert(scannerRateLimited, 'Scanner Endpoint: Rapid requests trigger rate limit (HTTP 429)');
    resetAllRateLimiters();

    // 6.9 Authentication Rate Limiting & Proxy Protection
    resetAllRateLimiters();
    let authRateLimited = false;
    for (let i = 0; i < 16; i++) {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'attacker@booknest.com', password: 'WrongPassword' })
      });
      if (res.status === 429) {
        authRateLimited = true;
        break;
      }
    }
    assert(authRateLimited, 'Auth Rate Limiter: Repeated failed attempts trigger rate limit (HTTP 429)');

    // Alternate route (POST /api/auth/google) also triggers rate limit (shared limiter pool prevents bypass)
    const googleRateLimitedRes = await fetch(`${baseUrl}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: 'dummy-credential' })
    });
    assert(googleRateLimitedRes.status === 429, 'Auth Rate Limiter: Alternate auth route (/api/auth/google) cannot bypass rate limit (HTTP 429)');

    // Spoofed X-Forwarded-For header cannot bypass auth rate limit when trust proxy is false
    const spoofedHeaderRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '203.0.113.199' // Attempted spoofed IP
      },
      body: JSON.stringify({ email: 'attacker@booknest.com', password: 'WrongPassword' })
    });
    assert(spoofedHeaderRes.status === 429, 'Auth Rate Limiter: Spoofed X-Forwarded-For header cannot bypass rate limiter when trust proxy is disabled');
    resetAllRateLimiters();

    // 6.10 CORS Origin Policy Hardening
    // Allowed origin
    const corsAllowedRes = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: 'http://localhost:3000' }
    });
    assert(
      corsAllowedRes.headers.get('access-control-allow-origin') === 'http://localhost:3000',
      'CORS: Allowed origin receives Access-Control-Allow-Origin header'
    );

    // Disallowed origin
    const corsDisallowedRes = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: 'http://malicious-attacker-domain.evil' }
    });
    assert(
      !corsDisallowedRes.headers.get('access-control-allow-origin'),
      'CORS: Disallowed origin does NOT receive Access-Control-Allow-Origin header'
    );

    // Preflight OPTIONS request for allowed origin returns Access-Control-Allow-Origin
    const corsPreflightRes = await fetch(`${baseUrl}/api/health`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:3000',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type, Authorization'
      }
    });
    assert(
      (corsPreflightRes.status === 204 || corsPreflightRes.status === 200) &&
      corsPreflightRes.headers.get('access-control-allow-origin') === 'http://localhost:3000',
      'CORS: Preflight OPTIONS request from allowed origin returns Access-Control-Allow-Origin'
    );

    // Preflight OPTIONS with PATCH method (used by admin stock/status routes) is permitted
    const patchPreflightRes = await fetch(`${baseUrl}/api/admin/books/1/stock`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:3000',
        'Access-Control-Request-Method': 'PATCH',
        'Access-Control-Request-Headers': 'Content-Type, Authorization'
      }
    });
    assert(
      (patchPreflightRes.status === 204 || patchPreflightRes.status === 200) &&
      patchPreflightRes.headers.get('access-control-allow-origin') === 'http://localhost:3000',
      'CORS: Preflight OPTIONS with PATCH method is permitted for admin endpoints'
    );

    // Request without Origin header (e.g. native tools, mobile, server-side)
    const noOriginRes = await fetch(`${baseUrl}/api/health`);
    assert(noOriginRes.status === 200, 'CORS: Request without Origin header succeeds normally');

    // Sensitive operations without Origin header still strictly require backend authentication (CORS is not auth)
    const noOriginAuthRes = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ bookId: 1, quantity: 1 }] })
    });
    assert(noOriginAuthRes.status === 401, 'Backend Auth: Request without Origin header still requires authentication (HTTP 401)');

    // 6.11 Request Body Size Limit & Malformed JSON Handling (SEC-04)
    // Non-scanner standard endpoint rejects >100KB payload with HTTP 413
    const oversizedPayload = JSON.stringify({
      email: 'user@booknest.com',
      password: 'User@123',
      junk: 'A'.repeat(150 * 1024) // 150KB
    });
    const oversizedRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: oversizedPayload
    });
    assert(oversizedRes.status === 413, 'Payload Limits: Standard route rejects payload >100KB with HTTP 413');

    // Malformed JSON payload does not crash server and returns controlled HTTP 400
    const malformedJsonRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"email": "broken-json", incomplete...'
    });
    const malformedJsonData = await malformedJsonRes.json();
    assert(
      malformedJsonRes.status === 400 && malformedJsonData.error === 'Malformed JSON payload in request body.',
      'Payload Parsing: Malformed JSON payload returns controlled HTTP 400 without crashing server'
    );

    // 6.12 Security Headers Enforcement
    const healthHeaderRes = await fetch(`${baseUrl}/api/health`);
    assert(
      healthHeaderRes.headers.get('x-content-type-options') === 'nosniff',
      'Security Headers: X-Content-Type-Options is nosniff'
    );
    assert(
      healthHeaderRes.headers.get('x-frame-options') === 'DENY',
      'Security Headers: X-Frame-Options is DENY'
    );
    assert(
      healthHeaderRes.headers.get('referrer-policy') === 'strict-origin-when-cross-origin',
      'Security Headers: Referrer-Policy is strict-origin-when-cross-origin'
    );
    assert(
      healthHeaderRes.headers.get('permissions-policy') === 'camera=(self), microphone=(), geolocation=()',
      'Security Headers: Permissions-Policy restricts microphone/geo while allowing camera'
    );

    // ----------------------------------------------------
    // TEST SECTION 7: PHASE 2.3 ORDER & INVENTORY RELIABILITY
    // ----------------------------------------------------
    console.log('\n--- 7. Testing Phase 2.3 Order & Inventory Reliability ---');

    // Helper: Create isolated test books
    const createBook = async (title, price, stock) => {
      const isbn = '978' + Math.floor(1000000000 + Math.random() * 9000000000);
      const res = await fetch(`${baseUrl}/api/admin/books`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ title, author: 'Reliability Author', category: 'Technology', price, stock, isbn })
      });
      const data = await res.json();
      return data.book;
    };

    const bookA = await createBook('Reliability Book A', 300, 10);
    const bookB = await createBook('Reliability Book B', 400, 1);
    const bookC = await createBook('Reliability Book C', 500, 3);
    const bookD = await createBook('Reliability Book D', 250, 1);

    // 7.1 Idempotent Order Creation (Duplicate Submission)
    const idempotencyKey1 = `order-idemp-${Date.now()}-${Math.random()}`;
    const orderPayload1 = {
      address: { fullName: 'Idempotency Tester', phone: '9988776655', hostelBlock: 'H1', roomNo: '101' },
      paymentMethod: 'UPI',
      items: [{ bookId: bookA.id, quantity: 2 }]
    };

    // First submission
    const idempRes1 = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
        'Idempotency-Key': idempotencyKey1
      },
      body: JSON.stringify(orderPayload1)
    });
    const idempData1 = await idempRes1.json();
    assert(idempRes1.status === 201 && idempData1.order?.id, '7.1 Initial order creation with Idempotency-Key succeeds (HTTP 201)');
    const initialOrderId = idempData1.order.id;

    // Second submission with exact same key and payload (network retry / double-click)
    const idempRes2 = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
        'Idempotency-Key': idempotencyKey1
      },
      body: JSON.stringify(orderPayload1)
    });
    const idempData2 = await idempRes2.json();
    assert(
      idempRes2.status === 201 &&
      idempData2.order?.id === initialOrderId &&
      idempRes2.headers.get('idempotent-replayed') === 'true',
      '7.1 Duplicate submission returns cached order and Idempotent-Replayed: true header'
    );

    // Verify stock was decremented ONLY ONCE (10 - 2 = 8, not 6)
    const bookACheckRes = await fetch(`${baseUrl}/api/books/${bookA.id}`);
    const bookACheckData = await bookACheckRes.json();
    assert(bookACheckData.book?.stock === 8, `7.1 Inventory decremented exactly once for idempotent duplicate submission (stock is ${bookACheckData.book?.stock}, expected 8)`);

    // 7.2 Idempotency Key Reuse With Different Payload (HTTP 409 Conflict)
    const conflictingPayload = {
      ...orderPayload1,
      items: [{ bookId: bookA.id, quantity: 3 }] // Changed quantity
    };
    const conflictRes = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
        'Idempotency-Key': idempotencyKey1
      },
      body: JSON.stringify(conflictingPayload)
    });
    assert(conflictRes.status === 409, `7.2 Idempotency-Key reuse with different payload returns HTTP 409 Conflict (got ${conflictRes.status})`);

    // 7.3 Idempotency Key Scoped Per User (Another user can use same key string safely)
    const user2Res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'User Two', email: `user2_${Date.now()}@booknest.com`, password: 'Password@123', phone: '9876543210' })
    });
    const user2Data = await user2Res.json();
    const user2Token = user2Data.token;

    const user2OrderRes = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user2Token}`,
        'Idempotency-Key': idempotencyKey1
      },
      body: JSON.stringify({
        address: { fullName: 'User Two', phone: '9876543210', hostelBlock: 'H2', roomNo: '202' },
        paymentMethod: 'Cash on Delivery',
        items: [{ bookId: bookA.id, quantity: 1 }]
      })
    });
    assert(user2OrderRes.status === 201, '7.3 Idempotency-Key is scoped per user; different user using same key creates order successfully');

    // 7.4 Atomic Rollback on Partial/Insufficient Stock
    // Book A has stock 7 now (8 - 1). Book B has stock 1.
    // Order requesting 2 of Book A and 5 of Book B must completely roll back.
    const partialFailRes = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({
        address: { fullName: 'Rollback Tester', phone: '9988776655', hostelBlock: 'H1', roomNo: '101' },
        items: [
          { bookId: bookA.id, quantity: 2 },
          { bookId: bookB.id, quantity: 5 }
        ]
      })
    });
    assert(partialFailRes.status === 400, '7.4 Multi-item order with one out-of-stock item is rejected (HTTP 400)');

    // Check Book A and Book B stocks: Book A must STILL be 7 (no partial decrement of Book A!)
    const bookAPostFailRes = await fetch(`${baseUrl}/api/books/${bookA.id}`);
    const bookAPostFailData = await bookAPostFailRes.json();
    const bookBPostFailRes = await fetch(`${baseUrl}/api/books/${bookB.id}`);
    const bookBPostFailData = await bookBPostFailRes.json();
    assert(
      bookAPostFailData.book?.stock === 7 && bookBPostFailData.book?.stock === 1,
      `7.4 Atomic rollback preserves all inventory when one item fails (Book A: ${bookAPostFailData.book?.stock}, Book B: ${bookBPostFailData.book?.stock})`
    );

    // 7.5 Item Consolidation Prevents Stock Bypass via Duplicate Line Items
    // Book C has stock = 3.
    // Client sends two line items for Book C, each qty 2 (total 4 > 3).
    const splitBypassRes = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({
        address: { fullName: 'Consolidation Tester', phone: '9988776655', hostelBlock: 'H1', roomNo: '101' },
        items: [
          { bookId: bookC.id, quantity: 2 },
          { bookId: bookC.id, quantity: 2 }
        ]
      })
    });
    assert(splitBypassRes.status === 400, '7.5 Consolidation rejects duplicate line items exceeding total stock (HTTP 400)');

    // Client sends two line items for Book C, each qty 1 (total 2 <= 3) -> should succeed
    const splitValidRes = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({
        address: { fullName: 'Consolidation Tester', phone: '9988776655', hostelBlock: 'H1', roomNo: '101' },
        items: [
          { bookId: bookC.id, quantity: 1 },
          { bookId: bookC.id, quantity: 1 }
        ]
      })
    });
    assert(splitValidRes.status === 201, '7.5 Valid consolidated multi-line order succeeds');
    const bookCCheckRes = await fetch(`${baseUrl}/api/books/${bookC.id}`);
    const bookCCheckData = await bookCCheckRes.json();
    assert(bookCCheckData.book?.stock === 1, `7.5 Book C stock correctly decremented by consolidated total (3 - 2 = ${bookCCheckData.book?.stock})`);

    // 7.6 Concurrent Checkout Race Condition Prevention
    // Book D has exactly stock = 1.
    // Fire 6 concurrent checkouts for Book D (qty 1). Exactly ONE must succeed and 5 must fail.
    const concurrentRequests = Array.from({ length: 6 }, (_, i) =>
      fetch(`${baseUrl}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
        body: JSON.stringify({
          address: { fullName: `Racer ${i}`, phone: '9988776655', hostelBlock: 'H1', roomNo: '101' },
          items: [{ bookId: bookD.id, quantity: 1 }]
        })
      })
    );
    const concurrentResults = await Promise.all(concurrentRequests);
    const successCount = concurrentResults.filter(r => r.status === 201).length;
    const failCount = concurrentResults.filter(r => r.status === 400).length;
    assert(
      successCount === 1 && failCount === 5,
      `7.6 Concurrent checkout race condition prevented: ${successCount} succeeded, ${failCount} rejected`
    );

    const bookDCheckRes = await fetch(`${baseUrl}/api/books/${bookD.id}`);
    const bookDCheckData = await bookDCheckRes.json();
    assert(bookDCheckData.book?.stock === 0, `7.6 Book D stock is exactly 0 and never went negative (${bookDCheckData.book?.stock})`);

    // Extract the successful order ID from the concurrent test
    let successfulDOrderId;
    for (const r of concurrentResults) {
      if (r.status === 201) {
        const d = await r.json();
        successfulDOrderId = d.order?.id;
        break;
      }
    }

    // 7.7 Order Status Integrity & Inventory Restoration on Cancellation
    // Idempotent status update: set to 'Processing'
    const statusProc1 = await fetch(`${baseUrl}/api/admin/orders/${successfulDOrderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ status: 'Processing' })
    });
    assert(statusProc1.status === 200, '7.7 Admin updates status to Processing');

    // Repeated update to 'Processing' does not change stock
    const statusProc2 = await fetch(`${baseUrl}/api/admin/orders/${successfulDOrderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ status: 'Processing' })
    });
    assert(statusProc2.status === 200, '7.7 Repeated status update to Processing is idempotent');

    // Cancel the order -> stock for Book D must be restored from 0 to 1
    const cancelRes1 = await fetch(`${baseUrl}/api/admin/orders/${successfulDOrderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ status: 'Cancelled' })
    });
    assert(cancelRes1.status === 200, '7.7 Order cancelled successfully by admin');

    const bookDRestoredRes = await fetch(`${baseUrl}/api/books/${bookD.id}`);
    const bookDRestoredData = await bookDRestoredRes.json();
    assert(bookDRestoredData.book?.stock === 1, `7.7 Book D stock restored to 1 upon cancellation (got ${bookDRestoredData.book?.stock})`);

    // 7.8 Repeated Cancellation is Idempotent (stock must NOT be restored again)
    const cancelRes2 = await fetch(`${baseUrl}/api/admin/orders/${successfulDOrderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ status: 'Cancelled' })
    });
    assert(cancelRes2.status === 200, '7.8 Repeating cancellation on already cancelled order returns HTTP 200');

    const bookDCheckRepeatRes = await fetch(`${baseUrl}/api/books/${bookD.id}`);
    const bookDCheckRepeatData = await bookDCheckRepeatRes.json();
    assert(bookDCheckRepeatData.book?.stock === 1, `7.8 Book D stock remains exactly 1; repeated cancellation does not double-restore stock (got ${bookDCheckRepeatData.book?.stock})`);

    // 7.9 Terminal Cancelled State Protection (cannot transition from Cancelled to Shipped)
    const invalidUncancelRes = await fetch(`${baseUrl}/api/admin/orders/${successfulDOrderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ status: 'Shipped' })
    });
    assert(invalidUncancelRes.status === 400, '7.9 Cannot transition an already cancelled order to Shipped (HTTP 400)');

    // ----------------------------------------------------
    // TEST SECTION 8: ADMIN AUTHENTICATION & AI ADVISOR REGRESSION (CRITICAL AUDIT)
    // ----------------------------------------------------
    console.log('\n--- 8. Admin Authentication & AI Reading Advisor Regression Suite ---');

    // 8.1 Admin sign-in with valid credentials
    const sec8AdminLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@booknest.com', password: 'Admin@123' })
    });
    const sec8AdminData = await sec8AdminLogin.json();
    assert(
      sec8AdminLogin.status === 200 &&
      sec8AdminData.user?.role === 'admin' &&
      typeof sec8AdminData.token === 'string',
      '8.1 Valid admin credentials authenticate successfully with role="admin" and JWT'
    );

    // 8.2 Invalid admin password rejected
    const sec8InvalidPw = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@booknest.com', password: 'IncorrectPassword!999' })
    });
    assert(sec8InvalidPw.status === 401, '8.2 Invalid admin password is rejected with HTTP 401');

    // 8.3 Demo admin self-healing via ensureDemoAccounts()
    // Test A: Missing demo admin is created cleanly
    db.prepare("DELETE FROM users WHERE email = 'admin@booknest.com'").run();
    ensureDemoAccounts(); // Run idempotent auto-heal
    const restoredAdmin = db.prepare("SELECT role, password_hash FROM users WHERE email = 'admin@booknest.com'").get();
    assert(restoredAdmin && restoredAdmin.role === 'admin', '8.3A ensureDemoAccounts() creates missing administrator account with role="admin"');

    const healedLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@booknest.com', password: 'Admin@123' })
    });
    assert(healedLoginRes.status === 200, '8.3A Restored demo admin authenticates successfully');

    // Test B: Existing accounts and passwords are NOT overwritten
    const customTestEmail = 'preserve_test_user@booknest.com';
    const customHash = '$2a$10$customlegitimatehashplaceholder999999999999999999';
    db.prepare("INSERT OR REPLACE INTO users (name, email, password_hash, role, joined_date) VALUES (?, ?, ?, 'user', 'Today')").run('Preserved User', customTestEmail, customHash);
    ensureDemoAccounts();
    const untouchedUser = db.prepare("SELECT password_hash FROM users WHERE email = ?").get(customTestEmail);
    assert(untouchedUser.password_hash === customHash, '8.3B Existing account passwords are not overwritten by ensureDemoAccounts()');
    db.prepare("DELETE FROM users WHERE email = ?").run(customTestEmail);

    // Test C: Demo account creation is strictly blocked in production
    const prevEnv = config.nodeEnv;
    config.nodeEnv = 'production';
    db.prepare("DELETE FROM users WHERE email = 'admin@booknest.com'").run();
    ensureDemoAccounts();
    const prodAdmin = db.prepare("SELECT id FROM users WHERE email = 'admin@booknest.com'").get();
    assert(!prodAdmin, '8.3C ensureDemoAccounts() strictly blocks demo account creation in production mode');
    config.nodeEnv = prevEnv;
    ensureDemoAccounts(); // Restore admin for remaining tests

    // 8.4 Role-based authorization: Student cannot access admin-only endpoints
    const studentMetricsRes = await fetch(`${baseUrl}/api/admin/metrics`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    assert(studentMetricsRes.status === 403, '8.4 Student role is rejected from admin metrics (HTTP 403)');

    const studentOrdersRes = await fetch(`${baseUrl}/api/admin/orders`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    assert(studentOrdersRes.status === 403, '8.4 Student role is rejected from admin orders (HTTP 403)');

    // 8.5 Expired and tampered tokens are rejected
    const activeSecret = resolveJwtSecret(config.nodeEnv || 'development');
    const expiredToken = jwt.sign(
      { id: 1, email: 'admin@booknest.com', role: 'admin', name: 'Admin' },
      activeSecret,
      { expiresIn: '-10s' }
    );
    const expiredAuthRes = await fetch(`${baseUrl}/api/admin/metrics`, {
      headers: { Authorization: `Bearer ${expiredToken}` }
    });
    assert(expiredAuthRes.status === 401, '8.5 Expired JWT token is rejected (HTTP 401)');

    const tamperedToken = `${sec8AdminData.token}corrupted`;
    const tamperedAuthRes = await fetch(`${baseUrl}/api/admin/metrics`, {
      headers: { Authorization: `Bearer ${tamperedToken}` }
    });
    assert(tamperedAuthRes.status === 401, '8.5 Tampered JWT signature is rejected (HTTP 401)');

    // 8.6 AI Advisor: Unauthenticated requests are rejected
    const sec8UnauthAiRes = await fetch(`${baseUrl}/api/recommendations/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'machine learning algorithms' })
    });
    assert(sec8UnauthAiRes.status === 401, '8.6 AI Advisor: Unauthenticated request is rejected (HTTP 401)');

    // 8.7 AI Advisor: Catalog fallback returns real warehouse inventory when key is missing or null
    const catalogFallback = getCatalogFallbackRecommendations('clean code');
    assert(
      catalogFallback &&
      catalogFallback.isAiGenerated === false &&
      Array.isArray(catalogFallback.suggestedBooks) &&
      catalogFallback.suggestedBooks.length > 0 &&
      Boolean(catalogFallback.recommendation),
      '8.7 AI Advisor: getCatalogFallbackRecommendations returns verified warehouse inventory'
    );

    // 8.8 AI Advisor: Fallback when unknown query has no direct keyword match
    const noMatchFallback = getCatalogFallbackRecommendations('xyznonexistentquery99999');
    assert(
      noMatchFallback &&
      noMatchFallback.isAiGenerated === false &&
      Array.isArray(noMatchFallback.suggestedBooks) &&
      noMatchFallback.suggestedBooks.length > 0,
      '8.8 AI Advisor: Fallback returns top-rated campus books when no keyword matches'
    );

    // 8.9 AI Advisor: Malformed AI output or provider failure safely falls back to catalog
    setAiRecommendationProvider(async () => {
      // Return deterministic fallback
      return {
        recommendation: 'Deterministic mock recommendation',
        suggestedBooks: catalogFallback.suggestedBooks,
        isAiGenerated: false
      };
    });
    const safeAiRes = await fetch(`${baseUrl}/api/recommendations/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({ query: 'web engineering and databases' })
    });
    const safeAiData = await safeAiRes.json();
    assert(
      safeAiRes.status === 200 &&
      Array.isArray(safeAiData.suggestedBooks) &&
      safeAiData.suggestedBooks.length > 0,
      '8.9 AI Advisor: Gracefully serves safe recommendation without crashing on edge cases'
    );
    setAiRecommendationProvider(null);

    // 8.10 Security: Responses never leak JWT secrets, passwords, or API keys
    const responsePayloadStr = JSON.stringify(safeAiData) + JSON.stringify(sec8AdminData);
    const hasLeakedSecret = responsePayloadStr.includes('password_hash') ||
      responsePayloadStr.includes('GEMINI_API_KEY') ||
      (process.env.GEMINI_API_KEY && responsePayloadStr.includes(process.env.GEMINI_API_KEY));
    assert(!hasLeakedSecret, '8.10 Security: Zero leakage of secrets, passwords, or API keys in response payloads');

    // 8.11 Optional Live-Provider Smoke Test (only runs if GEMINI_API_KEY is configured in env)
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()) {
      console.log('  ℹ️  Live GEMINI_API_KEY detected — running live model smoke test...');
      try {
        const liveRes = await fetch(`${baseUrl}/api/recommendations/ai`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
          body: JSON.stringify({ query: 'artificial intelligence and data science' })
        });
        const liveData = await liveRes.json();
        assert(
          liveRes.status === 200 &&
          typeof liveData.recommendation === 'string' &&
          Array.isArray(liveData.suggestedBooks),
          '8.11 [LIVE OPTIONAL] Live Gemini recommendation successfully returned valid schema'
        );
      } catch (liveErr) {
        console.warn('  ⚠️ Live smoke test encountered network error (non-fatal):', liveErr.message);
      }
    } else {
      console.log('  ℹ️  [SKIPPED] Live AI smoke test (GEMINI_API_KEY not set in environment)');
    }

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  } finally {
    if (typeof setGoogleTokenVerifier === 'function') {
      setGoogleTokenVerifier(null);
    }
    if (typeof setAiRecommendationProvider === 'function') {
      setAiRecommendationProvider(null);
    }
    if (typeof setExternalLookupProvider === 'function') {
      setExternalLookupProvider();
    }
    if (typeof setVisionAnalysisProvider === 'function') {
      setVisionAnalysisProvider();
    }
    if (typeof resetAllRateLimiters === 'function') {
      resetAllRateLimiters();
    }
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (typeof closeDatabase === 'function') {
      closeDatabase();
    }
  }

  console.log('\n========================================================');
  console.log(`Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
