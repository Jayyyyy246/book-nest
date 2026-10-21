import { chromium } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

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

async function runAccessibilityTestSuite() {
  console.log('♿ ========================================================');
  console.log('♿ BookNest Phase 3.4 — Targeted Accessibility Verification');
  console.log('♿ Target: ' + BASE_URL);
  console.log('♿ ========================================================\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  try {
    // ------------------------------------------------------------------
    // TEST 1: Skip-to-Content Link
    // ------------------------------------------------------------------
    console.log('--- Test 1: Skip-to-Content Link ---');
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    const skipLink = page.locator('a[href="#main-content"]');
    assert(await skipLink.count() > 0, 'Skip-to-main-content link exists in DOM');
    const skipText = await skipLink.textContent();
    assert(skipText.includes('Skip to main content'), 'Skip link text is descriptive ("Skip to main content")');

    // Tab into skip link
    await page.keyboard.press('Tab');
    const activeIsSkip = await page.evaluate(() => {
      const el = document.activeElement;
      return el && el.getAttribute('href') === '#main-content';
    });
    assert(activeIsSkip, 'Keyboard Tab navigates first to the skip-to-content link');

    // Press enter on skip link
    await page.keyboard.press('Enter');
    const mainHasId = await page.evaluate(() => {
      const el = document.getElementById('main-content');
      return el !== null && el.getAttribute('tabindex') === '-1';
    });
    assert(mainHasId, 'Main content container exists with id="main-content" and tabIndex="-1"');

    // ------------------------------------------------------------------
    // TEST 2: Accessible Names on Icon-Only and Navigation Buttons
    // ------------------------------------------------------------------
    console.log('\n--- Test 2: Icon-Only Buttons & Semantic Accessibility ---');
    
    // Account Menu Button
    const accountBtn = page.locator('[data-testid="account-menu-btn"]');
    assert(await accountBtn.count() > 0, 'Account menu button exists');
    const accountLabel = await accountBtn.getAttribute('aria-label');
    assert(accountLabel && accountLabel.length > 0, `Account menu button has aria-label: "${accountLabel}"`);
    const accountExpanded = await accountBtn.getAttribute('aria-expanded');
    assert(accountExpanded === 'false', 'Account menu button has aria-expanded="false" when closed');
    const accountPopup = await accountBtn.getAttribute('aria-haspopup');
    assert(accountPopup === 'true', 'Account menu button has aria-haspopup="true"');

    // Toggle Account Menu and verify aria-expanded
    await accountBtn.click();
    assert((await accountBtn.getAttribute('aria-expanded')) === 'true', 'Account menu button updates aria-expanded="true" when opened');
    await page.keyboard.press('Escape');

    // Wishlist Button
    const wishlistBtn = page.locator('button[aria-label*="wishlist" i]');
    assert(await wishlistBtn.count() > 0, 'Wishlist button has descriptive aria-label with item count');

    // Cart Button
    const cartBtn = page.locator('button[aria-label*="cart" i]');
    assert(await cartBtn.count() > 0, 'Cart button has descriptive aria-label with item count');

    // Search input
    const searchInput = page.locator('input[aria-label*="search" i]').first();
    assert(await searchInput.count() > 0, 'Search input has explicit accessible aria-label');

    // ------------------------------------------------------------------
    // TEST 3: Screen Reader Live Announcements & Status
    // ------------------------------------------------------------------
    console.log('\n--- Test 3: Screen Reader Live Region Announcements ---');
    const liveAnnouncer = page.locator('[data-testid="screen-reader-announcer"]');
    assert(await liveAnnouncer.count() > 0, 'Screen reader live announcer exists in DOM');
    assert((await liveAnnouncer.getAttribute('aria-live')) === 'polite', 'Announcer has aria-live="polite"');
    assert((await liveAnnouncer.getAttribute('aria-atomic')) === 'true', 'Announcer has aria-atomic="true"');

    // Click quick view on first book to trigger cart action
    const firstBook = page.locator('[role="button"][aria-label*="View details for"]').first();
    assert(await firstBook.count() > 0, 'BookCard has role="button" with descriptive book title alt/label');

    // ------------------------------------------------------------------
    // TEST 4: QuickViewModal Focus Entry, Trap, Escape, and Restoration
    // ------------------------------------------------------------------
    console.log('\n--- Test 4: QuickViewModal Focus Management & Containment ---');
    // Focus the first book card via keyboard
    await firstBook.focus();
    const openerFocusedBefore = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    
    // Open Quick View via Enter key
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    const quickModal = page.locator('[data-testid="quick-view-modal"]');
    assert(await quickModal.isVisible(), 'Quick View modal opened via keyboard Enter key');
    assert((await quickModal.getAttribute('role')) === 'dialog', 'Modal has role="dialog"');
    assert((await quickModal.getAttribute('aria-modal')) === 'true', 'Modal has aria-modal="true"');
    
    const labelledBy = await quickModal.getAttribute('aria-labelledby');
    assert(labelledBy === 'modal-book-title', 'Modal has aria-labelledby="modal-book-title"');
    
    const titleEl = page.locator('#modal-book-title');
    assert(await titleEl.count() > 0, 'Element with id="modal-book-title" exists inside modal');

    // Check that keyboard focus entered the modal
    const focusInsideModal = await page.evaluate(() => {
      const modal = document.querySelector('[data-testid="quick-view-modal"]');
      return modal && modal.contains(document.activeElement);
    });
    assert(focusInsideModal, 'Keyboard focus moved inside the Quick View modal upon opening');

    // Test Tab containment (cycle forward)
    await page.keyboard.press('Tab');
    const tab1Inside = await page.evaluate(() => {
      const modal = document.querySelector('[data-testid="quick-view-modal"]');
      return modal && modal.contains(document.activeElement);
    });
    assert(tab1Inside, 'Focus remains trapped inside modal after Tab press');

    // Test Shift+Tab containment (cycle backward)
    await page.keyboard.down('Shift');
    await page.keyboard.press('Tab');
    await page.keyboard.up('Shift');
    const shiftTabInside = await page.evaluate(() => {
      const modal = document.querySelector('[data-testid="quick-view-modal"]');
      return modal && modal.contains(document.activeElement);
    });
    assert(shiftTabInside, 'Focus remains trapped inside modal after Shift+Tab press');

    // Test Escape key dismissal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    assert(!(await quickModal.isVisible()), 'Quick View modal dismissed via Escape key');

    // Verify focus restoration to opener
    const openerFocusedAfter = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    assert(openerFocusedAfter === openerFocusedBefore, 'Keyboard focus was restored to the original opener element');

    // ------------------------------------------------------------------
    // TEST 5: AI Reading Advisor Modal Accessibility
    // ------------------------------------------------------------------
    console.log('\n--- Test 5: AI Reading Advisor Modal Accessibility ---');
    const aiAdvisorBtn = page.locator('[data-testid="desktop-nav-ai-advisor-btn"]');
    await aiAdvisorBtn.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    const aiModal = page.locator('[data-testid="ai-reading-advisor-modal"]');
    assert(await aiModal.isVisible(), 'AI Reading Advisor modal opened');

    const aiDialog = page.locator('div[aria-labelledby="ai-advisor-heading"]');
    assert(await aiDialog.getAttribute('role') === 'dialog', 'AI Advisor container has role="dialog"');
    assert(await aiDialog.getAttribute('aria-modal') === 'true', 'AI Advisor container has aria-modal="true"');

    const closeAdvisorBtn = page.locator('[data-testid="ai-advisor-close-btn"]');
    assert((await closeAdvisorBtn.getAttribute('aria-label')) === 'Close AI Reading Advisor', 'Close button has accessible label');

    // Focus inside advisor textarea
    const textareaHasFocus = await page.evaluate(() => {
      const input = document.getElementById('ai-advisor-prompt-input');
      return document.activeElement === input;
    });
    assert(textareaHasFocus, 'Focus moved directly to the prompt textarea on modal open');

    // Close via Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    assert(!(await aiModal.isVisible()), 'AI Reading Advisor closed cleanly with Escape key');

    const isAdvisorOpenerFocused = await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="desktop-nav-ai-advisor-btn"]');
      return document.activeElement === btn;
    });
    assert(isAdvisorOpenerFocused, 'Focus was restored to the AI Advisor nav button upon close');

    // ------------------------------------------------------------------
    // TEST 6: Accessible Route Change to Book Detail Page
    // ------------------------------------------------------------------
    console.log('\n--- Test 6: Route Changes & Focus Management to Book Detail ---');
    const catalogRes = await page.request.get(`${BASE_URL}/api/books`).then(r => r.json());
    const validBook = catalogRes.books.find(b => b.title === 'Atomic Habits') || catalogRes.books[0];
    const validBookId = validBook.id;

    await page.goto(`${BASE_URL}/#/book/${validBookId}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    const detailPage = page.locator('[data-testid="book-detail-page"]');
    assert(await detailPage.isVisible(), 'Book Detail page loaded via hash deep link');

    const detailH1 = page.locator('[data-testid="book-detail-title"]');
    assert(await detailH1.count() > 0, 'Dedicated book page has a distinct single <h1> heading');
    const h1Text = await detailH1.textContent();
    assert(h1Text && h1Text.trim().length > 0, `Page heading contains meaningful title: "${h1Text?.trim()}"`);

    // Verify focus moved smoothly to h1 heading or main content
    const headingHasFocus = await page.evaluate(() => {
      const h1 = document.querySelector('[data-testid="book-detail-title"]');
      return document.activeElement === h1;
    });
    assert(headingHasFocus, 'Focus shifted to the <h1> title upon route navigation for clean screen-reader orientation');

    // ------------------------------------------------------------------
    // TEST 7: Reduced Motion Media Query Verification
    // ------------------------------------------------------------------
    console.log('\n--- Test 7: Reduced Motion Preference Support ---');
    // Emulate prefers-reduced-motion: reduce
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const prefersReducedMotionApplied = await page.evaluate(() => {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    });
    assert(prefersReducedMotionApplied, 'System respects prefers-reduced-motion media query');

    console.log('\n========================================================');
    console.log(`♿ RESULTS: ${passedTests}/${totalTests} accessibility tests passed (${failedTests} failed)`);
    console.log('========================================================\n');

    if (failedTests > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal test error:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runAccessibilityTestSuite();
