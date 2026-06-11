// Automated movement test: loads the game, presses WASD, reports player movement.
import { chromium } from 'playwright-core';

let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
} catch {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
}

const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text()); });

await page.goto('http://localhost:8080', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__debug, null, { timeout: 15000 });
await page.click('#playbtn');
await page.waitForTimeout(600);

// pin the camera so directions are deterministic (yaw 0 => looking along +z)
await page.evaluate(() => window.__debug.setCamYaw(0));

const read = () => page.evaluate(() => {
  const p = window.__debug.player;
  return { x: p.pos.x, z: p.pos.z, cam: window.__debug.getCamYaw() };
});

for (const key of ['KeyW', 'KeyS', 'KeyA', 'KeyD']) {
  await page.evaluate(() => window.__debug.setCamYaw(0));
  const a = await read();
  await page.keyboard.down(key);
  await page.waitForTimeout(600);
  await page.keyboard.up(key);
  await page.waitForTimeout(200);
  const b = await read();
  console.log(`${key}: dx=${(b.x - a.x).toFixed(2)} dz=${(b.z - a.z).toFixed(2)} (camYaw ${a.cam.toFixed(2)})`);
}

console.log('Expected with camYaw=0: W => +z, S => -z, D => -x (screen right), A => +x (screen left)');
await browser.close();
