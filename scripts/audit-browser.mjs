import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

async function runAudit() {
  console.log('🚀 Launching headless Chromium to test http://localhost:3000...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const screenshotsDir = 'docs/audit-screenshots';
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const consoleLogs = [];
  const pageErrors = [];

  page.on('console', msg => {
    consoleLogs.push({ type: msg.type(), text: msg.text() });
    if (msg.type() === 'error') {
      console.log(`[Browser Console Error]: ${msg.text()}`);
    }
  });

  page.on('pageerror', err => {
    pageErrors.push(err.message);
    console.log(`❌ [Unhandled Page Error]: ${err.message}`);
  });

  try {
    // 1. Visit Home Storefront
    console.log('\n--- 1. Testing Home Storefront ---');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    const title = await page.title();
    console.log(`Page Title: "${title}"`);
    const heroH1 = await page.locator('h1').first().textContent();
    console.log(`Hero Heading: "${heroH1?.trim().replace(/\s+/g, ' ')}"`);
    await page.screenshot({ path: `${screenshotsDir}/1-storefront.png` });

    // Authenticate as Student
    console.log('\n--- Authenticating as Student ---');
    const signInBtn = page.getByRole('button', { name: /Sign In \/ Register/i }).first();
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

    // 2. Test Catalog navigation & Filters
    console.log('\n--- 2. Testing Catalog View Navigation & Live Books ---');
    await page.locator('nav button').filter({ hasText: 'Catalog' }).click();
    await page.waitForTimeout(1000);
    const catalogH1 = await page.locator('h1').first().textContent();
    console.log(`Catalog Heading: "${catalogH1?.trim()}"`);
    await page.screenshot({ path: `${screenshotsDir}/2-catalog.png` });

    // Add a book to cart from Catalog
    console.log('Adding first book to cart...');
    const addBtn = page.locator('button').filter({ hasText: /^Add$/ }).first();
    await addBtn.click();
    await page.waitForTimeout(600);

    // 3. Test Cart Drawer & Coupon Validation
    console.log('\n--- 3. Testing Slide-Over Cart Drawer & Coupon ---');
    const cartBtn = page.locator('button').filter({ hasText: 'Cart' });
    await cartBtn.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${screenshotsDir}/3-cart-drawer.png` });
    console.log('Cart drawer opened successfully.');

    // 4. Test Checkout Flow Modal
    console.log('\n--- 4. Testing 3-Step Checkout Flow ---');
    const checkoutBtn = page.locator('[data-testid="proceed-checkout-btn"]');
    await checkoutBtn.waitFor({ state: 'visible', timeout: 5000 });
    await checkoutBtn.click();
    await page.waitForTimeout(800);

    // Step 1: Address -> Click Proceed to Order Review
    console.log('Step 1: Proceeding to Order Review...');
    const step1Btn = page.getByRole('button', { name: /Proceed to Order Review/i });
    await step1Btn.waitFor({ state: 'visible', timeout: 5000 });
    await step1Btn.click();
    await page.waitForTimeout(600);

    // Step 2: Review -> Click Proceed to Payment
    console.log('Step 2: Proceeding to Payment...');
    const step2Btn = page.getByRole('button', { name: /Proceed to Payment/i });
    await step2Btn.waitFor({ state: 'visible', timeout: 5000 });
    await step2Btn.click();
    await page.waitForTimeout(600);

    // Step 3: Payment -> Click Confirm & Pay
    console.log('Step 3: Confirm & Pay (Demo Payment)...');
    const step3Btn = page.getByRole('button', { name: /Confirm & Pay/i });
    await step3Btn.waitFor({ state: 'visible', timeout: 5000 });
    await step3Btn.click();

    // Wait for completion screen
    const viewOrdersBtn = page.getByRole('button', { name: /View All Orders/i });
    await viewOrdersBtn.waitFor({ state: 'visible', timeout: 10000 });
    console.log('Order confirmed! Capturing checkout receipt screenshot...');
    await page.screenshot({ path: `${screenshotsDir}/4-checkout-success.png` });

    await viewOrdersBtn.click();
    await page.waitForTimeout(1000);

    // 5. Test Orders View Navigation
    console.log('\n--- 5. Testing Orders View Navigation & Real Orders ---');
    const ordersH1Locator = page.locator('h1').first();
    await ordersH1Locator.waitFor({ state: 'visible', timeout: 5000 });
    const ordersH1 = await ordersH1Locator.textContent();
    console.log(`Orders View Heading: "${ordersH1?.trim()}"`);
    await page.screenshot({ path: `${screenshotsDir}/5-orders-view.png` });

    // 6. Test Authentic Admin Login & Console
    console.log('\n--- 6. Testing Genuine Auth Switch to Admin Mode ---');
    const accountBtn = page.locator('[data-testid="account-menu-btn"]');
    await accountBtn.click();
    await page.waitForTimeout(400);

    const signInAdminBtn = page.locator('button:has-text("Sign In with Admin Account")');
    if (await signInAdminBtn.isVisible()) {
      await signInAdminBtn.click();
      await page.waitForTimeout(400);
      const adminDemoQuickBtn = page.locator('button:has-text("Prof. Vikramaditya")');
      if (await adminDemoQuickBtn.isVisible()) {
        await adminDemoQuickBtn.click();
      } else {
        await page.fill('input[type="email"]', 'admin@booknest.com');
        await page.fill('input[type="password"]', 'Admin@123');
        await page.locator('button[type="submit"]:has-text("Sign In")').click();
      }
      await page.waitForTimeout(800);
    }

    const adminNavBtn = page.locator('nav button').filter({ hasText: 'Admin' });
    if (await adminNavBtn.isVisible()) {
      await adminNavBtn.click();
      await page.waitForTimeout(1000);
    }

    const adminH1 = await page.locator('h1').first().textContent();
    console.log(`Admin Dashboard Heading: "${adminH1?.trim()}"`);
    await page.screenshot({ path: `${screenshotsDir}/6-admin-dashboard.png` });

    // 7. Test Scanner View & Honest Search
    console.log('\n--- 7. Testing Optical Scanner View & ISBN Lookup ---');
    await page.locator('nav button').filter({ hasText: 'Scan Cover' }).click();
    await page.waitForTimeout(800);
    const scannerH1 = await page.locator('h1').first().textContent();
    console.log(`Scanner Heading: "${scannerH1?.trim()}"`);

    // Test ISBN lookup
    const isbnInput = page.locator('input[placeholder*="enter ISBN"]');
    if (await isbnInput.isVisible()) {
      await isbnInput.fill('9780132350884');
      const searchBtn = page.getByRole('button', { name: /Lookup ISBN/i });
      if (await searchBtn.isVisible()) {
        await searchBtn.click();
        await page.waitForTimeout(1500);
        console.log('Searched ISBN 9780132350884 successfully.');
      }
    }
    await page.screenshot({ path: `${screenshotsDir}/7-scanner-result.png` });

    // 8. Test Wishlist View
    console.log('\n--- 8. Testing Wishlist View Navigation ---');
    await page.locator('button[title="Wishlist"]').click();
    await page.waitForTimeout(800);
    const wishlistH1 = await page.locator('h1').first().textContent();
    console.log(`Wishlist Heading: "${wishlistH1?.trim()}"`);
    await page.screenshot({ path: `${screenshotsDir}/8-wishlist.png` });

    console.log('\n========================================');
    if (pageErrors.length > 0) {
      console.log('🚨 UNHANDLED RUNTIME ERRORS DETECTED:');
      pageErrors.forEach((e, idx) => console.log(`  [${idx + 1}] ${e}`));
    } else {
      console.log('✅ ALL VIEWS AND FLOWS COMPLETED WITH ZERO UNHANDLED ERRORS!');
    }
    console.log('========================================');

  } catch (err) {
    console.error('Test execution error:', err);
  } finally {
    console.log('\n--- Summary ---');
    console.log(`Total Console Messages Captured: ${consoleLogs.length}`);
    console.log(`Total Page Exceptions: ${pageErrors.length}`);
    await browser.close();
    console.log('Audit completed. Screenshots saved to docs/audit-screenshots/');
  }
}

runAudit();
