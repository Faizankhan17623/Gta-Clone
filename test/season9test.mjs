// Season 9 audit: THE BIG FIVE-O — street vendors, ATMs, payphones,
// pigeons, graffiti, hydrants, speed cams, meters, emotes, vehicle fx,
// bodyguard, wildlife, gym, fortune teller, street dice, Old Moses,
// and ten new cheat codes.
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
    d.world.money = 100000;
  });
  await page.waitForTimeout(150);
}

async function goTo(getPos, dx = 1.5, dz = 0) {
  await ev(({ src, dx, dz }) => {
    const d = window.__debug;
    const p = new Function('d', `return ${src}`)(d);
    d.teleport(p.x + dx, 0, p.z + dz);
  }, { src: getPos, dx, dz });
  await page.waitForTimeout(350);
}

// ---- 1. all 16 season-9 systems initialized ----
{
  const r = await ev(() => {
    const d = window.__debug;
    const w = d.world;
    return {
      vendors: w.vendors?.carts.length === 3,
      bank: !!w.bank && w.bank.machines.length === 6,
      phones: w.payphone?.booths.length === 5,
      pigeons: w.pigeonNet?.birds.length === 25,
      graffiti: w.graffiti?.spots.length === 10,
      hydrants: (w.hydrants?.plugs.length || 0) > 0,
      cams: w.speedcams?.cams.length === 8,
      meters: (w.meters?.poles.length || 0) > 0,
      emotes: !!w.emote,
      vfx: !!w.vehiclefx,
      guard: !!w.guard && !w.guard.hired,
      wildlife: !!w.wildlife && w.wildlife.rats.length === 4 && w.wildlife.flock.length === 8,
      gym: !!w.gym && !w.gym.trained,
      fortune: !!w.fortune,
      dice: !!w.dice,
      hobo: !!w.hobo && w.hobo.karma === 0,
    };
  });
  const bad = Object.entries(r).filter(([, v]) => !v).map(([k]) => k);
  check('All 16 Season-9 systems initialized', bad.length === 0, bad.length ? 'missing: ' + bad.join(',') : 'all up');
}

// ---- 2. coffee buff + hot dog heal ----
{
  await resetPlayer();
  await goTo('d.world.vendors.carts[1].pos');
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(250);
  const buff = await ev(() => window.__debug.world.buffs.speedT);
  check('Coffee grants a speed buff', buff > 50, `speedT ${buff}`);

  await ev(() => { window.__debug.player.health = 30; });
  await goTo('d.world.vendors.carts[0].pos');
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(250);
  const hp = await ev(() => window.__debug.player.health);
  check('Hot dog heals +40', hp === 70, `health ${hp}`);
}

// ---- 3. ATM deposit / withdraw ----
{
  await resetPlayer();
  await goTo('d.world.bank.machines[0].pos');
  await page.keyboard.press('1');
  await page.waitForTimeout(200);
  await page.keyboard.press('1');
  await page.waitForTimeout(200);
  await page.keyboard.press('2');
  await page.waitForTimeout(200);
  const r = await ev(() => ({ bal: window.__debug.world.bank.balance, money: window.__debug.world.money }));
  check('ATM: 2 deposits + 1 withdrawal nets $500 banked', r.bal === 500 && r.money === 99500, JSON.stringify(r));
}

// ---- 4. payphone courier chain ----
{
  await resetPlayer();
  await ev(() => {
    const pp = window.__debug.world.payphone;
    pp.ringing = 0;
    pp.ringT = 35;
  });
  await goTo('d.world.payphone.booths[0].pos');
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(250);
  const job = await ev(() => window.__debug.world.payphone.job);
  check('Answering the ringing payphone starts a courier job', !!job, JSON.stringify(job));
  if (job) {
    const before = await ev(() => window.__debug.world.money);
    await goTo(`d.world.payphone.booths[${job.dest}].pos`);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(250);
    const r = await ev(() => ({ money: window.__debug.world.money, streak: window.__debug.world.payphone.streak }));
    check('Delivery pays out and builds the streak', r.money === before + 250 && r.streak === 1, JSON.stringify(r));
  }
}

// ---- 5. pigeon + milestone counter ----
{
  const r = await ev(() => {
    const d = window.__debug;
    const b = d.world.pigeonNet.birds[0];
    b.target.hit();
    return { dead: b.dead, stat: d.world.stats.pigeons };
  });
  check('Pigeon down, counter ticks', r.dead && r.stat === 1, JSON.stringify(r));
}

// ---- 6. graffiti: hold E to spray ----
{
  await resetPlayer();
  await goTo('d.world.graffiti.spots[0].pos', 1.2, 1.2);
  await page.keyboard.down('KeyE');
  await page.waitForFunction(() => window.__debug.world.graffiti.spots[0].done, null, { timeout: 12000 }).catch(() => {});
  await page.keyboard.up('KeyE');
  const r = await ev(() => ({
    done: window.__debug.world.graffiti.spots[0].done,
    money: window.__debug.world.money,
  }));
  check('Wall tagged after holding E', r.done === true, JSON.stringify(r));
}

// ---- 7. hydrant geyser ----
{
  const r = await ev(() => {
    const h = window.__debug.world.hydrants.plugs[0];
    h.target.hit();
    return { burst: h.dead, jet: h.jet.visible };
  });
  check('Hydrant bursts into a geyser when shot', r.burst && r.jet, JSON.stringify(r));
}

// ---- 8. parking meter pays out ----
{
  const r = await ev(() => {
    const d = window.__debug;
    const before = d.world.money;
    d.world.meters.poles[0].target.hit();
    return { gain: d.world.money - before };
  });
  check('Cracked meter spits out $20-60', r.gain >= 20 && r.gain <= 60, `+$${r.gain}`);
}

// ---- 9. emotes ----
{
  await resetPlayer();
  await page.keyboard.press('KeyV');
  await page.waitForTimeout(200);
  const hint = await ev(() => window.__debug.world.emoteHint);
  await page.keyboard.press('3');
  await page.waitForTimeout(200);
  const em = await ev(() => window.__debug.world.emote);
  check('V opens the emote menu, 3 starts the dance', !!hint && em.id === 2 && em.t > 0, `id ${em.id}, t ${em.t?.toFixed(1)}`);
}

// ---- 10. bodyguard hire ----
{
  await resetPlayer();
  await goTo('d.world.guard.hirePos');
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(250);
  const r = await ev(() => ({
    hired: window.__debug.world.guard.hired,
    ch: !!window.__debug.world.guard.ch,
    money: window.__debug.world.money,
  }));
  check('Bodyguard hired for $5000 and spawned', r.hired && r.ch && r.money === 95000, JSON.stringify(r));
}

// ---- 11. gym session starts ----
{
  await resetPlayer();
  await goTo('d.world.gym.pos');
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(250);
  const w = await ev(() => window.__debug.world.gym.working);
  check('Gym bell rings: 10s on the bag', w > 8, `working ${w?.toFixed(1)}s`);
}

// ---- 12. fortune teller ----
{
  await resetPlayer();
  await goTo('d.world.fortune.pos');
  const before = await ev(() => window.__debug.world.money);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(250);
  const after = await ev(() => window.__debug.world.money);
  check('Madame Zaza takes $50 (or blesses you +$450)', after === before - 50 || after === before + 450, `$${before}->$${after}`);
}

// ---- 13. street dice ----
{
  await resetPlayer();
  await goTo('d.world.dice.pos');
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(200);
  await page.keyboard.press('1');
  await page.waitForTimeout(250);
  const r = await ev(() => ({ money: window.__debug.world.money, pot: window.__debug.world.dice.pot, open: window.__debug.world.dice.open }));
  check('Dice: $100 staked, pot resolves', r.open && r.money === 99900 && [0, 100, 200].includes(r.pot), JSON.stringify(r));
}

// ---- 14. Old Moses karma ----
{
  await resetPlayer();
  await goTo('d.world.hobo.pos');
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(250);
  const k = await ev(() => window.__debug.world.hobo.karma);
  check('Ten bucks to Moses = karma 1', k === 1, `karma ${k}`);
}

// ---- 15. new cheat codes ----
{
  await resetPlayer();
  await page.keyboard.type('BRASSRAIN', { delay: 30 });
  await page.waitForTimeout(200);
  const mg = await ev(() => window.__debug.ammo.mg);
  check('BRASSRAIN maxes all ammo', mg === 999, `mg ${mg}`);

  await page.keyboard.type('INVINCO', { delay: 30 });
  await page.waitForTimeout(200);
  const god = await ev(() => window.__debug.world.godT);
  check('INVINCO grants 60s god mode', god > 50, `godT ${god?.toFixed(0)}`);

  await page.keyboard.type('HUSHFUND', { delay: 30 });
  await ev(() => { window.__debug.world.wanted = 3; });
  await page.waitForTimeout(300);
  const w = await ev(() => window.__debug.world.wanted);
  check('HUSHFUND keeps the stars at zero', w === 0, `wanted ${w}`);
}

// ---- 16. save round-trip ----
{
  await ev(() => window.__debug.world.onSave());
  const saved = await ev(() => JSON.parse(localStorage.getItem('opencity-save-v1') || '{}'));
  const ok = saved.bank === 500 && saved.karma === 1 && (saved.pigeons || []).length === 1 &&
    (saved.graffiti || []).length === 1 && saved.guard === true && saved.phoneStreak === 1;
  check('bank/karma/pigeons/graffiti/guard/streak all persist', ok,
    JSON.stringify({ bank: saved.bank, karma: saved.karma, pigeons: saved.pigeons, graffiti: saved.graffiti, guard: saved.guard, streak: saved.phoneStreak }));
}

// ---- 17. no console errors ----
check('No page errors during the run', errors === 0, `${errors} errors`);

const fails = results.filter(([, ok]) => !ok).length;
console.log(`\n${results.length - fails}/${results.length} checks passed`);
await browser.close();
process.exit(fails ? 1 : 0);
