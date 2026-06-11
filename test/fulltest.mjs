// Full gameplay smoke test: movement, driving + steering, weapons, helicopter.
import { chromium } from 'playwright-core';

let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
} catch {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
}

const page = await browser.newPage();
let errors = 0;
page.on('pageerror', (e) => { errors++; console.log('PAGE ERROR:', e.message); });

await page.goto(`http://localhost:${process.env.PORT || 8080}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__debug, null, { timeout: 15000 });
await page.click('#playbtn');
await page.waitForTimeout(600);

const ev = (fn) => page.evaluate(fn);

// --- 1. on-foot movement, all four keys (via e.code path) ---
for (const key of ['KeyW', 'KeyS', 'KeyA', 'KeyD']) {
  await ev(() => window.__debug.setCamYaw(0));
  const a = await ev(() => ({ x: window.__debug.player.pos.x, z: window.__debug.player.pos.z }));
  await page.keyboard.down(key);
  await page.waitForTimeout(450);
  await page.keyboard.up(key);
  await page.waitForTimeout(150);
  const b = await ev(() => ({ x: window.__debug.player.pos.x, z: window.__debug.player.pos.z }));
  const moved = Math.hypot(b.x - a.x, b.z - a.z);
  console.log(`${key}: moved ${moved.toFixed(2)}m ${moved > 1 ? 'PASS' : 'FAIL'}`);
}

// --- 2. layout-independent path: synthesize keydown with wrong code but key='d' ---
{
  await ev(() => window.__debug.setCamYaw(0));
  const a = await ev(() => ({ x: window.__debug.player.pos.x, z: window.__debug.player.pos.z }));
  await ev(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH', key: 'd' })));
  await page.waitForTimeout(450);
  await ev(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyH', key: 'd' })));
  await page.waitForTimeout(100);
  const b = await ev(() => ({ x: window.__debug.player.pos.x, z: window.__debug.player.pos.z }));
  const moved = Math.hypot(b.x - a.x, b.z - a.z);
  console.log(`non-QWERTY 'd': moved ${moved.toFixed(2)}m ${moved > 1 ? 'PASS' : 'FAIL'}`);
}

// --- 3. weapon switching ---
{
  await page.keyboard.press('Digit2');
  await page.waitForTimeout(120);
  const w = await ev(() => window.__debug.world.weaponName);
  console.log(`weapon switch: ${w} ${w === 'MACHINE GUN' ? 'PASS' : 'FAIL'}`);
  await page.keyboard.press('Digit1');
}

// --- 4. driving: teleport next to a parked car, enter, drive, steer with D ---
{
  await ev(() => {
    const d = window.__debug;
    const car = d.world.parked[0];
    d.player.pos.set(car.pos.x + 2.5, 0, car.pos.z);
  });
  await page.waitForTimeout(200);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(200);
  const inCar = await ev(() => !!window.__debug.player.inCar);
  console.log(`enter car: ${inCar ? 'PASS' : 'FAIL'}`);

  await page.keyboard.down('KeyW');
  await page.waitForTimeout(900);
  const h0 = await ev(() => window.__debug.player.inCar?.heading ?? 0);
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(700);
  await page.keyboard.up('KeyD');
  await page.keyboard.up('KeyW');
  const h1 = await ev(() => window.__debug.player.inCar?.heading ?? 0);
  const speed = await ev(() => window.__debug.player.inCar?.vel.length() ?? 0);
  console.log(`drive: speed ${speed.toFixed(1)} m/s ${speed > 3 ? 'PASS' : 'FAIL'}`);
  console.log(`steer D: heading change ${(h1 - h0).toFixed(2)} rad ${h1 < h0 - 0.15 ? 'PASS (turns right)' : 'FAIL'}`);
  await page.waitForTimeout(800);
  await page.keyboard.press('KeyE'); // exit
  await page.waitForTimeout(300);
}

// --- 5. helicopter: teleport to helipad, enter, take off ---
{
  await ev(() => {
    const d = window.__debug;
    const h = d.world.helis[0];
    d.player.inCar = null;
    d.player.pos.set(h.pos.x + 4, 0, h.pos.z);
  });
  await page.waitForTimeout(200);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(200);
  const inHeli = await ev(() => !!window.__debug.player.inHeli);
  console.log(`enter heli: ${inHeli ? 'PASS' : 'FAIL'}`);

  await page.keyboard.down('Space');
  await page.waitForTimeout(1500);
  await page.keyboard.up('Space');
  const alt = await ev(() => window.__debug.player.inHeli?.pos.y ?? 0);
  console.log(`heli takeoff: altitude ${alt.toFixed(1)}m ${alt > 5 ? 'PASS' : 'FAIL'}`);
}

// --- 6. police helicopter spawn at 3 stars ---
{
  await ev(() => { window.__debug.world.wanted = 3; window.__debug.world.wantedTimer = 0; });
  await page.waitForTimeout(1200);
  const n = await ev(() => window.__debug.world.policeHelis.length);
  console.log(`police heli at 3 stars: ${n} ${n >= 1 ? 'PASS' : 'FAIL'}`);
  await ev(() => { window.__debug.world.wanted = 0; });
}

await page.waitForTimeout(1500);
console.log(`runtime errors: ${errors} ${errors === 0 ? 'PASS' : 'FAIL'}`);
await browser.close();
