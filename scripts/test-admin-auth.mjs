import { chromium } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
let total = 0;
let passed = 0;
let failed = 0;

function assert(condition, message) {
  total++;
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function runAdminAuthTestSuite() {
  console.log('🛡️  ========================================================');
  console.log('🛡️  BookNest Admin Authentication & Access Verification Suite');
  console.log('🛡️  Target: ' + BASE_URL);
  console.log('🛡️  ========================================================\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    // ------------------------------------------------------------------
    // TEST 1: Unauthenticated Navigation to Admin View
    // ------------------------------------------------------------------
    console.log('--- Test 1: Protected Admin View Gate for Guests ---');
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);

    // Click Admin in Navbar
    const adminNavBtn = page.getByRole('button', { name: /Admin/i }).first();
    assert(await adminNavBtn.isVisible(), 'Desktop navigation renders "Admin" entry button');

    await adminNavBtn.click();
    await page.waitForTimeout(400);

    // Verify "Administrator Access Required" prompt appears
    const gateHeading = page.locator('h2:has-text("Administrator Access Required")');
    assert(await gateHeading.isVisible(), 'Gatekeeper prompt displayed: "Administrator Access Required"');

    const signInAdminBtn = page.locator('button:has-text("Sign In as Administrator")');
    assert(await signInAdminBtn.isVisible(), 'Sign In as Administrator call-to-action button is visible');

    // ------------------------------------------------------------------
    // TEST 2: Open Auth Modal and Pull Lamp String
    // ------------------------------------------------------------------
    console.log('\n--- Test 2: Auth Modal Activation & Lamp Switch ---');
    await signInAdminBtn.click();
    await page.waitForTimeout(400);

    const authModal = page.locator('div[role="dialog"][aria-labelledby="auth-modal-title"]');
    assert(await authModal.isVisible(), 'Auth modal dialog opened');

    const stringHandle = page.locator('.booknest-string-handle');
    assert(await stringHandle.isVisible(), 'Lamp pull-string handle is visible');

    // Turn lamp ON
    await stringHandle.click();
    await page.waitForTimeout(700);

    const demoAdminBtn = page.locator('[data-testid="demo-admin-btn"], button:has-text("Demo Admin")').first();
    assert(await demoAdminBtn.isVisible(), 'Demo Admin shortcut button is visible and active');

    // ------------------------------------------------------------------
    // TEST 3: Invalid Admin Password Shows Accessible Error Alert
    // ------------------------------------------------------------------
    console.log('\n--- Test 3: Rejection of Invalid Admin Password ---');
    const emailInput = page.locator('#auth-email');
    const passwordInput = page.locator('#auth-password');

    await emailInput.fill('admin@booknest.com');
    await passwordInput.fill('WrongAdminPassword!999');
    await page.locator('button[type="submit"]:has-text("Sign In")').first().click();
    await page.waitForTimeout(600);

    const errorAlert = page.locator('div[role="alert"]');
    assert(await errorAlert.isVisible(), 'Error alert displayed on invalid admin password');
    const errorText = await errorAlert.textContent();
    assert(errorText?.toLowerCase().includes('invalid'), `Rejection message rendered: "${errorText?.trim()}"`);

    // ------------------------------------------------------------------
    // TEST 4: Demo Admin Login & Transition to Admin Dashboard
    // ------------------------------------------------------------------
    console.log('\n--- Test 4: Demo Admin Shortcut & Dashboard Access ---');
    await demoAdminBtn.click();
    await page.waitForTimeout(1000);

    // Verify modal automatically closed
    assert(!(await authModal.isVisible()), 'Modal closed cleanly upon successful admin authentication');

    // Verify user role in top micro-bar
    const adminRoleBadge = page.locator('text=Administrator').first();
    assert(await adminRoleBadge.isVisible(), 'Navbar displays verified Administrator badge');

    // Verify Admin Control Tower Dashboard is active
    const adminDashboard = page.locator('text=Warehouse Control Tower, text=Campus Warehouse, text=Low Stock Units, text=Orders & Dispatch').first();
    const isDashboardVisible = await page.locator('button:has-text("Add New Book"), button:has-text("Export Report"), h2:has-text("Inventory"), div:has-text("Live Dispatch Pipeline")').first().isVisible();
    assert(isDashboardVisible, 'Admin user reached the authorized Control Tower Dashboard');

    // ------------------------------------------------------------------
    // TEST 5: Student Cannot Access Admin Dashboard
    // ------------------------------------------------------------------
    console.log('\n--- Test 5: Role Isolation (Student Cannot Access Admin) ---');
    // Sign out admin
    const accountBtn = page.locator('[data-testid="account-menu-btn"]');
    await accountBtn.click();
    await page.waitForTimeout(300);

    const signOutBtn = page.locator('[data-testid="sign-out-btn"], button:has-text("Sign Out")').first();
    await signOutBtn.click();
    await page.waitForTimeout(500);

    // Sign in as student
    const signInBtn = page.getByRole('button', { name: /Sign In \/ Register/i }).first();
    await signInBtn.click();
    await page.waitForTimeout(400);

    // Turn lamp ON
    if (await stringHandle.isVisible()) {
      const isOff = (await page.locator('.booknest-auth-dialog').getAttribute('class'))?.includes('lamp-off');
      if (isOff) {
        await stringHandle.click();
        await page.waitForTimeout(700);
      }
    }

    const demoStudentBtn = page.locator('[data-testid="demo-student-btn"], button:has-text("Demo Student")').first();
    await demoStudentBtn.click();
    await page.waitForTimeout(1000);

    const studentBadge = page.locator('text=Student').first();
    assert(await studentBadge.isVisible(), 'Logged in as verified campus student');

    // Navigate to Admin view as student
    await adminNavBtn.click();
    await page.waitForTimeout(400);

    // Must see "Administrator Access Required" prompt, NOT AdminDashboard
    assert(await gateHeading.isVisible(), 'Student is prevented from viewing admin dashboard (Gatekeeper active)');
    assert(!(await page.locator('button:has-text("Add New Book")').isVisible()), 'Admin controls are hidden from student');

    console.log('\n========================================================');
    console.log(`🛡️  Admin Authentication Suite: ${passed} Passed, ${failed} Failed`);
    console.log('========================================================\n');

    await context.close();
    await browser.close();

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal admin auth test error:', err);
    await browser.close();
    process.exit(1);
  }
}

runAdminAuthTestSuite();
