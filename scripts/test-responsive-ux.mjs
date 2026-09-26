import { chromium } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';
const VIEWPORTS = [
  { name: 'Mobile SE', width: 375, height: 667 },
  { name: 'Mobile iPhone 12/13/14', width: 390, height: 844 },
  { name: 'Mobile iPhone Plus/XR', width: 414, height: 896 },
  { name: 'Tablet 768px', width: 768, height: 1024 },
  { name: 'Tablet / Small Laptop 1024px', width: 1024, height: 768 },
  { name: 'Desktop 1440px', width: 1440, height: 900 }
];

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;

function assert(condition, message) {
  totalChecks++;
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passedChecks++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failedChecks++;
  }
}

async function runResponsiveAudit() {
  console.log('📱 ========================================================');
  console.log('📱 BookNest Multi-Viewport & UX Integrity Test Suite');
  console.log('📱 Testing Viewports: 375px, 390px, 414px, 768px, 1024px, 1440px');
  console.log('📱 ========================================================\n');

  const browser = await chromium.launch({ headless: true });

  for (const vp of VIEWPORTS) {
    console.log(`\n--- Testing Viewport: ${vp.name} (${vp.width}x${vp.height}) ---`);
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });

    // Navigate to homepage
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);

    // 1. Check for horizontal overflow on home
    const overflowXHome = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    assert(!overflowXHome, `No horizontal overflow on Home (${vp.width}px)`);

    // 2. Check Navbar presence
    const navbar = await page.$('header');
    assert(navbar !== null, `Navbar is rendered properly (${vp.width}px)`);

    // 3. Test Search interaction with visible input
    const searchInput = page.locator('input[placeholder*="Search by title"]:visible').first();
    const isSearchVisible = await searchInput.isVisible();
    assert(isSearchVisible, `Search input is directly visible and accessible (${vp.width}px)`);

    if (isSearchVisible) {
      await searchInput.fill('clean');
      await page.waitForTimeout(400); // 250ms debounce
      const searchDropdown = await page.$('.shadow-2xl');
      assert(searchDropdown !== null, `Search autocomplete dropdown appears on input (${vp.width}px)`);
      // Clear search
      await searchInput.fill('');
      await page.waitForTimeout(200);
      await page.keyboard.press('Escape');
    }

    // 4. Test Navigation to Catalog View
    if (vp.width < 1024) {
      // On mobile/tablet, open mobile menu toggle if available
      const menuToggle = page.locator('button[data-testid="mobile-menu-toggle"]:visible');
      if (await menuToggle.isVisible()) {
        await menuToggle.click();
        await page.waitForTimeout(200);
      }
    }

    // Click Catalog link
    const catalogBtn = page.locator('button:has-text("Catalog"), button:has-text("Browse All")').first();
    if (await catalogBtn.isVisible()) {
      await catalogBtn.click();
      await page.waitForTimeout(400);
    }

    const overflowXCatalog = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    assert(!overflowXCatalog, `No horizontal overflow on Catalog (${vp.width}px)`);

    // 5. Test Quick View Modal opens and has no horizontal overflow
    const quickViewBtn = page.locator('button[title="Quick View"]:visible').first();
    if (await quickViewBtn.isVisible()) {
      await quickViewBtn.click();
      await page.waitForTimeout(400);
      const modal = await page.$('.fixed.inset-0');
      assert(modal !== null, `Quick View Modal opens cleanly (${vp.width}px)`);

      // Test closing via Escape key
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      const modalAfterEsc = await page.$('h3:has-text("Related Campus Recommendations")');
      assert(modalAfterEsc === null, `Quick View Modal closes cleanly on Escape (${vp.width}px)`);
    }

    // 6. Test Optical Scanner View
    if (vp.width < 1024) {
      const menuToggle = page.locator('button[data-testid="mobile-menu-toggle"]:visible');
      if (await menuToggle.isVisible()) {
        await menuToggle.click();
        await page.waitForTimeout(200);
      }
    }
    const scannerBtn = page.locator('button:has-text("Scan"), button:has-text("Scanner")').first();
    if (await scannerBtn.isVisible()) {
      await scannerBtn.click();
      await page.waitForTimeout(400);
    }

    const overflowXScanner = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    assert(!overflowXScanner, `No horizontal overflow on Optical Scanner (${vp.width}px)`);

    // 7. Test Cart Drawer
    const cartBtn = page.locator('button[title="Shopping Cart"]:visible').first();
    if (await cartBtn.isVisible()) {
      await cartBtn.click();
      await page.waitForTimeout(400);

      const drawer = await page.$('#cart-drawer-heading, h2:has-text("Shopping Bag")');
      assert(drawer !== null, `Cart drawer opens cleanly (${vp.width}px)`);

      // Close cart drawer on Escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }

    await page.close();
  }

  await browser.close();

  console.log('\n========================================================');
  console.log(`📱 Responsive UX Results: ${passedChecks} Passed, ${failedChecks} Failed`);
  console.log('========================================================\n');

  if (failedChecks > 0) {
    process.exit(1);
  }
}

runResponsiveAudit().catch(err => {
  console.error('Audit crashed:', err);
  process.exit(1);
});
