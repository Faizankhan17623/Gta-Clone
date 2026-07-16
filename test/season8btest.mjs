// Season 8 Batch B audit: the black-market arms dealer and the drug lab raid.
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

// ---- 1. both systems initialized ----
{
  const r = await ev(() => {
    const d = window.__debug;
    return {
      dealer: !!d.world.armsdealer && !d.world.armsdealer.open,
      lab: !!d.world.druglab && !d.world.druglab.active,
      crates: d.world.druglab?.crates.length === 3,
      labIdle: d.world.druglab?.foes.length === 0,
    };
  });
  check('Arms dealer + drug lab initialized', Object.values(r).every(Boolean), JSON.stringify(r));
}

// ---- 2. arms dealer: hint, menu, purchase ----
{
  await resetPlayer();
  await ev(() => {
    const d = window.__debug;
    const ad = d.world.armsdealer;
    d.teleport(ad.pos.x + 2, 0, ad.pos.z);
    d.world.money = 100000;
  });
  await page.waitForTimeout(250);
  const hint1 = await ev(() => window.__debug.world.armsHint);
  check('Dealer hint shows near the van', !!hint1 && hint1.includes('ARMS DEALER'), String(hint1));

  await page.keyboard.press('KeyE');
  await page.waitForTimeout(250);
  const open = await ev(() => window.__debug.world.armsdealer.open);
  check('E opens the dealer menu', open === true);

  const before = await ev(() => ({ mg: window.__debug.ammo.mg, money: window.__debug.world.money }));
  await page.keyboard.press('1');
  await page.waitForTimeout(250);
  const after = await ev(() => ({ mg: window.__debug.ammo.mg, money: window.__debug.world.money }));
  check('MG DRUM: +40 ammo for $900', after.mg === before.mg + 40 && after.money === before.money - 900,
    `mg ${before.mg}->${after.mg}, $${before.money}->$${after.money}`);
}

// ---- 3. arms dealer: RPG rounds are rep-gated ----
{
  await ev(() => { window.__debug.world.rep = 0; });
  const rpgBefore = await ev(() => window.__debug.ammo.rpg);
  await page.keyboard.press('5');
  await page.waitForTimeout(250);
  const rpgLocked = await ev(() => window.__debug.ammo.rpg);
  check('RPG locked at 0 rep', rpgLocked === rpgBefore);

  await ev(() => { window.__debug.world.rep = 2000; });
  await page.keyboard.press('5');
  await page.waitForTimeout(250);
  const rpgAfter = await ev(() => window.__debug.ammo.rpg);
  check('RPG unlocks at 1500+ rep (+3 rounds)', rpgAfter === rpgBefore + 3, `rpg ${rpgBefore}->${rpgAfter}`);

  await page.keyboard.press('KeyE'); // leave the menu
  await page.waitForTimeout(200);
  const closed = await ev(() => window.__debug.world.armsdealer.open);
  check('E closes the dealer menu', closed === false);
}

// ---- 4. drug lab: approach triggers the raid ----
{
  await resetPlayer();
  await ev(() => {
    const d = window.__debug;
    const dl = d.world.druglab;
    d.teleport(dl.pos.x + 10, 0, dl.pos.z);
  });
  await page.waitForTimeout(400);
  const r = await ev(() => {
    const d = window.__debug;
    const dl = d.world.druglab;
    return { active: dl.active, foes: dl.foes.length, blip: !!d.world.druglabBlip };
  });
  check('Raid triggers on approach (3 cookers + blip)', r.active && r.foes === 3 && r.blip, JSON.stringify(r));
}

// ---- 5. drug lab: clear cookers, torch crates, payout ----
{
  const moneyBefore = await ev(() => window.__debug.world.money);
  await ev(() => {
    for (const f of window.__debug.world.druglab.foes) { f.target.hit(); f.target.hit(); }
  });
  await page.waitForFunction(() => (window.__debug.world.druglabHint || '').includes('CRATES'), null, { timeout: 5000 }).catch(() => {});
  const midHint = await ev(() => window.__debug.world.druglabHint);
  check('Cookers down, crate phase hinted', !!midHint && midHint.includes('CRATES'), String(midHint));

  await ev(() => {
    for (const c of window.__debug.world.druglab.crates) { c.target.hit(); c.target.hit(); }
  });
  await page.waitForTimeout(300);
  const r = await ev(() => {
    const d = window.__debug;
    const dl = d.world.druglab;
    return { active: dl.active, doneDay: dl.doneDay, day: d.world.dailyDay, money: d.world.money };
  });
  check('Lab shut down: payout lands, done for the day',
    !r.active && r.doneDay === r.day && r.money > moneyBefore,
    `$${moneyBefore}->$${r.money}, doneDay ${r.doneDay}/${r.day}`);

  const saved = await ev(() => JSON.parse(localStorage.getItem('opencity-save-v1') || '{}'));
  check('druglabDay persists in the save', saved.druglabDay === r.doneDay, `saved ${saved.druglabDay}`);
}

// ---- 6. drug lab: crates + cookers respawn for the next day's raid ----
{
  await resetPlayer();
  await ev(() => { window.__debug.world.druglab.doneDay = -99; }); // fake a new day
  await ev(() => {
    const d = window.__debug;
    const dl = d.world.druglab;
    d.teleport(dl.pos.x + 10, 0, dl.pos.z);
  });
  await page.waitForTimeout(400);
  const r = await ev(() => {
    const dl = window.__debug.world.druglab;
    return {
      active: dl.active,
      foes: dl.foes.filter((f) => !f.dead).length,
      crates: dl.crates.filter((c) => !c.dead && c.mesh.visible).length,
    };
  });
  check('Second raid: 3 fresh cookers + 3 restored crates', r.active && r.foes === 3 && r.crates === 3, JSON.stringify(r));
}

// ---- 7. no console errors ----
check('No page errors during the run', errors === 0, `${errors} errors`);

const fails = results.filter(([, ok]) => !ok).length;
console.log(`\n${results.length - fails}/${results.length} checks passed`);
await browser.close();
process.exit(fails ? 1 : 0);
