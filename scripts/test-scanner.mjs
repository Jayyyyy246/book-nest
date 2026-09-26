import { chromium } from '@playwright/test';
import fs from 'fs';

const BASE_URL = 'http://localhost:3000';
const API_URL = 'http://localhost:5000/api';

async function runScannerTestSuite() {
  console.log('🧪 ========================================================');
  console.log('🧪 BookNest Deterministic Scanner Verification Test Suite');
  console.log('🧪 ========================================================\n');

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

  // --- SUITE A: BACKEND DETERMINISTIC MATCHING & CONTRACTS ---

  console.log('--- Test 1: Known ISBN (Clean Code: 9780132350884) ---');
  try {
    const res = await fetch(`${API_URL}/scanner/isbn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isbn: '978-0-13-235088-4' }) // Hyphenated to test normalization
    });
    const data = await res.json();
    assert(res.ok && data.matched === true, 'Returned 200 OK and matched === true');
    assert(data.matchType === 'ISBN_EXACT', `Match type is ISBN_EXACT (Got: ${data.matchType})`);
    assert(data.confidence === 1.0, `Calculated confidence is exactly 1.0 (Got: ${data.confidence})`);
    assert(data.book.title.includes('Clean Code'), `Book title contains "Clean Code" (Got: "${data.book.title}")`);
    assert(data.isLocalCatalog === true, 'Identified as local warehouse catalog');
  } catch (err) {
    assert(false, `Test 1 threw error: ${err.message}`);
  }

  console.log('\n--- Test 2: Unknown ISBN (9780000000002) ---');
  try {
    const res = await fetch(`${API_URL}/scanner/isbn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isbn: '9780000000002' })
    });
    const data = await res.json();
    assert(res.status === 404, `Returned 404 Not Found (Got: ${res.status})`);
    assert(data.matched === false, 'matched flag is false');
    assert(data.matchType === 'NO_MATCH', `matchType is NO_MATCH (Got: ${data.matchType})`);
    assert(data.book === undefined, 'No fake or random book was returned');
    assert(typeof data.error === 'string' && data.error.length > 0, 'Honest error message returned');
  } catch (err) {
    assert(false, `Test 2 threw error: ${err.message}`);
  }

  console.log('\n--- Test 3: Known Title Match ("Atomic Habits") ---');
  try {
    const res = await fetch(`${API_URL}/scanner/match-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'Atomic Habits by James Clear' })
    });
    const data = await res.json();
    assert(res.ok && data.matched === true, 'Returned 200 OK and matched === true');
    assert(data.book.title === 'Atomic Habits', `Identified "Atomic Habits" (Got: "${data.book?.title}")`);
    assert(data.confidence >= 0.85, `Calculated confidence >= 0.85 (Got: ${data.confidence})`);
    assert(data.confidence <= 1.0, `Confidence does not exceed 1.0 (Got: ${data.confidence})`);
  } catch (err) {
    assert(false, `Test 3 threw error: ${err.message}`);
  }

  console.log('\n--- Test 4: Unknown Title ("Quantum Banana Surfing in Outer Space") ---');
  try {
    const res = await fetch(`${API_URL}/scanner/match-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'Quantum Banana Surfing in Outer Space' })
    });
    const data = await res.json();
    assert(res.ok, 'API returned valid 200 response');
    assert(data.matched === false, 'matched is false for unknown title');
    assert(data.matchType === 'NO_MATCH', `matchType is NO_MATCH (Got: ${data.matchType})`);
    assert(data.confidence === 0, `Calculated confidence is 0 (Got: ${data.confidence})`);
    assert(data.book === null, 'Did not invent or pick a random book');
  } catch (err) {
    assert(false, `Test 4 threw error: ${err.message}`);
  }

  console.log('\n--- Test 5: Multiple Candidate Books (Search "Design") ---');
  try {
    const res = await fetch(`${API_URL}/scanner/match-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'Design' })
    });
    const data = await res.json();
    assert(res.ok, 'API returned valid 200 response');
    assert(Array.isArray(data.candidates) && data.candidates.length > 0, `Returned candidates list (Count: ${data.candidates?.length})`);
    data.candidates.forEach((cand, idx) => {
      assert(typeof cand.confidence === 'number' && cand.confidence > 0, `Candidate [${idx + 1}] "${cand.book.title}" has calculated confidence: ${cand.confidence}`);
    });
  } catch (err) {
    assert(false, `Test 5 threw error: ${err.message}`);
  }

  console.log('\n--- Test 6: Empty Upload Validation ---');
  try {
    const res = await fetch(`${API_URL}/scanner/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: '' })
    });
    const data = await res.json();
    assert(res.status === 400, `Rejected empty base64 with status 400 (Got: ${res.status})`);
    assert(data.error.includes('Base64 image data is required'), 'Returned exact error message');
  } catch (err) {
    assert(false, `Test 6 threw error: ${err.message}`);
  }

  console.log('\n--- Test 7: Invalid Image Format (MIME: image/gif) ---');
  try {
    const res = await fetch(`${API_URL}/scanner/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        imageBase64: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        mimeType: 'image/gif'
      })
    });
    const data = await res.json();
    assert(res.status === 400, `Rejected unsupported MIME type with status 400 (Got: ${res.status})`);
    assert(data.error.includes('Unsupported image format'), 'Returned unsupported format message');
  } catch (err) {
    assert(false, `Test 7 threw error: ${err.message}`);
  }

  console.log('\n--- Test 8: Blurry / Blank Image (No Text Detectable) ---');
  try {
    // 1x1 solid white PNG base64
    const blankPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
    const res = await fetch(`${API_URL}/scanner/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        imageBase64: blankPng,
        mimeType: 'image/png'
      })
    });
    const data = await res.json();
    assert(res.status === 404, `Returned 404 for unreadable blank image (Got: ${res.status})`);
    assert(data.matched === false, 'matched is false');
    assert(data.matchType === 'NO_MATCH', 'matchType is NO_MATCH');
    assert(data.error.includes('could not detect') || data.error.includes('does not appear to be a book'), 'Honest error message explaining text could not be read');
  } catch (err) {
    assert(false, `Test 8 threw error: ${err.message}`);
  }

  // --- SUITE B: BROWSER & CAMERA INTERACTION (HEADLESS PLAYWRIGHT) ---
  console.log('\n--- Test 9: Browser Camera Flow & UI Elements (Desktop) ---');
  const browser = await chromium.launch({ headless: true });
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await desktopContext.newPage();

  const screenshotsDir = 'docs/audit-screenshots';
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  try {
    await page.goto(`${BASE_URL}`, { waitUntil: 'networkidle' });
    await page.locator('nav button').filter({ hasText: 'Scan Cover' }).click();
    await page.waitForTimeout(600);

    const h1 = await page.locator('h1').textContent();
    assert(h1.includes('Point, Scan, and Learn'), `Scanner View loaded with heading: "${h1?.trim()}"`);

    // Check pipeline mode badge
    const modeBadge = page.locator('text=● Real Camera Mode');
    assert(await modeBadge.isVisible(), 'Pipeline displays "● Real Camera Mode" badge');

    // Check Start Camera button
    const startCameraBtn = page.getByRole('button', { name: /Start Camera/i }).first();
    assert(await startCameraBtn.isVisible(), 'Explicit "Start Camera" button is visible (no unsolicited prompt)');

    // Test Manual ISBN Search in UI
    const isbnInput = page.locator('input[placeholder*="enter ISBN"]');
    await isbnInput.fill('9780132350884');
    await page.getByRole('button', { name: /Lookup ISBN/i }).click();
    await page.waitForTimeout(1000);

    const bookFoundBadge = page.locator('text=BOOK FOUND');
    assert(await bookFoundBadge.isVisible(), 'Result card shows "BOOK FOUND" banner');

    const confidenceBadge = page.locator('text=100% Calculated Match');
    assert(await confidenceBadge.isVisible(), 'Result card shows calculated "100% Calculated Match"');

    const evidenceText = await page.locator('text=Deterministic 100% match on catalog ISBN').count();
    assert(evidenceText > 0, 'Result card displays genuine match evidence');

    await page.screenshot({ path: `${screenshotsDir}/scanner-desktop-isbn-match.png` });

    // Test Try Scanner Demo button
    console.log('\n--- Test 10: Try Scanner Demo Mode (Explicit Label) ---');
    const demoBtn = page.locator('[data-testid="demo-sample-btn"]').first();
    await demoBtn.waitFor({ state: 'visible', timeout: 5000 });
    await demoBtn.click();
    await page.waitForTimeout(600);

    const demoSampleBadge = page.locator('text=DEMO SAMPLE');
    assert(await demoSampleBadge.isVisible(), 'Demo card displays explicit "DEMO SAMPLE" badge');

    const demoNotice = await page.locator('text=Preloaded campus demonstration sample').count();
    assert(demoNotice > 0, 'Demo card clarifies sample does not invoke hardware vision');
    await page.screenshot({ path: `${screenshotsDir}/scanner-demo-sample.png` });

  } catch (err) {
    assert(false, `Test 9/10 threw error: ${err.message}`);
  } finally {
    await desktopContext.close();
  }

  // --- SUITE C: MOBILE CAMERA & RESPONSIVENESS (IPHONE SE VIEWPORT) ---
  console.log('\n--- Test 11: Mobile Camera Responsiveness (Viewport: 375x667) ---');
  const mobileContext = await browser.newContext({ 
    viewport: { width: 375, height: 667 },
    isMobile: true,
    hasTouch: true
  });
  const mobilePage = await mobileContext.newPage();

  try {
    await mobilePage.goto(`${BASE_URL}`, { waitUntil: 'networkidle' });
    
    // Open mobile menu drawer using data-testid
    const menuBtn = mobilePage.locator('[data-testid="mobile-menu-toggle"]');
    if (await menuBtn.isVisible()) {
      await menuBtn.click({ force: true });
      await mobilePage.waitForTimeout(400);
      await mobilePage.locator('[data-testid="mobile-nav-scanner-btn"]').click();
      await mobilePage.waitForTimeout(600);
    } else {
      await mobilePage.locator('[data-testid="desktop-nav-scanner-btn"]').click();
      await mobilePage.waitForTimeout(600);
    }

    const mobileH1 = await mobilePage.locator('h1').textContent();
    assert(mobileH1.includes('Point, Scan, and Learn'), 'Mobile scanner view loaded cleanly');

    const startCameraBtn = mobilePage.getByRole('button', { name: /Start Camera/i }).first();
    assert(await startCameraBtn.isVisible(), 'Mobile view renders touch-friendly Start Camera button');

    // Test camera error handling when permission is denied
    console.log('\n--- Test 12: Camera Permission Denied Simulation ---');
    await mobilePage.evaluate(() => {
      // Simulate getUserMedia rejecting with NotAllowedError
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
    });

    await startCameraBtn.click();
    await mobilePage.waitForTimeout(500);

    const permDeniedAlert = mobilePage.locator('text=Camera permission was denied');
    assert(await permDeniedAlert.isVisible(), 'Gracefully rendered "Camera permission was denied" alert');

    const uploadFallbackBtn = mobilePage.locator('button:has-text("Upload Cover Photo Instead")');
    assert(await uploadFallbackBtn.isVisible(), 'Fallback upload button offered upon camera denial');

    await mobilePage.screenshot({ path: `${screenshotsDir}/scanner-mobile-perm-denied.png` });

  } catch (err) {
    assert(false, `Test 11/12 threw error: ${err.message}`);
  } finally {
    await mobileContext.close();
    await browser.close();
  }

  console.log('\n========================================================');
  console.log(`Scanner Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runScannerTestSuite();
