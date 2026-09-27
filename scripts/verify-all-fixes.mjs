import { app } from '../server/server.js';
import { db } from '../server/database/index.js';
import http from 'http';

const TEST_PORT = 5055;
let server;

async function runTests() {
  console.log('🚀 Starting BookNest End-to-End Test Suite...');
  
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
    // TEST SECTION 1: AUTHENTICATION
    // ----------------------------------------------------
    console.log('\n--- 1. Testing Authentication ---');

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

    // 1.4 Google Sign In via POST /api/auth/google
    const googleUserEmail = `googleuser_${Date.now()}@gmail.com`;
    const googleLoginRes = await fetch(`${baseUrl}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: googleUserEmail, name: 'Google Scholar', googleId: 'goog_12345' })
    });
    const googleLoginData = await googleLoginRes.json();
    assert(googleLoginRes.status === 200 && googleLoginData.user.email === googleUserEmail && Boolean(googleLoginData.token), 'Google authentication succeeds, creates user, and issues JWT');

    // 1.5 Session validation (GET /api/auth/me)
    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${googleLoginData.token}` }
    });
    const meData = await meRes.json();
    assert(meRes.status === 200 && meData.user.email === googleUserEmail, 'Session token survives and restores user profile via /api/auth/me');

    // 1.6 Google OAuth initiation route (GET /api/auth/google)
    const googleAuthInitRes = await fetch(`${baseUrl}/api/auth/google`, { redirect: 'manual' });
    assert(googleAuthInitRes.status === 302, 'GET /api/auth/google properly redirects with OAuth params');

    // 1.7 Logout (POST /api/auth/logout)
    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST' });
    assert(logoutRes.status === 200, 'Logout endpoint responds successfully');

    // 1.8 Protected route check
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

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  } finally {
    if (server) {
      server.close();
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
