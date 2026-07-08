// Feature audit for the meta-systems update: economy, arena, ads,
// races, garage customization, and the harbor (boats + swimming).
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
  });
  await page.waitForTimeout(150);
}

// ---- 1. economy objects live ----
{
  const eco = await ev(() => {
    const d = window.__debug;
    return {
      props: !!d.world.props && Array.isArray(d.world.propMarks) && d.world.propMarks.length === 3,
      rep: typeof d.world.rep === 'number' && !!d.world.repTier,
      daily: !!d.world.daily && typeof d.world.daily.goal === 'number',
      counters: !!d.world.counters,
    };
  });
  check('Economy systems initialized', eco.props && eco.rep && eco.daily && eco.counters,
    `3 properties, rep + daily challenge live`);
}

// ---- 2. buy a property (B) ----
{
  await resetPlayer();
  const before = await ev(() => {
    const d = window.__debug;
    d.world.money = 10000;
    const m = d.world.propMarks[0]; // casino, $8000
    d.player.pos.set(m.pos.x, 0, m.pos.z);
    return d.world.money;
  });
  await page.waitForTimeout(250);
  await page.keyboard.press('KeyB');
  await page.waitForTimeout(250);
  const r = await ev(() => ({
    owned: !!window.__debug.world.props.owned.casino,
    money: window.__debug.world.money,
    rep: window.__debug.world.rep,
  }));
  check('Buy property (B under the beam)', r.owned && r.money === before - 8000 && r.rep >= 500,
    `casino bought, rep ${r.rep}`);
}

// ---- 3. property income ticks ----
{
  const paid = await ev(async () => {
    const d = window.__debug;
    const before = d.world.money;
    d.world.incomeT = 59.9; // force the hourly payout
    await new Promise((r) => setTimeout(r, 400));
    return d.world.money - before;
  });
  check('Property passive income', paid >= 400, `+$${paid}/hr`);
}

// ---- 4. reputation tiers ----
{
  const tier = await ev(() => {
    const d = window.__debug;
    return new Promise((res) => {
      import('./js/economy.js').then((mod) => {
        mod.addRep(d.world, 2000);
        res(d.world.repTier);
      }).catch(() => res(null));
    });
  });
  check('Reputation tiers', tier === 'FAMOUS' || tier === 'CITY LEGEND', `now ${tier}`);
}

// ---- 5. daily challenge tracking ----
{
  const daily = await ev(() => {
    const d = window.__debug;
    return new Promise((res) => {
      import('./js/economy.js').then((mod) => {
        d.world.daily = { key: 'wreck15', text: 'Wreck 15 vehicles', goal: 2, reward: 700, stat: 'wrecked' };
        d.world.dailyDone = false;
        d.world.counters.wrecked = 0;
        const before = d.world.money;
        mod.trackDaily(d.world, 'wrecked');
        mod.trackDaily(d.world, 'wrecked');
        res({ done: d.world.dailyDone, gain: d.world.money - before });
      }).catch(() => res(null));
    });
  });
  check('Daily challenge completes + pays', daily && daily.done && daily.gain >= 700, `+$${daily?.gain}`);
}

// ---- 6. arena: start, waves, foes ----
{
  await resetPlayer();
  const started = await ev(async () => {
    const d = window.__debug;
    d.player.pos.set(d.world.arena.pos.x + 3, 0, d.world.arena.pos.z);
    d.player.vel.set(0, 0, 0);
    d.startArena();
    await new Promise((r) => setTimeout(r, 400));
    return { active: d.world.arena.active, wave: d.world.arena.wave, foes: d.world.arena.foes.length };
  });
  check('Arena wave survival starts (H)', started.active && started.wave === 1 && started.foes >= 3,
    `wave 1, ${started.foes} foes`);

  const wave2 = await ev(async () => {
    const d = window.__debug;
    for (const f of d.world.arena.foes) { f.hp = 0; f.target.hit(d.world); }
    await new Promise((r) => setTimeout(r, 2200));
    return d.world.arena.wave;
  });
  check('Arena wave 2 spawns after clear', wave2 === 2, `now wave ${wave2}`);

  const ended = await ev(async () => {
    const d = window.__debug;
    d.player.pos.set(d.world.arena.pos.x + 60, 0, d.world.arena.pos.z); // walk out
    await new Promise((r) => setTimeout(r, 400));
    return !d.world.arena.active && d.world.arena.best >= 1;
  });
  check('Arena ends when you leave, best saved', ended);
}

// ---- 7. rewarded ad (simulated) pays out ----
{
  await resetPlayer();
  const before = await ev(() => {
    const d = window.__debug;
    d.player.pos.copy(d.shops.casinoPos);
    return d.world.money;
  });
  await page.waitForTimeout(300);
  await page.keyboard.press('Digit4');
  await page.waitForTimeout(600);
  const overlay = await ev(() => {
    const el = document.getElementById('adoverlay');
    return !!el && el.style.display === 'flex';
  });
  await page.waitForTimeout(3200); // sim ad runs 3s
  const after = await ev(() => window.__debug.world.money);
  check('Rewarded ad (casino, key 4)', overlay && after === before + 500, `overlay shown, +$${after - before}`);
}

// ---- 8. race: drive into the ring, gates, timer ----
{
  await resetPlayer();
  const started = await ev(async () => {
    const d = window.__debug;
    const def = d.races.defs[0].def; // downtown circuit
    const car = d.world.parked.find((v) => !v.bike && !v.dead && !v.tank);
    d.player.inCar = car;
    d.player.mesh.visible = false;
    car.pos.set(def.start[0], 0, def.start[1]);
    car.vel.set(0, 0, 0);
    await new Promise((r) => setTimeout(r, 400));
    return { active: d.races.active?.key, countdown: d.races.countdown };
  });
  check('Race starts in the ring', started.active === 'circuit', `countdown ${started.countdown?.toFixed(1)}s`);

  await page.waitForTimeout(3300); // countdown
  const gate = await ev(async () => {
    const d = window.__debug;
    const def = d.races.active;
    if (!def) return null;
    const c = def.cps[0];
    d.player.inCar.pos.set(c[0], 0, c[1]); // drive through gate 1
    await new Promise((r) => setTimeout(r, 300));
    return { idx: d.races.idx, t: d.races.t, blip: !!d.world.raceBlip };
  });
  check('Race gates + timer + map blip', gate && gate.idx === 1 && gate.t > 0 && gate.blip,
    `gate 1 cleared at ${gate?.t.toFixed(1)}s`);

  const finished = await ev(async () => {
    const d = window.__debug;
    const def = d.races.active;
    const before = d.world.money;
    for (let i = d.races.idx; i < def.cps.length; i++) {
      const c = def.cps[i];
      d.player.inCar.pos.set(c[0], 0, c[1]);
      await new Promise((r) => setTimeout(r, 150));
    }
    return { done: !d.races.active, best: d.world.raceBest.circuit, gain: d.world.money - before };
  });
  check('Race finish: medal, cash, best time', finished.done && finished.best > 0 && finished.gain > 0,
    `best ${finished.best}s, +$${finished.gain}`);
  await ev(() => {
    const d = window.__debug;
    if (d.player.inCar) { d.world.parked.push(d.player.inCar); d.player.inCar = null; d.player.mesh.visible = true; }
  });
}

// ---- 9. garage customization ----
{
  await resetPlayer();
  const setup = await ev(() => {
    const d = window.__debug;
    d.world.money = 5000;
    d.world.garageKind = 'car';
    d.shops.garageVeh = null; // force a rebuild on the pad
    return new Promise((res) => {
      import('./js/shops.js').then((mod) => {
        mod.ensureGarageVehicle(d.shops, d.world);
        d.player.pos.set(d.shops.garagePos.x + 1, 0, d.shops.garagePos.z);
        res(!!d.shops.garageVeh);
      }).catch(() => res(false));
    });
  });
  await page.waitForTimeout(300);
  await page.keyboard.press('Digit2'); // engine
  await page.waitForTimeout(200);
  await page.keyboard.press('Digit4'); // nitro
  await page.waitForTimeout(200);
  await page.keyboard.press('Digit1'); // respray
  await page.waitForTimeout(200);
  const mods = await ev(() => {
    const d = window.__debug;
    const v = d.shops.garageVeh;
    return {
      engine: d.world.garageMods.engine && v.engineMod && v.accel > 17,
      nitro: d.world.garageMods.nitro && v.bigNitro === true,
      paint: d.world.garageMods.paint != null,
      money: d.world.money,
    };
  });
  check('Garage tuning: engine + nitro + respray', setup && mods.engine && mods.nitro && mods.paint,
    `$${5000 - mods.money} spent`);
}

// ---- 10. harbor: water, boats, swimming ----
{
  const harbor = await ev(() => {
    const d = window.__debug;
    return { boats: d.world.boats.length, water: !!d.water.geo };
  });
  check('Harbor built (water + 3 boats)', harbor.boats === 3 && harbor.water);

  await resetPlayer();
  const swim = await ev(async () => {
    const d = window.__debug;
    return import('./js/water.js').then(async (w) => {
      d.teleport(w.WATER_X0 + 40, 0.2, 0); // open water east of the seawall
      await new Promise((r) => setTimeout(r, 600));
      return { swim: d.player.swim, y: d.player.pos.y };
    });
  });
  check('Swimming in the harbor', swim.swim && swim.y < 0.5, `bobbing at y=${swim.y.toFixed(2)}`);
}

// ---- 11. drive a boat ----
{
  const boarded = await ev(() => {
    const d = window.__debug;
    d.boardBoat(0);
    return !!d.player.inBoat;
  });
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2000);
  const sp = await ev(() => window.__debug.player.inBoat?.vel.length() ?? 0);
  await page.keyboard.up('KeyW');
  check('Speedboat drives', boarded && sp > 8, `${sp.toFixed(1)} m/s`);

  const off = await ev(async () => {
    const d = window.__debug;
    d.player.inBoat.vel.set(0, 0, 0);
    await new Promise((r) => setTimeout(r, 200));
    d.exitBoat();
    await new Promise((r) => setTimeout(r, 400));
    return { out: !d.player.inBoat, swim: d.player.swim };
  });
  check('Hop off into a swim', off.out && off.swim);
  await resetPlayer();
}

// ---- 12. save carries all the new fields ----
{
  const save = await ev(() => {
    window.__debug.world.onSave();
    return JSON.parse(localStorage.getItem('opencity-save-v1') || '{}');
  });
  const want = ['props', 'rep', 'dailyDay', 'arenaBest', 'races', 'mods'];
  const missing = want.filter((k) => !(k in save));
  check('Save file: new fields persisted', missing.length === 0,
    missing.length ? 'missing ' + missing.join(',') : want.join(','));
}

console.log('---');
const fails = results.filter(([, ok]) => !ok).length;
console.log(`NEW FEATURES: ${results.length - fails}/${results.length} verified, runtime errors: ${errors}`);
await browser.close();
process.exitCode = fails > 0 || errors > 0 ? 1 : 0;
