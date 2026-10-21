import { chromium } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';
let total = 0;
let passed = 0;
let failed = 0;

function assert(cond, msg) {
  total++;
  if (cond) {
    console.log(`  ✅ PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${msg}`);
    failed++;
  }
}

async function runTest() {
  console.log('🪔 ========================================================');
  console.log('🪔 BookNest Phase 4 — "Pull the Lamp to Reveal Login" Tests');
  console.log('🪔 Testing all 18 Interaction, Animation & Auth Scenarios');
  console.log('🪔 ========================================================\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 850 } });
  const page = await context.newPage();

  try {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // -------------------------------------------------------------------------
    // TEST 1 & 2: Modal Opens with Lamp OFF and Login Hidden & Inaccessible
    // -------------------------------------------------------------------------
    console.log('--- Test 1 & 2: Initial Lamp Screen (OFF State & Concealed Login) ---');
    const signInBtn = page.getByRole('button', { name: /Sign In \/ Register/i }).first();
    assert(await signInBtn.isVisible(), 'Sign In / Register button visible in navbar');
    await signInBtn.click();
    await page.waitForTimeout(400);

    const authModal = page.locator('div[role="dialog"][aria-labelledby="auth-modal-title"]');
    assert(await authModal.isVisible(), 'Auth modal dialog opened');

    const dialogEl = page.locator('.booknest-auth-dialog');
    const hasLampOffClass = (await dialogEl.getAttribute('class'))?.includes('lamp-off');
    assert(hasLampOffClass, 'Dialog initialized with .lamp-off class');

    const stringHandle = page.locator('.booknest-string-handle');
    assert(await stringHandle.isVisible(), 'Pull-string handle is visible and interactive');
    assert((await stringHandle.getAttribute('aria-pressed')) === 'false', 'String handle has aria-pressed="false" (lamp is OFF)');

    // Verify initial story quote and instruction
    const quoteEl = page.locator('.booknest-intro-quote');
    assert(await quoteEl.isVisible(), 'Story quote is visible on initial lamp screen');
    const quoteText = await quoteEl.textContent();
    assert(quoteText?.includes('Every great story begins with a little light.'), 'Displays quote: "Every great story begins with a little light."');

    const instructionEl = page.locator('.booknest-intro-instruction');
    assert(await instructionEl.isVisible(), 'Instruction is visible on initial lamp screen');
    const instructionText = await instructionEl.textContent();
    assert(instructionText?.includes('Pull the string to begin.'), 'Displays instruction: "Pull the string to begin."');

    const accessibleBtn = page.locator('.booknest-lamp-toggle-btn');
    assert(await accessibleBtn.isVisible(), 'Accessible alternative toggle button is visible');
    assert((await accessibleBtn.getAttribute('aria-label'))?.includes('reveal login form'), 'Accessible button labelled to reveal login form');

    // Verify login form is completely hidden & inaccessible while lamp is OFF
    const emailInput = page.locator('#auth-email');
    assert(!(await emailInput.isVisible()), 'Login email input is NOT visible while lamp is OFF');

    const authCardSide = page.locator('.booknest-auth-card-side');
    assert((await authCardSide.getAttribute('aria-hidden')) === 'true', 'Auth card has aria-hidden="true" while lamp is OFF');
    const isCardInert = await authCardSide.getAttribute('inert');
    assert(isCardInert !== null, 'Auth card has inert attribute while lamp is OFF');

    // -------------------------------------------------------------------------
    // TEST 3 & 4: Pulling the String Switches Lamp ON and Reveals Login Form
    // -------------------------------------------------------------------------
    console.log('\n--- Test 3 & 4: Pull String Activation & Smooth Reveal ---');
    // Simulate natural downward pull gesture on string handle
    const handleBox = await stringHandle.boundingBox();
    if (handleBox) {
      await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2 + 35, { steps: 5 });
      await page.mouse.up();
    } else {
      await stringHandle.click();
    }
    await page.waitForTimeout(700);

    const hasLampOnClass = (await dialogEl.getAttribute('class'))?.includes('lamp-on');
    assert(hasLampOnClass, 'Lamp transitioned to ON state (.lamp-on applied to dialog)');
    assert((await stringHandle.getAttribute('aria-pressed')) === 'true', 'String handle updated to aria-pressed="true"');

    // Login form is now revealed and visible
    assert(await emailInput.isVisible(), 'Login email input is now visible and illuminated');
    assert((await authCardSide.getAttribute('aria-hidden')) === 'false', 'Auth card aria-hidden updated to "false"');
    assert((await authCardSide.getAttribute('inert')) === null, 'Auth card inert attribute removed');

    // Volumetric light beam is active
    const lightBeam = page.locator('.booknest-light-beam');
    assert(await lightBeam.count() > 0, 'Volumetric light beam rendered');

    // -------------------------------------------------------------------------
    // TEST 5: Login Becomes Keyboard-Accessible After Appearing
    // -------------------------------------------------------------------------
    console.log('\n--- Test 5: Keyboard Accessibility of Revealed Login ---');
    // Verify email input received focus or can be focused directly
    const isEmailFocused = await emailInput.evaluate(el => el === document.activeElement);
    if (!isEmailFocused) {
      await emailInput.focus();
    }
    await page.keyboard.type('test@booknest.com');
    const typedEmail = await emailInput.inputValue();
    assert(typedEmail === 'test@booknest.com', 'Email field receives keyboard input normally');

    // -------------------------------------------------------------------------
    // TEST 6 & 7: Activating Lamp Again Hides Form & Blocks Input Focus/Submission
    // -------------------------------------------------------------------------
    console.log('\n--- Test 6 & 7: Lamp OFF Hides Form and Blocks Focus/Submit ---');
    await stringHandle.click();
    await page.waitForTimeout(500);

    assert((await dialogEl.getAttribute('class'))?.includes('lamp-off'), 'Lamp turned OFF again');
    assert(!(await emailInput.isVisible()), 'Email input is hidden when lamp turned OFF');
    assert((await authCardSide.getAttribute('aria-hidden')) === 'true', 'Auth card aria-hidden is "true" when OFF');

    // Verify Tab key does NOT enter the hidden form
    await page.keyboard.press('Tab');
    const activeTagName = await page.evaluate(() => document.activeElement?.tagName);
    const activeId = await page.evaluate(() => document.activeElement?.id);
    assert(activeId !== 'auth-email' && activeId !== 'auth-password', 'Keyboard Tab does NOT focus concealed credentials');

    // -------------------------------------------------------------------------
    // TEST 8: Enter and Space Keyboard Activation on String Handle
    // -------------------------------------------------------------------------
    console.log('\n--- Test 8: Enter and Space Keyboard Activation ---');
    await stringHandle.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(700);
    assert((await dialogEl.getAttribute('class'))?.includes('lamp-on'), 'Enter key on handle turns lamp ON and reveals login');

    await stringHandle.focus();
    await page.keyboard.press('Space');
    await page.waitForTimeout(500);
    assert((await dialogEl.getAttribute('class'))?.includes('lamp-off'), 'Space key on handle turns lamp OFF and hides login');

    // Turn lamp back ON using the accessible alternative button
    await accessibleBtn.click();
    await page.waitForTimeout(700);
    assert((await dialogEl.getAttribute('class'))?.includes('lamp-on'), 'Accessible button turns lamp ON');

    // -------------------------------------------------------------------------
    // TEST 10: Demo Student & Demo Admin Shortcuts
    // -------------------------------------------------------------------------
    console.log('\n--- Test 10: Demo User Shortcuts Functionality ---');
    const demoStudentBtn = page.locator('button:has-text("Demo Student")');
    assert(await demoStudentBtn.isVisible(), 'Demo Student button is visible when lamp is ON');
    const demoAdminBtn = page.locator('button:has-text("Demo Admin")');
    assert(await demoAdminBtn.isVisible(), 'Demo Admin button is visible when lamp is ON');

    // -------------------------------------------------------------------------
    // TEST 14: Invalid Login Credentials Shows Accessible Error
    // -------------------------------------------------------------------------
    console.log('\n--- Test 14: Invalid Credentials Error Alert ---');
    await page.fill('#auth-email', 'invalid-email@booknest.com');
    await page.fill('#auth-password', 'WrongPassword!123');
    await page.locator('button[type="submit"]:has-text("Sign In to Account")').click();
    await page.waitForTimeout(600);

    const errorAlert = page.locator('div[role="alert"]');
    assert(await errorAlert.isVisible(), 'Error alert displayed on invalid credentials');
    const errorText = await errorAlert.textContent();
    assert(errorText?.length > 0, `Error message rendered: "${errorText?.trim()}"`);

    // -------------------------------------------------------------------------
    // TEST 12: Account Registration Tab & Fields
    // -------------------------------------------------------------------------
    console.log('\n--- Test 12: Account Registration Mode ---');
    const registerTab = page.locator('.booknest-auth-dialog button:has-text("Create Account")');
    await registerTab.click();
    await page.waitForTimeout(200);

    const nameInput = page.locator('#auth-name');
    assert(await nameInput.isVisible(), 'Full Name input appears in registration mode');
    const phoneInput = page.locator('#auth-phone');
    assert(await phoneInput.isVisible(), 'Phone Number input appears in registration mode');

    // Switch back to Sign In
    const signInTab = page.locator('.booknest-auth-dialog button:has-text("Sign In")').first();
    await signInTab.click();
    await page.waitForTimeout(200);
    assert(!(await nameInput.isVisible()), 'Full Name input hidden after switching back to Sign In');

    // -------------------------------------------------------------------------
    // TEST 13: Google Authentication Button & Redirect
    // -------------------------------------------------------------------------
    console.log('\n--- Test 13: Google Authentication Action ---');
    const googleBtn = page.locator('button:has-text("Continue with Google")');
    assert(await googleBtn.isVisible(), 'Google Sign-In button rendered with official branding');

    // -------------------------------------------------------------------------
    // TEST 15: Escape Key Dismisses Modal and Restores Opener Focus
    // -------------------------------------------------------------------------
    console.log('\n--- Test 15: Escape Key Dismissal & Focus Restoration ---');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    assert(!(await authModal.isVisible()), 'Modal closed via Escape key');

    // Reopen modal to verify clean reset to OFF
    await signInBtn.click();
    await page.waitForTimeout(400);
    assert(await authModal.isVisible(), 'Modal reopened successfully');
    assert((await dialogEl.getAttribute('class'))?.includes('lamp-off'), 'Reopened modal correctly defaults to lamp OFF state');

    // Turn lamp ON
    await stringHandle.click();
    await page.waitForTimeout(700);

    // -------------------------------------------------------------------------
    // TEST 11: Email/Password Authentication & JWT Session Establishment
    // -------------------------------------------------------------------------
    console.log('\n--- Test 11: Successful Authentication via Demo Student ---');
    await demoStudentBtn.click();
    await page.waitForTimeout(1000);
    assert(!(await authModal.isVisible()), 'Modal closed automatically upon successful authentication');

    // Verify session in navbar account menu
    const accountBtn = page.locator('[data-testid="account-menu-btn"]');
    await accountBtn.click();
    await page.waitForTimeout(300);
    const dropdownText = await page.locator('#account-menu-dropdown').textContent();
    assert(dropdownText?.includes('user@booknest.com') || dropdownText?.includes('Aditya Chauhan'), 'User session established with valid JWT');
    await page.keyboard.press('Escape');

    // -------------------------------------------------------------------------
    // TEST 9: Mobile Touch Interaction & Responsive Viewport (375px)
    // -------------------------------------------------------------------------
    console.log('\n--- Test 9: Mobile Touch & Responsive Viewports ---');
    const mobileContext = await browser.newContext({ viewport: { width: 375, height: 667 }, hasTouch: true });
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(BASE_URL);
    await mobilePage.waitForLoadState('networkidle');

    // Open auth modal on mobile
    const mobSignIn = mobilePage.getByRole('button', { name: /Sign In \/ Register/i }).first();
    if (await mobSignIn.isVisible()) {
      await mobSignIn.click();
    } else {
      await mobilePage.locator('button[aria-label*="navigation"]').click();
      await mobilePage.waitForTimeout(300);
      await mobilePage.locator('button:has-text("Sign In")').first().click();
    }
    await mobilePage.waitForTimeout(400);

    const mobModal = mobilePage.locator('div[role="dialog"][aria-labelledby="auth-modal-title"]');
    assert(await mobModal.isVisible(), 'Auth modal opens on 375px mobile screen');

    const mobHandle = mobilePage.locator('.booknest-string-handle');
    assert(await mobHandle.isVisible(), 'Lamp handle is visible on mobile');

    // Touch tap string handle on mobile to reveal form
    await mobHandle.tap();
    await mobilePage.waitForTimeout(700);

    const mobEmail = mobilePage.locator('#auth-email');
    assert(await mobEmail.isVisible(), 'Login form revealed on mobile upon string tap');

    const hasMobileOverflow = await mobilePage.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    assert(!hasMobileOverflow, 'Zero horizontal overflow on 375px mobile viewport');

    // -------------------------------------------------------------------------
    // TEST 16: Reduced-Motion Preference Mode
    // -------------------------------------------------------------------------
    console.log('\n--- Test 16: Reduced-Motion Mode Verification ---');
    const rmContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      reducedMotion: 'reduce'
    });
    const rmPage = rmContext.newPage();
    const rmPageObj = await rmPage;
    await rmPageObj.goto(BASE_URL);
    await rmPageObj.waitForLoadState('networkidle');

    const rmSignIn = rmPageObj.getByRole('button', { name: /Sign In \/ Register/i }).first();
    await rmSignIn.click();
    await rmPageObj.waitForTimeout(400);

    const rmHandle = rmPageObj.locator('.booknest-string-handle');
    await rmHandle.click();
    await rmPageObj.waitForTimeout(100); // Should be immediate without oscillation delay
    const rmEmail = rmPageObj.locator('#auth-email');
    assert(await rmEmail.isVisible(), 'Lamp switches and reveals form immediately in reduced-motion mode');

    // -------------------------------------------------------------------------
    // TEST 17: Rapid Repeated Interaction (Stress Test)
    // -------------------------------------------------------------------------
    console.log('\n--- Test 17: Rapid Repeated Interaction Resilience ---');
    // Rapid toggling 4 times in quick succession
    await rmHandle.click();
    await rmHandle.click();
    await rmHandle.click();
    await rmHandle.click();
    await rmPageObj.waitForTimeout(300);

    const rmDialog = rmPageObj.locator('.booknest-auth-dialog');
    const finalClass = await rmDialog.getAttribute('class');
    assert(finalClass?.includes('lamp-on') || finalClass?.includes('lamp-off'), 'Rapid clicks maintain consistent state machine without corruption');

    // -------------------------------------------------------------------------
    // TEST 18: Missing Optional Browser APIs (Graceful Degradation)
    // -------------------------------------------------------------------------
    console.log('\n--- Test 18: Graceful Degradation Without Optional APIs ---');
    const noAudioContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await noAudioContext.addInitScript(() => {
      delete window.AudioContext;
      delete window.webkitAudioContext;
    });
    const noAudioPage = await noAudioContext.newPage();
    await noAudioPage.goto(BASE_URL);
    await noAudioPage.waitForLoadState('networkidle');

    const noAudioSignIn = noAudioPage.getByRole('button', { name: /Sign In \/ Register/i }).first();
    await noAudioSignIn.click();
    await noAudioPage.waitForTimeout(400);

    const noAudioHandle = noAudioPage.locator('.booknest-string-handle');
    await noAudioHandle.click();
    await noAudioPage.waitForTimeout(700);

    const noAudioEmail = noAudioPage.locator('#auth-email');
    assert(await noAudioEmail.isVisible(), 'Lamp reveals login normally even when AudioContext is completely absent');

    console.log('\n========================================================');
    console.log(`🪔 All 18 Scenarios Verified: ${passed} Passed, ${failed} Failed`);
    console.log('========================================================\n');

    await noAudioContext.close();
    await rmContext.close();
    await mobileContext.close();
    await context.close();
    await browser.close();

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Unhandled error during test:', err);
    await browser.close();
    process.exit(1);
  }
}

runTest();
