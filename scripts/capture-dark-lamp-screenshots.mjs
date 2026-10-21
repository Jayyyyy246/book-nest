import { chromium } from '@playwright/test';
import path from 'path';

const ARTIFACT_DIR = 'C:/Users/jay/.gemini/antigravity-ide/brain/4a71d557-45c4-453b-b006-296263197ae8';
const BASE_URL = 'http://localhost:3000';

async function captureScreenshots() {
  console.log('Capturing screenshots of Dark Glassmorphism Lamp Login UI...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  try {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // 1. Open Auth Modal
    const signInBtn = page.getByRole('button', { name: /Sign In \/ Register/i }).first();
    await signInBtn.click();
    await page.waitForTimeout(500);

    // Screenshot 1: Lamp OFF State
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'lamp_off_dark_room.png') });
    console.log('Saved lamp_off_dark_room.png');

    // 2. Turn Lamp ON
    const stringHandle = page.locator('.booknest-string-handle');
    await stringHandle.click();
    await page.waitForTimeout(1000); // Wait for smooth transition & beam reveal

    // Screenshot 2: Lamp ON with Dark Glassmorphic Login Form
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'lamp_on_dark_glassmorphic_form.png') });
    console.log('Saved lamp_on_dark_glassmorphic_form.png');

    // 3. Test Password visibility toggle
    const passwordInput = page.locator('#auth-password');
    await passwordInput.fill('BookNestSecret2026!');
    const eyeBtn = page.locator('.booknest-auth-eye-btn');
    await eyeBtn.click();
    await page.waitForTimeout(300);

    // Screenshot 3: Password visible & eye toggle active
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'password_visibility_toggled.png') });
    console.log('Saved password_visibility_toggled.png');

    // 4. Switch to Create Account mode
    const createAccountTab = page.getByRole('tab', { name: /Create Account/i });
    await createAccountTab.click();
    await page.waitForTimeout(400);

    // Screenshot 4: Create Account mode in Dark Glassmorphism
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'create_account_dark_mode.png') });
    console.log('Saved create_account_dark_mode.png');

    // 5. Test Mobile Viewport
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);

    // Screenshot 5: Mobile Dark Login
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'mobile_dark_lamp_login.png') });
    console.log('Saved mobile_dark_lamp_login.png');

    console.log('All screenshots captured successfully!');
  } finally {
    await browser.close();
  }
}

captureScreenshots().catch(err => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
