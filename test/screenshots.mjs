// Visual check: screenshots at noon, dusk and night.
import { chromium } from 'playwright-core';

const PORT = process.env.PORT || 8081;
let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
} catch {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
}

const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
let errors = 0;
page.on('pageerror', (e) => { errors++; console.log('PAGE ERROR:', e.message); });

await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__debug, null, { timeout: 15000 });
await page.click('#playbtn');
await page.waitForTimeout(800);

for (const [name, hour] of [['noon', 13], ['dusk', 18.8], ['night', 23]]) {
  await page.evaluate((h) => {
    window.__debug.setClock(h);
    window.__debug.setCamYaw(0.6);
  }, hour);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `D:/practice/game/test/shot-${name}.png` });
  console.log(`saved shot-${name}.png`);
}

const clockText = await page.evaluate(() => document.getElementById('clock').textContent);
console.log('HUD clock shows:', clockText);
console.log(`runtime errors: ${errors}`);
await browser.close();
