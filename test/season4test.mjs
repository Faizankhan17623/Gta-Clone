// Season 4 audit: spire gauntlet, swing races, firefighting, the museum
// lift, pier fishing, the Neon Palace, the skateboard, and web gadgets.
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

await page.goto(`http://localhost:${process.env.PORT || 8081}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__debug, null, { timeout: 15000 });
await page.evaluate(() => localStorage.clear());
await page.click('#playbtn');
await page.waitForTimeout(500);

const ev = (fn, arg) => page.evaluate(fn, arg);
const results = [];
const check = (name, ok, note = '') => {
  results.push([name, ok, note]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? ' — ' + note : ''}`);
};

async function resetPlayer() {
  await ev(() => {
    const d = window.__debug;
    if (d.getState() === 'cards') d.leaveCards();
    d.stopSwing();
    if (d.player.inCar) { d.player.inCar.vel.set(0, 0, 0); d.player.inCar = null; }
    d.player.inHeli = null;
    d.player.inBoat = null;
    d.player.inPlane = null;
    if (d.diving()) d.diving().on = false;
    d.player.swim = false;
    d.player.mesh.visible = true;
    d.player.pos.set(d.world.city.spawn.x + 5, 0, d.world.city.spawn.z + 5);
    d.player.vel.set(0, 0, 0);
    d.player.vy = 0;
    d.player.health = d.world.maxHealth;
    d.world.wanted = 0;
    d.world.wantedTimer = 0;
  });
  await page.waitForTimeout(150);
}

// ---- 1. all systems initialized ----
{
  const r = await ev(() => {
    const d = window.__debug;
    return {
      gauntlet: !!d.gauntlet() && !d.gauntlet().active && d.gauntlet().rings.length === 8,
      swing: !!d.swingrace() && d.swingrace().courses.length === 3,
      fire: !!d.firefight() && !!d.firefight().truck,
      museum: !!d.museum() && !d.museum().carrying,
      fishing: !!d.fishing() && d.fishing().state === 'idle',
      club: !!d.club() && !d.club().owned,
      skate: !!d.skate() && !d.skate().owned,
      gadgets: 'electro' in d.world.upgrades && 'magnet' in d.world.upgrades,
    };
  });
  check('All 8 Season-4 systems initialized', Object.values(r).every(Boolean), JSON.stringify(r));
}

// ---- 2. spire gauntlet: rings + the WARDEN ----
{
  await resetPlayer();
  await ev(() => {
    const d = window.__debug;
    const gt = d.gauntlet();
    d.teleport(gt.startPos.x, 0, gt.startPos.z);
  });
  await page.waitForTimeout(250);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(300);
  const r1 = await ev(() => window.__debug.gauntlet().active);
  check('Gauntlet starts (8 rings lit)', r1 === true);

  for (let i = 0; i < 8; i++) {
    await ev(() => {
      const d = window.__debug;
      const gt = d.gauntlet();
      if (gt.idx < gt.rings.length) {
        const r = gt.rings[gt.idx].position;
        d.teleport(r.x, r.y, r.z);
      }
    });
    await page.waitForTimeout(180);
  }
  const r2 = await ev(() => ({ idx: window.__debug.gauntlet().idx, boss: !!window.__debug.gauntlet().boss }));
  check('Gauntlet: all rings threaded, WARDEN spawns', r2.idx === 8 && r2.boss);

  const money0 = await ev(() => window.__debug.world.money);
  await ev(() => {
    const d = window.__debug;
    const b = d.gauntlet().boss;
    for (let i = 0; i < 12 && !b.dead; i++) b.target.hit(d.world);
  });
  await page.waitForTimeout(400);
  const r3 = await ev(() => ({ active: window.__debug.gauntlet().active, money: window.__debug.world.money, n: window.__debug.world.stats.gauntlets }));
  check('Gauntlet: WARDEN down, summit paid', !r3.active && r3.money === money0 + 8000 && r3.n === 1, `+$${r3.money - money0}`);
}

// ---- 3. swing race: course 0 gold ----
{
  await resetPlayer();
  await ev(() => {
    const d = window.__debug;
    const c = d.swingrace().courses[0];
    d.teleport(c.padPos.x, 0, c.padPos.z);
  });
  await page.waitForTimeout(250);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(300);
  const r1 = await ev(() => !!window.__debug.swingrace().active);
  check('Swing race starts', r1 === true);

  const money0 = await ev(() => window.__debug.world.money);
  for (let i = 0; i < 8; i++) {
    await ev(() => {
      const d = window.__debug;
      const sw = d.swingrace();
      if (sw.active && sw.idx < sw.active.rings.length) {
        const p = sw.active.rings[sw.idx].position;
        d.teleport(p.x, p.y, p.z);
      }
    });
    await page.waitForTimeout(150);
  }
  const r2 = await ev(() => ({
    active: !!window.__debug.swingrace().active,
    best: window.__debug.swingrace().courses[0].best,
    money: window.__debug.world.money,
  }));
  check('Swing race: gold finish, best time saved', !r2.active && r2.money === money0 + 1500 && r2.best != null,
    `best ${r2.best?.toFixed(1)}s, +$${r2.money - money0}`);
}

// ---- 4. firefighting from the cab of Engine 7 ----
{
  await resetPlayer();
  await ev(() => window.__debug.forceFire());
  await page.waitForTimeout(600);
  const r1 = await ev(() => window.__debug.firefight().fires.length);
  check('Fire event ignites', r1 >= 2, `${r1} fires`);

  const money0 = await ev(() => {
    const d = window.__debug;
    const ff = d.firefight();
    const f = ff.fires[0];
    d.enterCarDirect(ff.truck);
    ff.truck.pos.set(f.pos.x - 8, 0, f.pos.z);
    ff.truck.heading = Math.atan2(f.pos.x - ff.truck.pos.x, f.pos.z - ff.truck.pos.z);
    ff.truck.vel.set(0, 0, 0);
    return d.world.money;
  });
  await page.waitForTimeout(250);
  await page.keyboard.down('KeyF');
  await page.waitForTimeout(4200); // fires take ~3s of hose each
  await page.keyboard.up('KeyF');
  const r2 = await ev(() => ({ money: window.__debug.world.money, out: window.__debug.world.stats.firesOut }));
  check('Hose douses a blaze (+$400)', r2.money >= money0 + 400 && r2.out >= 1, `+$${r2.money - money0}`);
  await ev(() => { // put out the rest quietly
    const d = window.__debug;
    const ff = d.firefight();
    for (const f of [...ff.fires]) { d.world.scene.remove(f.mesh); }
    ff.fires.length = 0;
  });
}

// ---- 5. museum lift + fence ----
{
  await resetPlayer();
  await ev(() => {
    const d = window.__debug;
    d.setClock(23);
    const m = d.museum();
    d.teleport(m.pedPos.x, 0, m.pedPos.z + 1);
  });
  await page.waitForTimeout(250);
  await page.keyboard.down('KeyE');
  await page.waitForTimeout(2600);
  await page.keyboard.up('KeyE');
  const r1 = await ev(() => window.__debug.museum().carrying);
  check('Museum: golden canvas lifted', r1 === true);

  const money0 = await ev(() => {
    const d = window.__debug;
    const m = d.museum();
    d.teleport(m.fencePos.x + 1, 0, m.fencePos.z + 1);
    return d.world.money;
  });
  await page.waitForTimeout(400);
  const r2 = await ev(() => ({
    carrying: window.__debug.museum().carrying,
    money: window.__debug.world.money,
    day: window.__debug.museum().doneDay,
  }));
  check('Museum: canvas fenced (+$6000, once a day)', !r2.carrying && r2.money === money0 + 6000 && r2.day >= 0,
    `+$${r2.money - money0}`);
}

// ---- 6. fishing off the pier ----
{
  await resetPlayer();
  await ev(() => {
    const d = window.__debug;
    const f = d.fishing();
    d.teleport(f.spot.x + 1, 1.35, f.spot.z);
  });
  await page.waitForTimeout(300);
  await page.keyboard.press('KeyE'); // cast
  await page.waitForTimeout(250);
  await ev(() => { window.__debug.fishing().t = 0.01; }); // hurry the bite
  await page.waitForTimeout(300);
  const bit = await ev(() => window.__debug.fishing().state);
  const money0 = await ev(() => window.__debug.world.money);
  await page.keyboard.press('KeyE'); // set the hook
  await page.waitForTimeout(300);
  const r = await ev(() => ({ money: window.__debug.world.money, fish: window.__debug.world.stats.fish, state: window.__debug.fishing().state }));
  check('Fishing: cast, bite, catch', bit === 'bite' && r.fish === 1 && r.money > money0 && r.state === 'idle',
    `+$${r.money - money0}`);
}

// ---- 7. the Neon Palace: buy + dance ----
{
  await resetPlayer();
  await ev(() => {
    const d = window.__debug;
    d.world.money = 15000;
    const cl = d.club();
    d.teleport(cl.doorPos.x, 0, cl.doorPos.z + 1);
  });
  await page.waitForTimeout(250);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(300);
  const r1 = await ev(() => ({ owned: window.__debug.club().owned, money: window.__debug.world.money }));
  check('Club: Neon Palace bought', r1.owned && r1.money === 3000);

  await ev(() => {
    const d = window.__debug;
    const cl = d.club();
    cl.danceCd = 0;
    d.teleport(cl.padPos.x, 0, cl.padPos.z);
  });
  await page.waitForTimeout(250);
  await page.keyboard.press('KeyE'); // start the dance
  await page.waitForTimeout(300);
  const seq = await ev(() => window.__debug.club().dance?.seq || []);
  check('Club: dance sequence dealt', seq.length === 5, seq.join(','));
  for (const k of seq) {
    await page.keyboard.press(k.replace('Key', ''));
    await page.waitForTimeout(180);
  }
  const r2 = await ev(() => ({ dance: !!window.__debug.club().dance, money: window.__debug.world.money, n: window.__debug.world.stats.dances }));
  check('Club: full combo pays tips', !r2.dance && r2.money === 3250 && r2.n === 1, `$${r2.money}`);
}

// ---- 8. skateboard ----
{
  await resetPlayer();
  await ev(() => {
    const d = window.__debug;
    d.world.money = 1000;
    const sk = d.skate();
    d.teleport(sk.shackPos.x + 1, 0, sk.shackPos.z + 1);
  });
  await page.waitForTimeout(250);
  await page.keyboard.press('KeyE'); // buy the deck
  await page.waitForTimeout(250);
  await page.keyboard.press('KeyK'); // kick it out
  await page.waitForTimeout(250);
  const r = await ev(() => ({
    owned: window.__debug.skate().owned,
    on: window.__debug.skate().on,
    flag: window.__debug.world.skateOn,
    money: window.__debug.world.money,
  }));
  check('Skateboard: deck bought, K rides it', r.owned && r.on && r.flag && r.money === 200);
  await page.keyboard.press('KeyK'); // pocket it
}

// ---- 9. web gadgets at the den ----
{
  await resetPlayer();
  await ev(() => {
    const d = window.__debug;
    d.world.money = 5000;
    const den = d.shops.denPos;
    d.teleport(den.x + 1, 0, den.z + 1);
  });
  await page.waitForTimeout(350);
  await page.keyboard.press('Digit4'); // electro-web
  await page.waitForTimeout(250);
  await page.keyboard.press('Digit5'); // magnet webs
  await page.waitForTimeout(250);
  const r = await ev(() => ({
    electro: window.__debug.world.upgrades.electro,
    magnet: window.__debug.world.upgrades.magnet,
    money: window.__debug.world.money,
  }));
  check('Gadgets: electro-web + magnet webs fitted', r.electro && r.magnet && r.money === 2500, `$${r.money} left`);
}

// ---- 10. save round-trip ----
{
  await ev(() => window.__debug.world.onSave());
  const r = await ev(() => {
    const s = JSON.parse(localStorage.getItem('opencity-save-v1'));
    return {
      swing: s.swingBest && s.swingBest.downtown != null,
      museum: typeof s.museumDay === 'number' && s.museumDay >= 0,
      club: s.club === true,
      deck: s.deck === true,
      gadgets: s.upg?.electro === true && s.upg?.magnet === true,
    };
  });
  check('Season 4 progress persists', Object.values(r).every(Boolean), JSON.stringify(r));
}

console.log(`\n${results.filter((r) => r[1]).length}/${results.length} passed, ${errors} page errors`);
await browser.close();
process.exit(results.every((r) => r[1]) && errors === 0 ? 0 : 1);
