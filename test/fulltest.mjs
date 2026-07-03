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
  console.log(`weapon switch: ${w} ${w.startsWith('MACHINE GUN') ? 'PASS' : 'FAIL'}`);
  await page.keyboard.press('Digit1');
}

// --- 3.5 web swing: face a tall building, fire, reel up, release, land ---
{
  const ok = await ev(() => {
    const d = window.__debug;
    // stand south of a tall building and look straight at it (+z)
    const c = d.world.city.colliders.find((c) => c.h >= 40);
    if (!c) return false;
    d.player.pos.set((c.x0 + c.x1) / 2, 0, c.z0 - 12);
    d.player.vy = 0;
    d.setCamYaw(0);
    return true;
  });
  await page.waitForTimeout(400); // let the camera settle behind the player
  await page.mouse.down({ button: 'right' }); // swinging lasts while the button is held
  // the game may have fired already from the held button if pointer lock was granted
  const attached = await ev(() => window.__debug.startSwing() || window.__debug.web.attached);
  console.log(`web attach: ${ok && attached ? 'PASS' : 'FAIL'}`);

  await page.keyboard.down('Space'); // reel in for height
  await page.waitForTimeout(900);
  await page.keyboard.up('Space');
  const mid = await ev(() => ({
    y: window.__debug.player.pos.y,
    att: window.__debug.web.attached,
    sp: window.__debug.player.vel.length(),
  }));
  console.log(`web swing: height ${mid.y.toFixed(1)}m speed ${mid.sp.toFixed(1)} m/s ${mid.att && mid.y > 2 ? 'PASS' : 'FAIL'}`);

  await page.mouse.up({ button: 'right' }); // let go mid-swing
  await page.waitForTimeout(2000);
  const after = await ev(() => ({
    att: window.__debug.web.attached,
    ground: window.__debug.player.onGround,
    y: window.__debug.player.pos.y,
  }));
  console.log(`web release + land: y ${after.y.toFixed(1)} ${!after.att && after.ground ? 'PASS' : 'FAIL'}`);
  await ev(() => { const d = window.__debug; d.player.health = 100; d.player.pos.y = 0; d.player.vy = 0; });
}

// --- 3.6 traversal: chained swings down a street carry you across blocks ---
{
  const start = await ev(() => {
    const d = window.__debug;
    // stand on a north-south road with buildings flanking both sides
    d.player.pos.set(d.world.city.roadXs[2], 0, -180);
    d.player.vy = 0;
    d.player.vel.set(0, 0, 0);
    d.setCamYaw(0); // travel +z
    return { x: d.player.pos.x, z: d.player.pos.z };
  });
  await page.waitForTimeout(400);
  await page.keyboard.down('KeyW'); // pump the swing
  for (let i = 0; i < 3; i++) {
    await page.mouse.down({ button: 'right' });
    await ev(() => window.__debug.startSwing()); // no-op if pointer lock already fired it
    await page.waitForTimeout(1800); // longer arcs now — ride the full swing
    await page.mouse.up({ button: 'right' }); // release at speed, glide, re-fire
    await page.waitForTimeout(600);
  }
  await page.keyboard.up('KeyW');
  const end = await ev(() => ({ x: window.__debug.player.pos.x, z: window.__debug.player.pos.z }));
  const dist = Math.hypot(end.x - start.x, end.z - start.z);
  console.log(`web traversal: covered ${dist.toFixed(0)}m in 3 chained swings ${dist > 50 ? 'PASS' : 'FAIL'}`);
  await page.waitForTimeout(1500); // let the player land
  // if a rough landing wasted the player, sit out the game-over screen
  const state = await ev(() => window.__debug.getState());
  if (state !== 'play') console.log(`(note: traversal ended ${state}, waiting for respawn)`);
  await page.waitForFunction(() => window.__debug.getState() === 'play', null, { timeout: 8000 });
  await ev(() => {
    const d = window.__debug;
    d.stopSwing();
    d.player.health = 100;
    d.player.pos.y = 0;
    d.player.vy = 0;
    d.player.vel.set(0, 0, 0); // shed the swing speed or we slide off the next teleport
    d.player.glide = false;
  });
}

// --- 4. driving: teleport next to a parked car, enter, drive, steer with D ---
{
  await ev(() => {
    const d = window.__debug;
    const car = d.world.parked[0];
    d.player.pos.set(car.pos.x + 2.5, 0, car.pos.z);
    d.player.vel.set(0, 0, 0);
    d.player.vy = 0;
  });
  await page.waitForTimeout(200);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(200);
  const inCar = await ev(() => !!window.__debug.player.inCar);
  console.log(`enter car: ${inCar ? 'PASS' : 'FAIL'}`);

  // face down an empty road so the drive isn't blocked by whatever the
  // random parking spot happened to point at
  await ev(() => {
    const d = window.__debug;
    const car = d.player.inCar;
    if (!car) return;
    car.pos.set(d.world.city.roadXs[1], car.pos.y, -200);
    car.heading = 0; // +z, straight down the road
    car.vel.set(0, 0, 0);
    d.setCamYaw(0);
  });
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

// --- 7. new city features ---
{
  // back on foot, clean slate
  await ev(() => {
    const d = window.__debug;
    d.player.inHeli = null;
    d.player.mesh.visible = true;
    d.world.wanted = 0;
    d.player.pos.set(d.world.city.spawn.x + 6, 0, d.world.city.spawn.z);
    d.player.vy = 0;
  });
  await page.waitForTimeout(300);

  // 7a. web attack pins a pedestrian
  await ev(() => {
    const d = window.__debug;
    const p = d.world.peds[0];
    p.dead = false;
    p.webT = 0;
    p.pos.set(d.player.pos.x, 0, d.player.pos.z + 8);
    d.setCamYaw(0);
    d.setCamPitch(-0.1); // aim flat so the ray reaches the ped, not the road
  });
  await page.waitForTimeout(500);
  await ev(() => window.__debug.webAttack());
  // any ped pinned counts — bystanders sometimes wander into the shot
  const webbed = await ev(() => window.__debug.world.peds.some((p) => p.webT > 0));
  console.log(`web attack (Q): ${webbed ? 'PASS' : 'FAIL'}`);

  // 7b. robbing a store pays out
  const before = await ev(() => {
    const d = window.__debug;
    const s = d.shops.shops[0];
    s.cd = 0;
    d.player.pos.set(s.pos.x, 0, s.pos.z + 1);
    return d.world.money;
  });
  await page.waitForTimeout(200);
  await page.keyboard.down('KeyE');
  await page.waitForTimeout(2200);
  await page.keyboard.up('KeyE');
  const after = await ev(() => window.__debug.world.money);
  console.log(`rob store: +$${after - before} ${after - before >= 250 ? 'PASS' : 'FAIL'}`);
  await ev(() => { window.__debug.world.wanted = 0; });

  // 7c. gang territory exists and is hostile
  const gangOk = await ev(() => {
    const g = window.__debug.gang;
    return g && !g.owned && g.members.filter((m) => !m.dead).length >= 8;
  });
  console.log(`gang territory: ${gangOk ? 'PASS' : 'FAIL'}`);

  // 7d. motorbike: find one, ride it on an open road
  const bikeFound = await ev(() => {
    const d = window.__debug;
    const bike = d.world.parked.find((v) => v.bike && !v.dead);
    if (!bike) return false;
    d.player.pos.set(bike.pos.x + 2, 0, bike.pos.z);
    return true;
  });
  await page.waitForTimeout(200);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(200);
  await ev(() => {
    const d = window.__debug;
    const b = d.player.inCar;
    if (!b) return;
    b.pos.set(d.world.city.roadXs[3], b.pos.y, -150);
    b.heading = 0;
    b.vel.set(0, 0, 0);
    d.setCamYaw(0);
  });
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1000);
  await page.keyboard.up('KeyW');
  const bikeSpeed = await ev(() => window.__debug.player.inCar?.vel.length() ?? 0);
  console.log(`motorbike: found ${bikeFound}, speed ${bikeSpeed.toFixed(1)} m/s ${bikeFound && bikeSpeed > 4 ? 'PASS' : 'FAIL'}`);
  await page.waitForTimeout(600);
  await page.keyboard.press('KeyE'); // hop off

  // 7e. five stars brings the tank
  await ev(() => { window.__debug.world.wanted = 5; window.__debug.world.wantedTimer = 0; });
  await page.waitForTimeout(1500);
  const tanks = await ev(() => window.__debug.world.tanks.filter((t) => !t.dead).length);
  console.log(`army tank at 5 stars: ${tanks} ${tanks >= 1 ? 'PASS' : 'FAIL'}`);
  await ev(() => { window.__debug.world.wanted = 0; });
}

await page.waitForTimeout(1500);
console.log(`runtime errors: ${errors} ${errors === 0 ? 'PASS' : 'FAIL'}`);
await browser.close();
