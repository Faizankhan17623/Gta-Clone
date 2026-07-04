// Mobile playability test: emulate a phone (touch, no pointer lock) and drive
// the game through the virtual joystick and buttons.
import { chromium, devices } from 'playwright-core';

let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
} catch {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
}
const context = await browser.newContext({ ...devices['Pixel 5'] });
const page = await context.newPage();
let errors = 0;
page.on('pageerror', (e) => { errors++; console.log('PAGE ERROR:', e.message); });

await page.goto(`http://localhost:${process.env.PORT || 8080}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__debug, null, { timeout: 20000 });
await page.tap('#playbtn');
await page.waitForTimeout(700);

const ev = (fn, arg) => page.evaluate(fn, arg);

// touch UI appears on a touch device
const ui = await ev(() => ({
  ui: !!document.getElementById('touchui'),
  pad: !!document.getElementById('joypad'),
  web: !!document.getElementById('btn-web'),
}));
console.log(`touch UI present: ${ui.ui && ui.pad && ui.web ? 'PASS' : 'FAIL'}`);

// synthetic touch helper lives in the page
await ev(() => {
  window.__touch = (elId, type, dx = 0, dy = 0, id = 7) => {
    const el = document.getElementById(elId);
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2 + dx;
    const y = r.top + r.height / 2 + dy;
    const t = new Touch({ identifier: id, target: el, clientX: x, clientY: y });
    el.dispatchEvent(new TouchEvent(type, {
      changedTouches: [t],
      touches: type === 'touchend' ? [] : [t],
      bubbles: true,
      cancelable: true,
    }));
  };
});

// joystick pushes the player forward
{
  const a = await ev(() => {
    const d = window.__debug;
    d.setCamYaw(0);
    d.player.vel.set(0, 0, 0);
    return { x: d.player.pos.x, z: d.player.pos.z };
  });
  await ev(() => { window.__touch('joypad', 'touchstart'); window.__touch('joypad', 'touchmove', 0, -40); });
  await page.waitForTimeout(700);
  await ev(() => window.__touch('joypad', 'touchend'));
  const b = await ev(() => ({ x: window.__debug.player.pos.x, z: window.__debug.player.pos.z }));
  const moved = Math.hypot(b.x - a.x, b.z - a.z);
  console.log(`joystick move: ${moved.toFixed(2)}m ${moved > 1 ? 'PASS' : 'FAIL'}`);
}

// jump button
{
  await ev(() => window.__touch('btn-jump', 'touchstart'));
  await page.waitForTimeout(150);
  const vy = await ev(() => window.__debug.player.vy);
  await ev(() => window.__touch('btn-jump', 'touchend'));
  console.log(`jump button: vy=${vy.toFixed(1)} ${vy > 2 ? 'PASS' : 'FAIL'}`);
  await page.waitForTimeout(800);
}

// web button swings without pointer lock
{
  await ev(() => {
    const d = window.__debug;
    const c = d.world.city.colliders.find((c) => c.h >= 40);
    d.player.pos.set((c.x0 + c.x1) / 2, 0, c.z0 - 12);
    d.player.vel.set(0, 0, 0);
    d.player.vy = 0;
    d.setCamYaw(0);
  });
  await page.waitForTimeout(400);
  await ev(() => window.__touch('btn-web', 'touchstart'));
  await page.waitForTimeout(700);
  const s = await ev(() => ({ att: window.__debug.web.attached, y: window.__debug.player.pos.y }));
  await ev(() => window.__touch('btn-web', 'touchend'));
  console.log(`web button swings: airborne ${s.y.toFixed(1)}m ${s.att && s.y > 0.3 ? 'PASS' : 'FAIL'}`);
  await page.waitForTimeout(1500);
}

// fire button shoots without pointer lock
{
  await ev(() => { window.__debug.world.wanted = 0; });
  const shots = await ev(async () => {
    const d = window.__debug;
    const before = d.world.lastShot;
    window.__touch('btn-fire', 'touchstart');
    await new Promise((r) => setTimeout(r, 400));
    window.__touch('btn-fire', 'touchend');
    return d.world.lastShot !== before;
  });
  console.log(`fire button shoots: ${shots ? 'PASS' : 'FAIL'}`);
  await ev(() => { window.__debug.world.wanted = 0; });
}

// kiosk digit buttons appear at the casino
{
  await ev(() => {
    const d = window.__debug;
    d.player.inCar = null;
    d.player.pos.copy(d.shops.casinoPos);
    d.player.vel.set(0, 0, 0);
  });
  await page.waitForTimeout(500);
  const shown = await ev(() =>
    [...document.querySelectorAll('.kioskbtn')].some((b) => b.style.display !== 'none'));
  console.log(`kiosk digit buttons: ${shown ? 'PASS' : 'FAIL'}`);
  await ev(() => { window.__debug.player.pos.x += 30; });
}

await page.waitForTimeout(800);
console.log(`mobile runtime errors: ${errors} ${errors === 0 ? 'PASS' : 'FAIL'}`);
await browser.close();
