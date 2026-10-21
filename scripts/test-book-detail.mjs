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

async function runBookDetailTestSuite() {
  console.log('📖 ========================================================');
  console.log('📖 BookNest Dedicated Book Detail & Deep Linking E2E Suite');
  console.log('📖 Target: ' + BASE_URL);
  console.log('📖 ========================================================\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    // ------------------------------------------------------------------
    // STEP 1: Direct Navigation to a Valid Book URL
    // ------------------------------------------------------------------
    console.log('--- Step 1: Direct Navigation to a Valid Book URL ---');
    const catalogRes = await fetch(`${BASE_URL}/api/books`).then(r => r.json());
    const validBook = catalogRes.books.find(b => b.title === 'Atomic Habits') || catalogRes.books[0];
    const validBookId = validBook.id;

    await page.goto(`${BASE_URL}/#/book/${validBookId}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    const detailPage = page.locator('[data-testid="book-detail-page"]');
    assert(await detailPage.isVisible(), `Direct navigation to #/book/${validBookId} renders dedicated BookDetailPage`);

    const bookTitle = page.locator('[data-testid="book-detail-title"]');
    const titleText = (await bookTitle.textContent())?.trim();
    assert(titleText && titleText.length > 0, `Book title is loaded from backend: "${titleText}"`);

    const bookAuthor = page.locator('[data-testid="book-detail-author"]');
    assert(await bookAuthor.isVisible(), 'Author information is displayed');

    const bookPrice = page.locator('[data-testid="book-detail-price"]');
    assert((await bookPrice.textContent())?.includes('₹'), 'Pricing with academic currency symbol is displayed');

    const bookCover = page.locator('[data-testid="book-detail-cover"]');
    assert(await bookCover.isVisible(), 'Book cover image is rendered');

    // ------------------------------------------------------------------
    // STEP 2: Browser Refresh on a Book URL
    // ------------------------------------------------------------------
    console.log('\n--- Step 2: Browser Refresh on a Book URL ---');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    assert(await detailPage.isVisible(), 'Dedicated BookDetailPage persists after page refresh');
    const refreshedTitle = (await page.locator('[data-testid="book-detail-title"]').textContent())?.trim();
    assert(refreshedTitle === titleText, `Book title matches after reload: "${refreshedTitle}"`);
    assert(page.url().includes(`#/book/${validBookId}`) || page.url().includes(`#book/${validBookId}`), 'Hash URL is preserved after reload');

    // ------------------------------------------------------------------
    // STEP 3: Add to Cart & Wishlist Actions on Detail Page
    // ------------------------------------------------------------------
    console.log('\n--- Step 3: Add to Cart & Wishlist from Detail Page ---');
    // Test Quantity Selector
    const initialQty = (await page.locator('[data-testid="detail-qty-display"]').textContent())?.trim();
    assert(initialQty === '1', 'Initial detail quantity is 1');

    await page.locator('button[aria-label="Increase quantity"]').click();
    await page.waitForTimeout(100);
    const updatedQty = (await page.locator('[data-testid="detail-qty-display"]').textContent())?.trim();
    assert(updatedQty === '2', 'Quantity selector increments to 2');

    // Add to Cart
    const addCartBtn = page.locator('[data-testid="detail-add-cart-btn"]');
    await addCartBtn.click();
    await page.waitForTimeout(400);

    const cartCountBadge = page.locator('button[title="Shopping Cart"] span.rounded-md');
    const cartCount = parseInt((await cartCountBadge.textContent()) || '0', 10);
    assert(cartCount >= 2, `Cart incremented with chosen quantity (Cart: ${cartCount})`);

    // Wishlist Toggle
    const wishlistBtn = page.locator('[data-testid="detail-wishlist-btn"]');
    await wishlistBtn.click();
    await page.waitForTimeout(400);
    assert(
      (await wishlistBtn.locator('i').getAttribute('class')).includes('fa-solid text-rose-500'),
      'Wishlist button toggles to active filled heart on detail page'
    );

    // ------------------------------------------------------------------
    // STEP 4: Shareable Direct Link & Clipboard
    // ------------------------------------------------------------------
    console.log('\n--- Step 4: Shareable Link Action ---');
    const shareBtn = page.locator('[data-testid="share-link-btn"]');
    assert(await shareBtn.isVisible(), 'Shareable direct link button is visible');
    await shareBtn.click();
    await page.waitForTimeout(300);

    const toastNotice = page.locator('text=link copied');
    assert(await toastNotice.first().isVisible(), 'Toast notification confirms link copied to clipboard');

    // ------------------------------------------------------------------
    // STEP 5: Related Books & Related Book Navigation
    // ------------------------------------------------------------------
    console.log('\n--- Step 5: Related Books & In-Page Navigation ---');
    const relatedCards = page.locator('[data-testid="related-book-card"]');
    const relCount = await relatedCards.count();
    assert(relCount > 0, `Renders ${relCount} related books in same academic category`);

    if (relCount > 0) {
      await relatedCards.first().click();
      await page.waitForFunction(old => {
        const el = document.querySelector('[data-testid="book-detail-title"]');
        return el && el.textContent && el.textContent.trim() !== old;
      }, titleText, { timeout: 10000 });
      const newTitle = (await page.locator('[data-testid="book-detail-title"]').textContent())?.trim();
      assert(newTitle !== titleText, `Navigated to related book detail: "${newTitle}"`);
      assert(page.url().includes('#/book/'), 'URL updated to the newly selected related book ID');
    }

    // ------------------------------------------------------------------
    // STEP 6: Navigation from QuickViewModal to Dedicated Page
    // ------------------------------------------------------------------
    console.log('\n--- Step 6: Navigation from QuickViewModal to Dedicated Page ---');
    // Navigate to Catalog
    await page.locator('header nav button:has-text("Catalog")').click();
    await page.waitForTimeout(600);

    // Open Quick View by clicking first book card in catalog
    const firstBookCard = page.locator('div[role="button"][aria-label^="View details for"]').first();
    await firstBookCard.click();
    await page.waitForTimeout(400);

    const quickViewModal = page.locator('[data-testid="quick-view-modal"]');
    assert(await quickViewModal.isVisible(), 'Quick View modal opened from catalog');

    // Click "View Full Book Details" action button
    const viewFullDetailsBtn = page.locator('[data-testid="quickview-view-full-details-btn"]');
    assert(await viewFullDetailsBtn.isVisible(), 'QuickViewModal displays "View Full Book Details" action');

    await viewFullDetailsBtn.click();
    await page.waitForTimeout(600);

    assert(!(await quickViewModal.isVisible()), 'Quick View modal closes upon navigating to full details');
    assert(await detailPage.isVisible(), 'Navigated directly from Quick View to dedicated BookDetailPage');
    assert(page.url().includes('#/book/'), 'URL hash properly reflects the selected book ID');

    // ------------------------------------------------------------------
    // STEP 7: Browser Back and Forward Navigation
    // ------------------------------------------------------------------
    console.log('\n--- Step 7: Browser Back and Forward Navigation ---');
    // Go Back (should return to Catalog)
    await page.goBack();
    await page.waitForTimeout(600);
    const catalogH1 = page.locator('h1:has-text("Book Catalog")');
    assert(await catalogH1.isVisible(), 'Browser Back button returns to Book Catalog view');

    // Go Forward (should return to Book Detail)
    await page.goForward();
    await page.waitForTimeout(600);
    assert(await detailPage.isVisible(), 'Browser Forward button returns to BookDetailPage');

    // ------------------------------------------------------------------
    // STEP 8: Invalid and Unavailable Book IDs
    // ------------------------------------------------------------------
    console.log('\n--- Step 8: Invalid / Unavailable Book IDs ---');
    await page.goto(`${BASE_URL}/#/book/999999`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    const errorState = page.locator('[data-testid="book-detail-error"]');
    assert(await errorState.isVisible(), 'Non-existent book ID displays friendly error / not-found state');

    const errorCatalogBtn = page.locator('[data-testid="error-catalog-btn"]');
    assert(await errorCatalogBtn.isVisible(), 'Error state provides "Browse Textbook Catalog" button');

    await errorCatalogBtn.click();
    await page.waitForTimeout(600);
    assert(await page.locator('h1:has-text("Book Catalog")').isVisible(), 'Clicking error action navigates back to Catalog');

    // ------------------------------------------------------------------
    // STEP 9: Existing Routes & Quick View Regression
    // ------------------------------------------------------------------
    console.log('\n--- Step 9: Existing Routes Regression Verification ---');
    // Storefront
    await page.locator('header nav button:has-text("Storefront")').click();
    await page.waitForTimeout(400);
    assert(await page.locator('text=Essential Academic & Literary Reads').first().isVisible(), 'Storefront view intact');

    // Quick View still functions normally without altering URL unexpectedly
    const urlBeforeQv = page.url();
    const storefrontCard = page.locator('div[role="button"][aria-label^="View details for"]').first();
    await storefrontCard.click();
    await page.waitForTimeout(400);
    assert(await page.locator('[data-testid="quick-view-modal"]').isVisible(), 'QuickViewModal opens normally on storefront');
    assert(page.url() === urlBeforeQv, 'Opening Quick View does not alter the underlying URL hash');

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    console.log('\n========================================================');
    console.log(`📖 Book Detail Test Suite: ${passedTests} Passed, ${failedTests} Failed`);
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

runBookDetailTestSuite();
