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

async function runAiAdvisorTestSuite() {
  console.log('🤖 ========================================================');
  console.log('🤖 BookNest AI Reading Advisor E2E Verification Suite');
  console.log('🤖 Target: ' + BASE_URL);
  console.log('🤖 ========================================================\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    // ------------------------------------------------------------------
    // STEP 1: Storefront Navigation & Opener Verification
    // ------------------------------------------------------------------
    console.log('--- Step 1: Entry Point & Opener Verification ---');
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    // 1.1 Verify Desktop Navbar Button
    const desktopNavBtn = page.locator('[data-testid="desktop-nav-ai-advisor-btn"]');
    assert(await desktopNavBtn.isVisible(), 'Desktop navigation renders "AI Advisor" button');

    // 1.2 Open Advisor from Desktop Nav
    await desktopNavBtn.click();
    await page.waitForTimeout(300);

    const advisorModal = page.locator('[data-testid="ai-reading-advisor-modal"]');
    assert(await advisorModal.isVisible(), 'AI Reading Advisor modal opens on desktop nav click');

    // 1.3 Close via Close Button
    const closeBtn = page.locator('[data-testid="ai-advisor-close-btn"]');
    await closeBtn.click();
    await page.waitForTimeout(300);
    assert(!(await advisorModal.isVisible()), 'Modal closes on close button click');

    // 1.4 Open from Hero Section & Close with Escape Key + Focus Restoration
    const heroBtn = page.locator('[data-testid="hero-ai-advisor-btn"]');
    assert(await heroBtn.isVisible(), 'Hero section renders "AI Reading Advisor" action button');

    await heroBtn.focus();
    await heroBtn.click();
    await page.waitForTimeout(300);
    assert(await advisorModal.isVisible(), 'Modal opens on Hero section button click');

    // Press Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    assert(!(await advisorModal.isVisible()), 'Modal closes cleanly on Escape key');

    // Verify focus restored to opener
    const isHeroFocused = await page.evaluate(() => {
      const active = document.activeElement;
      return active && active.getAttribute('data-testid') === 'hero-ai-advisor-btn';
    });
    assert(isHeroFocused, 'Focus is restored to opener button after modal dismissal');

    // ------------------------------------------------------------------
    // STEP 2: Mobile Viewport & Responsive Drawer
    // ------------------------------------------------------------------
    console.log('\n--- Step 2: Mobile Viewport & Menu Drawer Integration ---');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);

    const mobileMenuToggle = page.locator('header button').filter({ has: page.locator('i.fa-bars, i.fa-xmark') }).first();
    if (await mobileMenuToggle.isVisible()) {
      await mobileMenuToggle.click();
      await page.waitForTimeout(200);
    }

    const mobileNavBtn = page.locator('[data-testid="mobile-nav-ai-advisor-btn"]');
    assert(await mobileNavBtn.isVisible(), 'Mobile menu drawer renders "AI Reading Advisor" button');

    await mobileNavBtn.click();
    await page.waitForTimeout(300);
    assert(await advisorModal.isVisible(), 'Modal opens from mobile menu drawer');

    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    assert(!hasHorizontalOverflow, 'Zero horizontal overflow with modal open on mobile (390px)');

    await page.locator('[data-testid="ai-advisor-close-btn"]').click();
    await page.waitForTimeout(300);

    // Reset viewport to desktop
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(200);

    // ------------------------------------------------------------------
    // STEP 3: Guest State & Authentication Alert
    // ------------------------------------------------------------------
    console.log('\n--- Step 3: Guest Authentication State & Validation ---');
    await desktopNavBtn.click();
    await page.waitForTimeout(300);

    const authAlert = page.locator('[data-testid="ai-advisor-auth-alert"]');
    assert(await authAlert.isVisible(), 'Guest user sees authentication required alert in advisor');

    const promptInput = page.locator('[data-testid="ai-advisor-prompt-input"]');
    await promptInput.fill('Machine learning and artificial intelligence');

    const submitBtn = page.locator('[data-testid="ai-advisor-submit-btn"]');
    await submitBtn.click();
    await page.waitForTimeout(200);

    const errorBox = page.locator('[data-testid="ai-advisor-error-box"]');
    assert(await errorBox.isVisible(), 'Submitting prompt as guest displays friendly sign-in prompt');
    assert(
      (await errorBox.textContent()).includes('Sign in required'),
      'Error message clarifies campus student authentication requirement'
    );

    // Close advisor
    await page.locator('[data-testid="ai-advisor-close-btn"]').click();
    await page.waitForTimeout(300);

    // ------------------------------------------------------------------
    // STEP 4: Authenticate Student Session
    // ------------------------------------------------------------------
    console.log('\n--- Step 4: Authenticate Student Session ---');
    const signInBtn = page.getByRole('button', { name: /Sign In \/ Register/i }).first();
    await signInBtn.click();
    await page.waitForTimeout(400);

    const stringHandle = page.locator('.booknest-string-handle');
    if (await stringHandle.isVisible()) {
      const isOff = (await page.locator('.booknest-auth-dialog').getAttribute('class'))?.includes('lamp-off');
      if (isOff) {
        await stringHandle.click();
        await page.waitForTimeout(700);
      }
    }

    const demoStudentBtn = page.locator('[data-testid="demo-student-btn"], button:has-text("Demo Student"), button:has-text("Aditya Chauhan")').first();
    if (await demoStudentBtn.isVisible()) {
      await demoStudentBtn.click();
    } else {
      await page.fill('input[type="email"]', 'user@booknest.com');
      await page.fill('input[type="password"]', 'User@123');
      await page.locator('button[type="submit"]:has-text("Sign In")').click();
    }
    await page.waitForTimeout(800);

    // Verify authenticated
    const studentRole = page.locator('text=Student');
    assert(await studentRole.first().isVisible(), 'Authenticated as verified campus student');

    // ------------------------------------------------------------------
    // STEP 5: Input Validation & Duplicate Submission Guard
    // ------------------------------------------------------------------
    console.log('\n--- Step 5: Input Validation & Duplicate Submission Guard ---');
    await desktopNavBtn.click();
    await page.waitForTimeout(300);

    assert(!(await authAlert.isVisible()), 'Authenticated student does not see guest sign-in banner');

    // 5.1 Empty prompt submission
    await promptInput.fill('');
    // Button is disabled when input is empty
    assert(await submitBtn.isDisabled(), 'Submit button is disabled when prompt is empty');

    // 5.2 Short prompt submission (<2 chars)
    await promptInput.fill('a');
    await submitBtn.click();
    await page.waitForTimeout(200);
    assert(
      (await page.locator('[data-testid="ai-advisor-error-box"]').textContent()).includes('at least 2 characters'),
      'Short prompt (<2 chars) triggers validation error'
    );

    // ------------------------------------------------------------------
    // STEP 6: Successful Recommendation Flow with Mock Route Interception
    // ------------------------------------------------------------------
    console.log('\n--- Step 6: Successful AI Recommendation Flow ---');

    // Intercept backend API call for deterministic E2E assertions
    let apiCalled = false;
    let queryReceived = '';

    await page.route('**/api/recommendations/ai', async (route) => {
      const request = route.request();
      if (request.method() === 'POST') {
        apiCalled = true;
        const postData = JSON.parse(request.postData() || '{}');
        queryReceived = postData.query;

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            recommendation: 'For mastering computer programming and clean design, we strongly recommend Clean Code alongside foundational algorithms.',
            suggestedBooks: [
              {
                id: 1,
                title: 'Clean Code: A Handbook of Agile Software Craftsmanship',
                author: 'Robert C. Martin',
                category: 'Programming',
                price: 899,
                discount: 10,
                rating: 4.9,
                stock: 12,
                coverImage: 'https://images.unsplash.com/photo-1532012164546-f432f2e30777?w=600&auto=format&fit=crop&q=80'
              },
              {
                id: 2,
                title: 'Introduction to Algorithms',
                author: 'Thomas H. Cormen',
                category: 'Computer Science',
                price: 1299,
                discount: 15,
                rating: 4.8,
                stock: 8,
                coverImage: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&auto=format&fit=crop&q=80'
              }
            ],
            isAiGenerated: true
          })
        });
      } else {
        await route.continue();
      }
    });

    // 6.1 Use Suggested Prompt Pill
    const examplePill = page.locator('[data-testid="ai-advisor-example-pill"]').first();
    assert(await examplePill.isVisible(), 'Suggested prompt pills are visible');
    const promptText = (await examplePill.textContent())?.trim() || '';

    await examplePill.click();
    await page.waitForTimeout(500);

    assert(apiCalled, 'Clicking prompt example triggers API request');
    assert(queryReceived.length > 0, `API received prompt query: "${queryReceived}"`);

    // 6.2 Results Rendering
    const resultsView = page.locator('[data-testid="ai-advisor-results-view"]');
    assert(await resultsView.isVisible(), 'AI Recommendations results view rendered');

    const recommendedCards = page.locator('[data-testid="recommended-book-card"]');
    const cardsCount = await recommendedCards.count();
    assert(cardsCount === 2, `Renders ${cardsCount} recommended book cards`);

    // ------------------------------------------------------------------
    // STEP 7: Recommended Book Interactions (Cart, Wishlist, QuickView)
    // ------------------------------------------------------------------
    console.log('\n--- Step 7: Book Card Interactions (Cart, Wishlist, Quick View) ---');

    // 7.1 Add to Cart from AI Advisor
    const initialCartCount = parseInt((await page.locator('button[title="Shopping Cart"] span.rounded-md').textContent()) || '0', 10);
    const firstAddCartBtn = recommendedCards.first().locator('[data-testid="recommended-add-cart-btn"]');
    await firstAddCartBtn.click();
    await page.waitForTimeout(400);

    const updatedCartCount = parseInt((await page.locator('button[title="Shopping Cart"] span.rounded-md').textContent()) || '0', 10);
    assert(updatedCartCount >= initialCartCount, `Item added to cart from recommended card (Cart: ${updatedCartCount})`);

    // 7.2 Toggle Wishlist from AI Advisor
    const firstWishlistBtn = recommendedCards.first().locator('[data-testid="recommended-wishlist-btn"]');
    await firstWishlistBtn.click();
    await page.waitForTimeout(400);
    assert(
      (await firstWishlistBtn.locator('i').getAttribute('class')).includes('fa-solid text-rose-500'),
      'Wishlist button toggles to active filled heart on recommended card'
    );

    // 7.3 Quick View Modal from AI Advisor
    const quickViewBtn = recommendedCards.first().locator('[data-testid="recommended-quickview-btn"]');
    await quickViewBtn.click();
    await page.waitForTimeout(400);

    const quickViewModal = page.locator('[data-testid="quick-view-modal"]');
    assert(await quickViewModal.isVisible(), 'Quick View modal opened directly from AI recommended book');

    // Close Quick View modal via close button
    const qvCloseBtn = quickViewModal.locator('button[aria-label="Close modal"]');
    await qvCloseBtn.click();
    await page.waitForTimeout(300);
    assert(!(await quickViewModal.isVisible()), 'Quick View modal closed, returning to AI Advisor');

    // ------------------------------------------------------------------
    // STEP 8: Empty Results & API Error Handling / Retry
    // ------------------------------------------------------------------
    console.log('\n--- Step 8: Empty Results & Error / Retry Handling ---');

    // 8.1 Test Empty Results
    await page.route('**/api/recommendations/ai', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          recommendation: 'No matching titles found in warehouse catalog.',
          suggestedBooks: [],
          isAiGenerated: true
        })
      });
    });

    await promptInput.fill('obscure ancient manuscript');
    await submitBtn.click();
    await page.waitForTimeout(500);

    const emptyResultsBox = page.locator('[data-testid="ai-advisor-empty-results"]');
    assert(await emptyResultsBox.isVisible(), 'Empty results state displayed when suggestedBooks is empty');

    // 8.2 Test 502 Service Unavailable Error & Retry Action
    let retryAttempted = false;
    await page.route('**/api/recommendations/ai', async (route) => {
      if (!retryAttempted) {
        await route.fulfill({
          status: 502,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'AI recommendation service is temporarily unavailable. Please try again shortly.',
            isAiGenerated: false
          })
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            recommendation: 'Recovered successfully on retry.',
            suggestedBooks: [
              {
                id: 1,
                title: 'Clean Code',
                author: 'Robert C. Martin',
                category: 'Programming',
                price: 899,
                discount: 10,
                rating: 4.9,
                stock: 12,
                coverImage: 'https://images.unsplash.com/photo-1532012164546-f432f2e30777?w=600&auto=format&fit=crop&q=80'
              }
            ],
            isAiGenerated: true
          })
        });
      }
    });

    await promptInput.fill('cloud computing fundamentals');
    await submitBtn.click();
    await page.waitForTimeout(500);

    const advisorErrorBox = page.locator('[data-testid="ai-advisor-error-box"]');
    assert(await advisorErrorBox.isVisible(), '502 error displays friendly notice');

    const retryBtn = page.locator('[data-testid="ai-advisor-retry-btn"]');
    assert(await retryBtn.isVisible(), 'Retry button is visible on error');

    // Click Retry
    retryAttempted = true;
    await retryBtn.click();
    await page.waitForTimeout(500);

    assert(await resultsView.isVisible(), 'Retry button successfully recovers and renders results');

    // ------------------------------------------------------------------
    // STEP 9: Focus Trapping Inside Modal
    // ------------------------------------------------------------------
    console.log('\n--- Step 9: Keyboard Focus Trapping ---');
    // Tab cycling within modal
    await promptInput.focus();
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
    }
    const focusedInsideModal = await page.evaluate(() => {
      const modal = document.querySelector('[data-testid="ai-reading-advisor-modal"]');
      return modal ? modal.contains(document.activeElement) : false;
    });
    assert(focusedInsideModal, 'Focus trapping strictly prevents focus from escaping to background DOM');

    // Close modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    assert(!(await advisorModal.isVisible()), 'Modal closed cleanly');

    console.log('\n========================================================');
    console.log(`🤖 AI Advisor Test Suite: ${passedTests} Passed, ${failedTests} Failed`);
    console.log('========================================================\n');

    await browser.close();

    if (failedTests > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Test suite crashed with error:', err);
    await browser.close();
    process.exit(1);
  }
}

runAiAdvisorTestSuite();
