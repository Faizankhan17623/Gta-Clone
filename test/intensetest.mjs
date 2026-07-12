// Feature audit for the "intense & curious" update: nemesis, outbreak
// nights, the harbor train + heist, disasters, the island prison, city
// myths, the stranger, and the new garage mods.
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
    d.stopSwing();
    d.player.inCar = null;
    d.player.inHeli = null;
    d.player.inBoat = null;
    d.player.swim = false;
    d.player.mesh.visible = true;
    d.player.pos.set(d.world.city.spawn.x + 5, 0, d.world.city.spawn.z + 5);
    d.player.vel.set(0, 0, 0);
    d.player.vy = 0;
    d.player.health = d.world.maxHealth;
    d.player.glide = false;
    d.world.wanted = 0;
    d.world.wantedTimer = 0;
  });
  await page.waitForTimeout(150);
}

// ---- 1. all new systems initialized ----
{
  const r = await ev(() => {
    const d = window.__debug;
    return {
      nemesis: !!d.nemesis() && d.nemesis().lvl === 1,
      zombies: !!d.zombies() && !d.zombies().active,
      train: !!d.train() && d.train().wagons.length === 3,
      disasters: !!d.disasters(),
      prison: !!d.prison() && !d.prison().inside,
      myths: !!d.myths() && d.myths().walls.length === 4,
      stranger: !!d.stranger() && d.stranger().stage === 0,
      garage: 'spikes' in d.world.garageMods && 'neon' in d.world.garageMods,
    };
  });
  const all = Object.values(r).every(Boolean);
  check('All 8 new systems initialized', all, JSON.stringify(r));
}

// ---- 2. prison: intake + fine + escape ----
{
  await resetPlayer();
  const r1 = await ev(() => {
    const d = window.__debug;
    d.world.money = 1000;
    d.imprison();
    return { inside: d.prison().inside, money: d.world.money, x: d.player.pos.x };
  });
  await page.waitForTimeout(300);
  check('Prison intake (fine + island cell)', r1.inside && r1.money === 500 && r1.x > 500,
    `money $${r1.money}, x=${Math.round(r1.x)}`);
  await ev(() => { window.__debug.teleport(0, 0, 0); });
  await page.waitForTimeout(400);
  const r2 = await ev(() => ({
    inside: window.__debug.prison().inside,
    wanted: window.__debug.world.wanted,
    jb: window.__debug.world.stats.jailbreaks,
  }));
  check('Jailbreak (escape raises heat)', !r2.inside && r2.wanted >= 2 && r2.jb === 1,
    `wanted ${r2.wanted}`);
}

// ---- 3. zombie outbreak: start, kill pays, dawn survival ----
{
  await resetPlayer();
  await ev(() => { window.__debug.setClock(22.5); window.__debug.startOutbreak(); });
  await page.waitForTimeout(400);
  const r1 = await ev(() => {
    const d = window.__debug;
    const zs = d.zombies();
    const money0 = d.world.money;
    const zb = zs.list[0];
    zb.target.hit(d.world);
    zb.target.hit(d.world);
    return { active: zs.active, horde: zs.list.length, paid: d.world.money - money0, dead: zb.dead };
  });
  check('Outbreak starts, zombie bounty pays', r1.active && r1.horde >= 6 && r1.dead && r1.paid === 50,
    `horde ${r1.horde}, +$${r1.paid}`);
  const before = await ev(() => window.__debug.world.money);
  await ev(() => window.__debug.setClock(6.5));
  await page.waitForTimeout(400);
  const r2 = await ev(() => ({ active: window.__debug.zombies().active, money: window.__debug.world.money }));
  check('Outbreak ends at dawn with payout', !r2.active && r2.money >= before + 2000,
    `+$${r2.money - before}`);
}

// ---- 4. nemesis: ambush, defeat, escalation ----
{
  await resetPlayer();
  await ev(() => { window.__debug.setClock(12); window.__debug.forceNemesis(); });
  await page.waitForTimeout(500);
  const r1 = await ev(() => {
    const nm = window.__debug.nemesis();
    return { active: nm.active, foe: !!nm.foe, crew: nm.crew.length, hp: nm.foe?.hp };
  });
  check('Nemesis ambush spawns (boss + crew)', r1.active && r1.foe && r1.crew === 1,
    `crew ${r1.crew}, boss hp ${r1.hp}`);
  const money0 = await ev(() => window.__debug.world.money);
  await ev(() => {
    const d = window.__debug;
    const nm = d.nemesis();
    for (let i = 0; i < 30 && !nm.foe.dead; i++) nm.foe.target.hit(d.world);
  });
  await page.waitForTimeout(400);
  const r2 = await ev(() => {
    const nm = window.__debug.nemesis();
    return { active: nm.active, beaten: nm.beaten, lvl: nm.lvl, money: window.__debug.world.money };
  });
  check('Nemesis defeated, comes back meaner', !r2.active && r2.beaten === 1 && r2.lvl === 2 && r2.money > money0,
    `beaten ${r2.beaten}, next level ${r2.lvl}, +$${r2.money - money0}`);
}

// ---- 5. train: riding + heist ----
{
  await resetPlayer();
  const ride = await ev(() => {
    const d = window.__debug;
    const tr = d.train();
    const cargo = tr.wagons[1];
    const x = cargo.mesh.position.x;
    const z = tr.t + cargo.off;
    d.teleport(x, 10.9, z);
    return { x, z };
  });
  await page.waitForTimeout(1000);
  const r1 = await ev((ride) => {
    const d = window.__debug;
    return { dz: d.player.pos.z - ride.z, y: d.player.pos.y, x: d.player.pos.x };
  }, ride);
  check('Train surfing (carried along the roof)', r1.dz > 3 && Math.abs(r1.x - ride.x) < 2 && r1.y > 9,
    `moved ${r1.dz.toFixed(1)}m, y=${r1.y.toFixed(1)}`);

  // take the contract at the sign
  await resetPlayer();
  await ev(() => {
    const d = window.__debug;
    const tr = d.train();
    tr.cooldownT = 0;
    d.teleport(tr.signPos.x, 0, tr.signPos.z);
  });
  await page.waitForTimeout(250);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(300);
  const r2 = await ev(() => {
    const tr = window.__debug.train();
    return { heist: tr.heist, guards: tr.guards.length };
  });
  check('Train heist starts with roof guards', r2.heist && r2.guards === 4, `guards ${r2.guards}`);

  // clear the roof, ride the gold wagon, crack it
  await ev(() => {
    const d = window.__debug;
    for (const g of d.train().guards) { g.target.hit(d.world); g.target.hit(d.world); }
  });
  const money1 = await ev(() => window.__debug.world.money);
  await ev(() => {
    const d = window.__debug;
    const tr = d.train();
    const cargo = tr.wagons[1];
    d.teleport(cargo.mesh.position.x, 10.9, tr.t + cargo.off);
  });
  await page.waitForTimeout(300);
  await page.keyboard.down('KeyE');
  await page.waitForTimeout(3200);
  await page.keyboard.up('KeyE');
  const r3 = await ev(() => ({
    heist: window.__debug.train().heist,
    money: window.__debug.world.money,
    n: window.__debug.world.stats.trainHeists,
  }));
  check('Cargo cracked on the moving train', !r3.heist && r3.money >= money1 + 2500 && r3.n === 1,
    `+$${r3.money - money1}`);
}

// ---- 6. disasters: forced quake runs and clears ----
{
  await resetPlayer();
  await ev(() => window.__debug.forceDisaster('quake'));
  await page.waitForTimeout(400);
  const r1 = await ev(() => window.__debug.disasters().kind);
  await ev(() => { window.__debug.disasters().left = 0.2; });
  await page.waitForTimeout(400);
  const r2 = await ev(() => window.__debug.disasters().kind);
  check('Earthquake fires and clears', r1 === 'quake' && r2 === null, `during: ${r1}, after: ${r2}`);
}

// ---- 7. myths: graffiti -> bunker, sea monster, numbers ----
{
  await resetPlayer();
  // touch all four tags
  for (let i = 0; i < 4; i++) {
    await ev((i) => {
      const d = window.__debug;
      const w = d.myths().walls[i];
      d.teleport(w.pos.x + 1.5, 0, w.pos.z + 1.5);
    }, i);
    await page.waitForTimeout(200);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(200);
  }
  const g = await ev(() => ({ graf: window.__debug.myths().graf.size, done: [...window.__debug.myths().done] }));
  check('Four graffiti tags found', g.graf === 4 && g.done.includes('graffiti'), `tags ${g.graf}/4`);

  // the hatch opens now
  const money0 = await ev(() => {
    const d = window.__debug;
    const m = d.myths();
    d.teleport(m.hatchPos.x + 1, 0, m.hatchPos.z + 1);
    return d.world.money;
  });
  await page.waitForTimeout(250);
  await page.keyboard.down('KeyE');
  await page.waitForTimeout(2800);
  await page.keyboard.up('KeyE');
  const b = await ev(() => ({ done: [...window.__debug.myths().done], money: window.__debug.world.money }));
  check('Bunker myth (buried heart)', b.done.includes('bunker') && b.money >= money0 + 5000,
    `+$${b.money - money0}`);

  // the harbor thing, at night, from the water
  await ev(() => window.__debug.setClock(23));
  await page.waitForTimeout(300);
  await ev(() => {
    const d = window.__debug;
    const mp = d.myths().monster.position;
    d.teleport(mp.x + 2, 0, mp.z);
  });
  await page.waitForTimeout(600);
  const sm = await ev(() => [...window.__debug.myths().done]);
  check('Sea monster witnessed', sm.includes('seamonster'), sm.join(','));

  // the numbers mast
  await ev(() => {
    const d = window.__debug;
    d.player.swim = false;
    const mp = d.myths().mastPos;
    d.teleport(mp.x + 1, 0, mp.z + 1);
  });
  await page.waitForTimeout(300);
  await page.keyboard.down('KeyE');
  await page.waitForTimeout(2800);
  await page.keyboard.up('KeyE');
  const nb = await ev(() => [...window.__debug.myths().done]);
  check('Numbers station myth', nb.includes('numbers'), `${nb.length}/5 myths total`);
}

// ---- 8. the stranger: meet, task, payment ----
{
  await resetPlayer();
  await ev(() => {
    const d = window.__debug;
    const st = d.stranger();
    d.teleport(st.spot[0] + 1.5, 0, st.spot[1] + 1.5);
  });
  await page.waitForTimeout(250);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(300);
  const r1 = await ev(() => window.__debug.stranger().taskActive);
  check('Stranger gives his first task', r1 === true);

  const money0 = await ev(() => window.__debug.world.money);
  await ev(() => {
    // task 1: land a helicopter next to where he stood
    const d = window.__debug;
    const st = d.stranger();
    const h = d.world.helis[0];
    h.pos.set(st.spot[0] + 2, 1, st.spot[1] + 2);
    d.player.inHeli = h;
  });
  await page.waitForTimeout(400);
  const r2 = await ev(() => {
    const d = window.__debug;
    const st = d.stranger();
    d.player.inHeli = null;
    d.player.mesh.visible = true;
    return { stage: st.stage, active: st.taskActive, money: d.world.money };
  });
  check('Stranger task completed (+$777)', r2.stage === 1 && !r2.active && r2.money === money0 + 777,
    `stage ${r2.stage}, +$${r2.money - money0}`);
}

// ---- 9. garage: spikes + neon apply to a vehicle ----
{
  const r = await ev(() => import('./js/shops.js').then((m) => {
    const d = window.__debug;
    d.world.garageMods.spikes = true;
    d.world.garageMods.neon = true;
    const v = d.world.parked.find((p) => !p.bike && !p.dead);
    m.applyGarageMods(d.world, v);
    return { spikes: !!v.spikes, neon: !!v.neonMod };
  }));
  check('Garage ram spikes + neon fit', r.spikes && r.neon);
}

// ---- 10. save round-trip for the new progress ----
{
  await ev(() => window.__debug.world.onSave());
  const r = await ev(() => {
    const s = JSON.parse(localStorage.getItem('opencity-save-v1'));
    return {
      nem: s.nemLvl === 2 && s.nemBeaten === 1,
      myths: (s.mythsDone || []).length >= 4 && (s.mythsGraf || []).length === 4,
      stranger: s.strangerStage === 1,
    };
  });
  check('New progress persists in the save', r.nem && r.myths && r.stranger, JSON.stringify(r));
}

console.log(`\n${results.filter((r) => r[1]).length}/${results.length} passed, ${errors} page errors`);
await browser.close();
process.exit(results.every((r) => r[1]) && errors === 0 ? 0 : 1);
