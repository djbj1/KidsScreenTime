const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function unlockParentMode(page) {
  // Click parent nav tab
  const parentTab = await page.$('.nav-tab:has-text("Eltern")');
  if (parentTab) {
    await parentTab.click();
    await page.waitForTimeout(400);

    // Enter PIN: 1, 3, 0, 7
    const digits = ['1', '3', '0', '7'];
    for (const d of digits) {
      const keyBtn = await page.locator(`.pin-key:has-text("${d}")`).first();
      if (await keyBtn.count()) {
        await keyBtn.click();
        await page.waitForTimeout(150);
      }
    }
    await page.waitForTimeout(800);
  }
}

async function capture() {
  const outputDir = path.join(__dirname, 'doc/images');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  // 1. Mobile Child View
  console.log('1/5 Capturing mobile_child_view.jpg...');
  const mobileChildContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });
  const mobileChildPage = await mobileChildContext.newPage();
  await mobileChildPage.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await mobileChildPage.waitForTimeout(1000);
  await mobileChildPage.screenshot({
    path: path.join(outputDir, 'mobile_child_view.jpg'),
    type: 'jpeg',
    quality: 92
  });
  await mobileChildContext.close();

  // 2. Mobile Parent View
  console.log('2/5 Capturing mobile_parent_view.jpg...');
  const mobileParentContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });
  const mobileParentPage = await mobileParentContext.newPage();
  await mobileParentPage.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await mobileParentPage.waitForTimeout(600);
  await unlockParentMode(mobileParentPage);
  await mobileParentPage.waitForTimeout(600);
  await mobileParentPage.screenshot({
    path: path.join(outputDir, 'mobile_parent_view.jpg'),
    type: 'jpeg',
    quality: 92
  });
  await mobileParentContext.close();

  // 3. Child Dashboard Laptop / Desktop
  console.log('3/5 Capturing child_dashboard_laptop.jpg...');
  const desktopChildContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2
  });
  const desktopChildPage = await desktopChildContext.newPage();
  await desktopChildPage.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await desktopChildPage.waitForTimeout(1000);
  await desktopChildPage.screenshot({
    path: path.join(outputDir, 'child_dashboard_laptop.jpg'),
    type: 'jpeg',
    quality: 92
  });
  await desktopChildContext.close();

  // 4. Parent Control Desktop
  console.log('4/5 Capturing parent_control_desktop.jpg...');
  const desktopParentContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2
  });
  const desktopParentPage = await desktopParentContext.newPage();
  await desktopParentPage.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await desktopParentPage.waitForTimeout(600);
  await unlockParentMode(desktopParentPage);
  await desktopParentPage.waitForTimeout(600);
  await desktopParentPage.screenshot({
    path: path.join(outputDir, 'parent_control_desktop.jpg'),
    type: 'jpeg',
    quality: 92
  });
  await desktopParentContext.close();

  // 5. Multi Device Overview (Desktop wide view with full cockpit)
  console.log('5/5 Capturing multi_device_overview.jpg...');
  const overviewContext = await browser.newContext({
    viewport: { width: 1600, height: 950 },
    deviceScaleFactor: 2
  });
  const overviewPage = await overviewContext.newPage();
  await overviewPage.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await overviewPage.waitForTimeout(1000);
  await overviewPage.screenshot({
    path: path.join(outputDir, 'multi_device_overview.jpg'),
    type: 'jpeg',
    quality: 92
  });
  await overviewContext.close();

  await browser.close();
  console.log('✅ All 5 authentic application screenshots successfully generated!');
}

capture().catch(err => {
  console.error('Error capturing screenshots:', err);
  process.exit(1);
});
