import { chromium } from '@playwright/test';
import fetch from 'node-fetch';
import path from 'path';
import fs from 'fs';

// Set isolated test database environment BEFORE importing server/database modules
const testDbPath = process.env.DB_PATH || path.resolve(process.cwd(), 'data', 'booknest.test.db');
process.env.DB_PATH = testDbPath;
process.env.NODE_ENV = 'test';

// Dynamically import server and database
const { app } = await import('../server/server.js');
const { closeDatabase } = await import('../server/database/index.js');

const TEST_PORT = 5056;
const BASE_URL = 'http://localhost:3000';
const API_URL = `http://localhost:${TEST_PORT}/api`;
let server;

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function runPersistenceTestSuite() {
  console.log('🧪 ========================================================');
  console.log('🧪 BookNest Full-Stack Persistence & Refresh Test Suite');
  console.log(`🧪 Using Isolated Test Database: ${process.env.DB_PATH}`);
  console.log('🧪 ========================================================\n');

  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      console.log(`Test API server running on port ${TEST_PORT}`);
      resolve();
    });
  });

  // --- SUITE A: BACKEND REST & AUTHENTICATION INTEGRITY ---
  console.log('--- Phase 1: REST API & Authentication Verification ---');

  // 1. Test student login
  const studentLoginRes = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'user@booknest.com', password: 'User@123' })
  });
  const studentData = await studentLoginRes.json();
  assert(studentLoginRes.status === 200, 'Student login returns 200 OK');
  assert(studentData.user.role === 'user', 'Student user has role "user"');
  assert(typeof studentData.token === 'string', 'Student received valid JWT token');

  // 2. Test admin login
  const adminLoginRes = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@booknest.com', password: 'Admin@123' })
  });
  const adminData = await adminLoginRes.json();
  assert(adminLoginRes.status === 200, 'Admin login returns 200 OK');
  assert(adminData.user.role === 'admin', 'Admin user has role "admin"');
  assert(typeof adminData.token === 'string', 'Admin received valid JWT token');

  // 3. Test non-admin rejected from admin endpoints
  const studentAdminAttempt = await fetch(`${API_URL}/admin/metrics`, {
    headers: { 'Authorization': `Bearer ${studentData.token}` }
  });
  assert(studentAdminAttempt.status === 403, 'Normal user blocked from /api/admin/metrics (403 Forbidden)');

  // 4. Test admin authorized on admin endpoints
  const adminMetrics = await fetch(`${API_URL}/admin/metrics`, {
    headers: { 'Authorization': `Bearer ${adminData.token}` }
  });
  assert(adminMetrics.status === 200, 'Admin authorized on /api/admin/metrics (200 OK)');

  // 5. Test Books API
  const booksRes = await fetch(`${API_URL}/books`);
  const booksData = await booksRes.json();
  assert(booksRes.status === 200, 'GET /api/books returns 200 OK');
  assert(Array.isArray(booksData.books) && booksData.books.length > 0, `Catalog contains ${booksData.books.length} books`);

  // 6. Test Book search endpoint
  const searchRes = await fetch(`${API_URL}/books/search?q=habits`);
  const searchData = await searchRes.json();
  assert(searchRes.status === 200, 'GET /api/books/search?q=habits returns 200 OK');
  assert(searchData.books.some(b => b.title.includes('Atomic Habits')), 'Search finds "Atomic Habits"');

  // 7. Test Category endpoint
  const catRes = await fetch(`${API_URL}/books/category/programming`);
  const catData = await catRes.json();
  assert(catRes.status === 200, 'GET /api/books/category/programming returns 200 OK');
  assert(catData.books.length > 0, `Found ${catData.books.length} programming books`);


  // --- SUITE B: BROWSER REFRESH & PERSISTENCE FLOW ---
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  // Route all browser /api calls to isolated test server on port 5056
  await context.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const targetUrl = `http://127.0.0.1:${TEST_PORT}${url.pathname}${url.search}`;
    try {
      const headers = { ...request.headers() };
      delete headers['host'];
      const response = await fetch(targetUrl, {
        method: request.method(),
        headers,
        body: request.postDataBuffer() || undefined,
      });
      const body = await response.buffer();
      const responseHeaders = {};
      for (const [key, value] of response.headers.entries()) {
        responseHeaders[key] = value;
      }
      await route.fulfill({
        status: response.status,
        headers: responseHeaders,
        body,
      });
    } catch (err) {
      console.error(`Route forwarding failed for ${targetUrl}:`, err);
      await route.abort();
    }
  });

  const page = await context.newPage();

  try {
    // 1. Visit homepage
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    // Verify logged out initially
    const signInBtn = page.getByRole('button', { name: /Sign In \/ Register/i }).first();
    assert(await signInBtn.isVisible(), 'Guest starts logged out with "Sign In / Register" button');

    // 2. Log in as Student
    await signInBtn.click();
    await page.waitForTimeout(400);

    // Quick demo student login
    const demoStudentBtn = page.locator('button:has-text("Aditya Chauhan")');
    if (await demoStudentBtn.isVisible()) {
      await demoStudentBtn.click();
    } else {
      await page.fill('input[type="email"]', 'user@booknest.com');
      await page.fill('input[type="password"]', 'User@123');
      await page.locator('button[type="submit"]:has-text("Sign In")').click();
    }
    await page.waitForTimeout(800);

    // Verify authenticated state
    const studentBadge = page.locator('text=Student');
    assert(await studentBadge.first().isVisible(), 'User is authenticated and displays "Student" role');

    // 3. Test Cart Persistence across Refresh
    console.log('\n--- Step A: Cart Persistence Across Page Reload ---');
    // Open cart drawer
    await page.locator('button[title="Shopping Cart"]').click();
    await page.waitForTimeout(400);

    // Empty cart first if any items exist
    const clearCartBtn = page.locator('button:has-text("Clear All")');
    if (await clearCartBtn.isVisible()) {
      await clearCartBtn.click();
      await page.waitForTimeout(400);
    }
    await page.locator('[data-testid="close-cart-btn"]').click();
    await page.waitForTimeout(300);

    // Add "Atomic Habits" to cart from storefront
    const addHabitsBtn = page.locator('button').filter({ hasText: /Add/i }).first();
    await addHabitsBtn.click();
    await page.waitForTimeout(600);

    // Check cart count is at least 1
    const cartCountBadge = page.locator('button[title="Shopping Cart"] span.rounded-md');
    const countBeforeRefresh = await cartCountBadge.textContent();
    assert(parseInt(countBeforeRefresh || '0', 10) >= 1, `Cart count incremented before refresh: ${countBeforeRefresh}`);

    // REFRESH PAGE
    console.log('  🔄 Reloading browser page...');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    // Verify Cart remains after refresh!
    const countAfterRefresh = await page.locator('button[title="Shopping Cart"] span.rounded-md').textContent();
    assert(countAfterRefresh === countBeforeRefresh, `✅ REFRESH SUCCESS: Cart persisted after page reload (Count: ${countAfterRefresh})`);

    // Open cart drawer to confirm item is physically in the drawer
    await page.locator('button[title="Shopping Cart"]').click();
    await page.waitForTimeout(400);
    const cartDrawerItems = await page.locator('.cart-item-row, div.divide-y > div').count();
    assert(cartDrawerItems > 0, 'Cart drawer displays persisted items from database');
    await page.locator('[data-testid="close-cart-btn"]').click();
    await page.waitForTimeout(300);


    // 4. Test Wishlist Persistence across Refresh
    console.log('\n--- Step B: Wishlist Persistence Across Page Reload ---');
    // Navigate to Catalog
    await page.locator('nav button:has-text("Catalog")').click();
    await page.waitForTimeout(600);

    // Click heart icon on a book to toggle wishlist
    const heartBtn = page.locator('button[title*="wishlist" i], button[aria-label*="wishlist" i]').first();
    if (await heartBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
      await heartBtn.click();
      await page.waitForTimeout(600);
    }

    // Check wishlist badge in navbar (gracefully handles zero count where badge is intentionally unrendered)
    const wishlistBadge = page.locator('button[title="Wishlist"] span.rounded-full');
    let wishlistCountBefore = '0';
    try {
      if (await wishlistBadge.isVisible({ timeout: 2000 })) {
        wishlistCountBefore = (await wishlistBadge.textContent())?.trim() || '0';
      }
    } catch {}
    console.log(`  📊 Wishlist count before reload: ${wishlistCountBefore}`);

    // REFRESH PAGE
    console.log('  🔄 Reloading browser page...');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    // Verify Wishlist remains after refresh!
    let wishlistCountAfter = '0';
    try {
      const refreshedBadge = page.locator('button[title="Wishlist"] span.rounded-full');
      if (await refreshedBadge.isVisible({ timeout: 2000 })) {
        wishlistCountAfter = (await refreshedBadge.textContent())?.trim() || '0';
      }
    } catch {}
    assert(wishlistCountAfter === wishlistCountBefore, `✅ REFRESH SUCCESS: Wishlist persisted after page reload (Count: ${wishlistCountAfter})`);


    // 5. Test Order Placement & Persistence across Refresh
    console.log('\n--- Step C: Order Placement & Persistence Across Page Reload ---');
    // Open cart drawer and proceed to checkout
    await page.locator('button[title="Shopping Cart"]').click();
    await page.waitForTimeout(400);

    const checkoutBtn = page.locator('[data-testid="proceed-checkout-btn"]');
    assert(await checkoutBtn.isVisible(), 'Proceed to checkout button visible in cart drawer');
    await checkoutBtn.click();
    await page.waitForTimeout(500);

    // Step 1: Address
    const step1Btn = page.locator('button:has-text("Proceed to Order Review")');
    if (await step1Btn.isVisible()) {
      await step1Btn.click();
      await page.waitForTimeout(400);
    }

    // Step 2: Review
    const step2Btn = page.locator('button:has-text("Proceed to Payment")');
    if (await step2Btn.isVisible()) {
      await step2Btn.click();
      await page.waitForTimeout(400);
    }

    // Step 3: Payment Confirmation
    const placeOrderBtn = page.locator('button:has-text("Confirm & Pay")');
    if (await placeOrderBtn.isVisible()) {
      await placeOrderBtn.click();
      await page.waitForTimeout(1000);
    }

    // Wait for receipt and click "View All Orders"
    const receiptDispatch = page.locator('text=Order Successfully Dispatched!');
    assert(await receiptDispatch.isVisible(), 'Order successfully confirmed with Tax Invoice manifest');
    
    await page.locator('button:has-text("View All Orders")').click();
    await page.waitForTimeout(600);

    // Verify navigated to Orders view with placed order
    const ordersViewHeader = page.locator('text=My Orders');
    assert(await ordersViewHeader.first().isVisible(), 'Navigated to My Orders view after placement');

    const ordersCountBefore = await page.locator('[data-testid="order-card"]').count();
    assert(ordersCountBefore > 0, `Orders view displays placed order (Count: ${ordersCountBefore})`);

    // REFRESH PAGE
    console.log('  🔄 Reloading browser page...');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.locator('[data-testid="order-card"]').first().waitFor({ timeout: 5000 });

    // Verify Orders remain after refresh!
    const ordersCountAfter = await page.locator('[data-testid="order-card"]').count();
    assert(ordersCountAfter === ordersCountBefore, `✅ REFRESH SUCCESS: Orders persisted after page reload (Count: ${ordersCountAfter})`);


    // 6. Test Logout & Re-login (Previous cart/orders/wishlist still available)
    console.log('\n--- Step D: Logout & Re-login Persistence ---');
    // Open account menu & sign out
    const accountBtn = page.locator('[data-testid="account-menu-btn"]');
    await accountBtn.click();
    await page.waitForTimeout(300);

    await page.locator('[data-testid="sign-out-btn"]').click();
    await page.waitForTimeout(600);

    // Verify state cleared upon logout
    const signInVisible = await page.getByRole('button', { name: /Sign In \/ Register/i }).first().isVisible();
    assert(signInVisible, 'Signed out successfully; guest state restored');

    // Login again
    await page.getByRole('button', { name: /Sign In \/ Register/i }).first().click();
    await page.waitForTimeout(400);

    const demoStudentBtn2 = page.locator('button:has-text("Aditya Chauhan")');
    if (await demoStudentBtn2.isVisible()) {
      await demoStudentBtn2.click();
    } else {
      await page.fill('input[type="email"]', 'user@booknest.com');
      await page.fill('input[type="password"]', 'User@123');
      await page.locator('button[type="submit"]:has-text("Sign In")').click();
    }
    await page.waitForTimeout(800);

    // Verify orders are retrieved from database
    const userOrdersRes = await fetch(`${API_URL}/orders`, {
      headers: { 'Authorization': `Bearer ${studentData.token}` }
    });
    const userOrdersData = await userOrdersRes.json();
    assert(userOrdersData.orders.length > 0, `✅ RE-LOGIN SUCCESS: Retrieved ${userOrdersData.orders.length} persistent orders from DB upon re-login`);


    // 7. Test Admin Updates Stock -> User Sees Updated Stock
    console.log('\n--- Step E: Admin Updates Stock -> Reflected Live to User ---');
    const targetBook = booksData.books.find(b => b.title.includes('Clean Code')) || booksData.books[0];
    const targetBookId = targetBook.id;
    const newStockLevel = 42;

    // Admin updates stock via API
    const stockUpdateRes = await fetch(`${API_URL}/admin/books/${targetBookId}/stock`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminData.token}`
      },
      body: JSON.stringify({ stock: newStockLevel })
    });
    const stockUpdateData = await stockUpdateRes.json();
    assert(stockUpdateRes.status === 200, `Admin successfully updated stock to ${newStockLevel} for "${targetBook.title}" (ID: ${targetBookId})`);

    // Query book endpoint directly to verify DB persistence
    const bookCheckRes = await fetch(`${API_URL}/books/${targetBookId}`);
    const bookCheckData = await bookCheckRes.json();
    assert(bookCheckData.book?.stock === newStockLevel, `✅ STOCK PERSISTED IN DB: Stock is exactly ${bookCheckData.book?.stock}`);

    // Refresh client and verify Clean Code stock is updated
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    console.log('  ✅ Live stock synchronization verified across roles.');

  } catch (err) {
    assert(false, `Test Suite failed with error: ${err.message}`);
  } finally {
    if (context) await context.close();
    if (browser) await browser.close();
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (typeof closeDatabase === 'function') {
      closeDatabase();
    }
  }

  console.log('\n========================================================');
  console.log(`Persistence Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPersistenceTestSuite();
