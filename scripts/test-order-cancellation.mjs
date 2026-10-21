import { chromium } from '@playwright/test';
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3000';
const API_URL = `${BASE_URL}/api`;

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failedTests++;
  }
}

async function runCancellationTestSuite() {
  console.log('📦 ========================================================');
  console.log('📦 BookNest Phase 3.3 — Student Order Cancellation Suite');
  console.log('📦 Target: ' + BASE_URL);
  console.log('📦 ========================================================\n');

  try {
    // ------------------------------------------------------------------
    // STEP 1: Setup Authenticated Sessions
    // ------------------------------------------------------------------
    console.log('--- Step 1: Authentication Setup ---');
    // Login Student A
    const loginResA = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@booknest.com', password: 'User@123' })
    });
    const dataA = await loginResA.json();
    assert(loginResA.status === 200 && dataA.token, 'Student A authenticated successfully');
    const tokenA = dataA.token;

    // Login Admin
    const loginResAdmin = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@booknest.com', password: 'Admin@123' })
    });
    const dataAdmin = await loginResAdmin.json();
    assert(loginResAdmin.status === 200 && dataAdmin.token, 'Admin authenticated successfully');
    const tokenAdmin = dataAdmin.token;

    // Register / Login Student B (for multi-tenant isolation testing)
    const uniqueEmailB = `student_b_${Date.now()}@booknest.com`;
    const regResB = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Student B Tester',
        email: uniqueEmailB,
        password: 'Password@123',
        department: 'Computer Science',
        year: 2
      })
    });
    const dataB = await regResB.json();
    assert(regResB.status === 201 && dataB.token, 'Student B registered for cross-account testing');
    const tokenB = dataB.token;

    // ------------------------------------------------------------------
    // STEP 2: Baseline Stock & Order Placement (Book A)
    // ------------------------------------------------------------------
    console.log('\n--- Step 2: Book Stock Baseline & Order Placement ---');
    const booksRes = await fetch(`${API_URL}/books`);
    const booksData = await booksRes.json();
    const bookA = booksData.books[0];
    const initialStockA = bookA.stock;
    const orderQtyA = 2;

    console.log(`  ℹ Selected Book A: "${bookA.title}" (ID: ${bookA.id}, Initial Stock: ${initialStockA})`);

    const orderPayloadA = {
      address: {
        fullName: 'Aditya Chauhan',
        hostelBlock: 'Aryabhatta Hostel',
        roomNo: 'B-304',
        phone: '9876543210',
        deliveryNotes: 'Leave with guard if away'
      },
      paymentMethod: 'UPI',
      items: [{ bookId: bookA.id, quantity: orderQtyA }],
      summary: {}
    };

    const placeResA = await fetch(`${API_URL}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenA}`
      },
      body: JSON.stringify(orderPayloadA)
    });
    const placeDataA = await placeResA.json();
    assert(placeResA.status === 201 && placeDataA.success, 'Order placed successfully by Student A');
    const orderA = placeDataA.order;
    assert(orderA.status === 'Confirmed', 'Order initial status is "Confirmed"');

    // Verify stock decremented
    const bookAfterOrderARes = await fetch(`${API_URL}/books/${bookA.id}`);
    const bookAfterOrderA = (await bookAfterOrderARes.json()).book;
    assert(
      bookAfterOrderA.stock === initialStockA - orderQtyA,
      `Stock decremented correctly after order placement (${initialStockA} -> ${bookAfterOrderA.stock})`
    );

    // ------------------------------------------------------------------
    // STEP 3: Security & Access Control Verifications
    // ------------------------------------------------------------------
    console.log('\n--- Step 3: Access Control & Authorization Safeguards ---');

    // 1. Unauthenticated cancellation attempt must be rejected (401)
    const unauthCancelRes = await fetch(`${API_URL}/orders/${orderA.id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    assert(unauthCancelRes.status === 401, 'Unauthenticated cancellation rejected with 401 Unauthorized');

    // 2. Student B attempting to cancel Student A's order must be rejected (403)
    const crossStudentCancelRes = await fetch(`${API_URL}/orders/${orderA.id}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenB}`
      }
    });
    assert(crossStudentCancelRes.status === 403, 'Cross-user cancellation rejected with 403 Forbidden');
    const crossData = await crossStudentCancelRes.json();
    assert(
      crossData.error?.includes('not authorized'),
      `Rejection message clarifies ownership violation: "${crossData.error}"`
    );

    // 3. Non-existent order cancellation must return 404
    const notFoundCancelRes = await fetch(`${API_URL}/orders/99999999/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenA}`
      }
    });
    assert(notFoundCancelRes.status === 404, 'Non-existent order cancellation returns 404 Not Found');

    // Verify stock remains untouched after unauthorized attempts
    const bookAfterFailedRes = await fetch(`${API_URL}/books/${bookA.id}`);
    const bookAfterFailed = (await bookAfterFailedRes.json()).book;
    assert(
      bookAfterFailed.stock === initialStockA - orderQtyA,
      'Book stock remains unchanged after unauthorized and invalid cancellation attempts'
    );

    // ------------------------------------------------------------------
    // STEP 4: Ineligible Status Enforcement (Book B)
    // ------------------------------------------------------------------
    console.log('\n--- Step 4: Ineligible Order Status Enforcement ---');
    const bookB = booksData.books[1];
    const initialStockB = bookB.stock;

    const orderPayloadB = {
      address: {
        fullName: 'Aditya Chauhan',
        hostelBlock: 'Aryabhatta Hostel',
        roomNo: 'B-304',
        phone: '9876543210'
      },
      paymentMethod: 'COD',
      items: [{ bookId: bookB.id, quantity: 1 }],
      summary: {}
    };

    const placeResB = await fetch(`${API_URL}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenA}`
      },
      body: JSON.stringify(orderPayloadB)
    });
    const orderB = (await placeResB.json()).order;

    // Admin advances to 'Processing'
    const advanceProcRes = await fetch(`${API_URL}/admin/orders/${orderB.id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenAdmin}`
      },
      body: JSON.stringify({ status: 'Processing' })
    });
    assert(advanceProcRes.status === 200, 'Admin advanced test order to "Processing"');

    // Student A tries to cancel 'Processing' order
    const cancelProcessingRes = await fetch(`${API_URL}/orders/${orderB.id}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenA}`
      }
    });
    assert(cancelProcessingRes.status === 400, 'Cancellation of "Processing" order rejected with 400 Bad Request');
    const procData = await cancelProcessingRes.json();
    assert(
      procData.error?.includes('Processing') && procData.error?.includes('Confirmed'),
      `Ineligible status error message clarifies constraint: "${procData.error}"`
    );

    // Admin advances to 'Shipped'
    await fetch(`${API_URL}/admin/orders/${orderB.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenAdmin}` },
      body: JSON.stringify({ status: 'Shipped' })
    });
    const cancelShippedRes = await fetch(`${API_URL}/orders/${orderB.id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenA}` }
    });
    assert(cancelShippedRes.status === 400, 'Cancellation of "Shipped" order rejected with 400 Bad Request');

    // Admin advances to 'Delivered'
    await fetch(`${API_URL}/admin/orders/${orderB.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenAdmin}` },
      body: JSON.stringify({ status: 'Delivered' })
    });
    const cancelDeliveredRes = await fetch(`${API_URL}/orders/${orderB.id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenA}` }
    });
    assert(cancelDeliveredRes.status === 400, 'Cancellation of "Delivered" order rejected with 400 Bad Request');

    // ------------------------------------------------------------------
    // STEP 5: Successful Student Cancellation & Stock Restoration (Order A)
    // ------------------------------------------------------------------
    console.log('\n--- Step 5: Successful Student Cancellation & Stock Restoration ---');
    const cancelResA = await fetch(`${API_URL}/orders/${orderA.id}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenA}`
      }
    });
    const cancelDataA = await cancelResA.json();
    assert(cancelResA.status === 200 && cancelDataA.success, 'Student successfully cancelled eligible Confirmed order');
    assert(cancelDataA.status === 'Cancelled', 'Cancellation response confirms status is "Cancelled"');

    // Verify stock is restored to initial baseline
    const bookAfterCancelARes = await fetch(`${API_URL}/books/${bookA.id}`);
    const bookAfterCancelA = (await bookAfterCancelARes.json()).book;
    assert(
      bookAfterCancelA.stock === initialStockA,
      `Inventory restored exactly once to original quantity: ${bookAfterCancelA.stock} === ${initialStockA}`
    );

    // ------------------------------------------------------------------
    // STEP 6: Repeated Cancellation Prevention (Single Stock Restoration)
    // ------------------------------------------------------------------
    console.log('\n--- Step 6: Idempotent Single Stock Restoration ---');
    const repeatCancelRes = await fetch(`${API_URL}/orders/${orderA.id}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenA}`
      }
    });
    assert(repeatCancelRes.status === 400, 'Repeated cancellation rejected with 400 Bad Request');
    const repeatData = await repeatCancelRes.json();
    assert(
      repeatData.error?.includes('already cancelled'),
      `Error indicates order is already cancelled: "${repeatData.error}"`
    );

    // Verify stock was NOT restored a second time
    const bookAfterRepeatRes = await fetch(`${API_URL}/books/${bookA.id}`);
    const bookAfterRepeat = (await bookAfterRepeatRes.json()).book;
    assert(
      bookAfterRepeat.stock === initialStockA,
      `Repeated cancellation does NOT inflate stock (Stock remains ${bookAfterRepeat.stock})`
    );

    // ------------------------------------------------------------------
    // STEP 7: Concurrency & Race Condition Safety (Book C)
    // ------------------------------------------------------------------
    console.log('\n--- Step 7: Race Condition / Concurrent Cancellation Safety ---');
    const bookC = booksData.books[2];
    const initialStockC = bookC.stock;

    const placeRaceOrderRes = await fetch(`${API_URL}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenA}` },
      body: JSON.stringify({
        address: orderPayloadA.address,
        paymentMethod: 'UPI',
        items: [{ bookId: bookC.id, quantity: 2 }],
        summary: {}
      })
    });
    const raceOrder = (await placeRaceOrderRes.json()).order;

    // Send 3 simultaneous cancellation requests
    const raceResults = await Promise.all([
      fetch(`${API_URL}/orders/${raceOrder.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenA}` }
      }),
      fetch(`${API_URL}/orders/${raceOrder.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenA}` }
      }),
      fetch(`${API_URL}/orders/${raceOrder.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenA}` }
      })
    ]);

    const raceStatuses = raceResults.map(r => r.status);
    const successCount = raceStatuses.filter(s => s === 200).length;
    const rejectedCount = raceStatuses.filter(s => s === 400).length;

    assert(successCount === 1, `Exactly 1 concurrent request succeeded (200 OK: ${successCount})`);
    assert(rejectedCount === 2, `Other concurrent requests safely rejected (400 Bad Request: ${rejectedCount})`);

    // Verify stock restored exactly once despite 3 concurrent calls
    const bookAfterRaceRes = await fetch(`${API_URL}/books/${bookC.id}`);
    const bookAfterRace = (await bookAfterRaceRes.json()).book;
    assert(
      bookAfterRace.stock === initialStockC,
      `Concurrent race condition safely preserved stock without double-restoration (${bookAfterRace.stock} === ${initialStockC})`
    );

    // ------------------------------------------------------------------
    // STEP 8: Order Record & Invoice Preservation
    // ------------------------------------------------------------------
    console.log('\n--- Step 8: Order Record & Invoice Preservation ---');
    const orderDetailsRes = await fetch(`${API_URL}/orders/${orderA.id}`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    const orderDetails = (await orderDetailsRes.json()).order;
    assert(orderDetails !== null, 'Order record exists in database after cancellation');
    assert(orderDetails.status === 'Cancelled', 'Order status field reflects "Cancelled"');
    assert(orderDetails.items.length > 0, 'Line items are fully preserved in cancelled order');
    assert(orderDetails.grandTotal === orderA.total, 'Invoice financial totals remain completely intact');
    assert(orderDetails.address.roomNo === 'B-304', 'Delivery address details preserved');

    // ------------------------------------------------------------------
    // STEP 9: Full Browser UI End-to-End Verification
    // ------------------------------------------------------------------
    console.log('\n--- Step 9: Browser UI Cancellation & Confirmation Flow ---');

    // Place an active Confirmed order specifically for the UI test
    const placeUiOrderRes = await fetch(`${API_URL}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenA}` },
      body: JSON.stringify({
        address: orderPayloadA.address,
        paymentMethod: 'UPI',
        items: [{ bookId: bookA.id, quantity: 1 }],
        summary: {}
      })
    });
    const uiOrder = (await placeUiOrderRes.json()).order;
    console.log(`  ℹ Placed UI test order #${uiOrder.id} (${uiOrder.orderNumber})`);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    // Open storefront
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);

    // Sign in as Student using header button
    const signInBtn = page.locator('header button:has-text("Sign In / Register")');
    if (await signInBtn.isVisible()) {
      await signInBtn.click();
      await page.waitForTimeout(400);

      const demoStudentBtn = page.locator('button:has-text("Aditya Chauhan")');
      if (await demoStudentBtn.isVisible()) {
        await demoStudentBtn.click();
      } else {
        await page.fill('input[type="email"]', 'user@booknest.com');
        await page.fill('input[type="password"]', 'User@123');
        await page.locator('button[type="submit"]:has-text("Sign In")').click();
      }
      await page.waitForTimeout(800);
    }

    // Direct navigate to Orders view via hash
    await page.goto(`${BASE_URL}/#orders`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    const ordersH1 = page.locator('h1:has-text("My Orders")');
    assert(await ordersH1.isVisible(), 'Navigated to My Orders page');

    // Find the Cancel Order action button on the Confirmed order card
    const cancelBtn = page.locator('[data-testid="cancel-order-btn"]').first();
    const isCancelBtnVisible = await cancelBtn.isVisible();
    assert(isCancelBtnVisible, '"Cancel Order" action button is visible on Confirmed campus order');

    if (isCancelBtnVisible) {
      // Click Cancel Order
      await cancelBtn.click();
      await page.waitForTimeout(400);

      // Verify Confirmation Modal
      const modal = page.locator('div[role="dialog"]');
      assert(await modal.isVisible(), 'Cancellation confirmation dialog is displayed');
      assert(await page.locator('text=Cancel Campus Order?').isVisible(), 'Modal title clearly asks for confirmation');
      assert(await page.locator('text=Items to be Restored to Stock').isVisible(), 'Modal displays items list to be restored');

      // Test "Keep Order" button dismissal
      const keepOrderBtn = page.locator('button:has-text("Keep Order")');
      await keepOrderBtn.click();
      await page.waitForTimeout(300);
      assert(!(await modal.isVisible()), '"Keep Order" button closes modal without modifying order');

      // Re-open and Confirm Cancellation
      await cancelBtn.click();
      await page.waitForTimeout(300);

      const confirmBtn = page.locator('[data-testid="confirm-cancel-btn"]');
      await confirmBtn.click();
      await page.waitForTimeout(1000);

      // Verify modal dismissed and status updated to "Order Cancelled"
      const statusBadge = page.locator('[data-testid="order-status-badge"]').first();
      const statusText = await statusBadge.textContent();
      assert(statusText.includes('Cancelled'), `Order status updated in UI to "${statusText}"`);
    }

    await browser.close();

    console.log('\n========================================================');
    console.log(`📦 Order Cancellation Suite: ${passedTests} Passed, ${failedTests} Failed`);
    console.log('========================================================\n');

    if (failedTests > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Test suite crashed with error:', err);
    process.exit(1);
  }
}

runCancellationTestSuite();
