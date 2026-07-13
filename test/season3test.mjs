// Season 3 audit: casino heist, demolition derby, seaplane + smuggling,
// gang empire, deep-harbor diving, paparazzi, the mayor's office, and
// New Game+ prestige (tested last — it wipes the run by design).
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
    if (d.getState() === 'cards') d.leaveCards(); // close any stray overlay
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

// ---- 1. all Season 3 systems initialized ----
{
  const r = await ev(() => {
    const d = window.__debug;
    return {
      cheist: !!d.cheist() && d.cheist().stage === 0,
      derby: !!d.derby() && !d.derby().active,
      plane: !!d.plane() && !d.plane().dead,
      smuggle: !!d.smuggle(),
      empire: !!d.empire() && d.empire().zones.length === 5,
      diving: !!d.diving() && !d.diving().scuba,
      pap: !!d.pap(),
      mayor: !!d.mayor() && !d.mayor().elected,
      prestige: !!d.prestige() && d.world.prestige === 0 && d.world.payMult === 1,
    };
  });
  check('All 8 Season-3 systems initialized', Object.values(r).every(Boolean), JSON.stringify(r));
}

// ---- 2. casino heist: case, cameras, vault, escape ----
{
  await resetPlayer();
  await ev(() => {
    const d = window.__debug;
    d.setClock(23);
    const h = d.cheist();
    d.teleport(h.vaultPos.x + 0.5, 0, h.vaultPos.z + 0.5);
  });
  await page.waitForTimeout(250);
  await page.keyboard.down('KeyE');
  await page.waitForTimeout(3600);
  await page.keyboard.up('KeyE');
  const r1 = await ev(() => ({ stage: window.__debug.cheist().stage, cams: window.__debug.cheist().cams.length }));
  check('Heist: cased the Lucky 7 (cameras up)', r1.stage === 1 && r1.cams === 3, `stage ${r1.stage}`);

  await ev(() => {
    const d = window.__debug;
    for (const c of d.cheist().cams) { c.target.hit(d.world); }
  });
  await page.waitForTimeout(300);
  const r2 = await ev(() => window.__debug.cheist().stage);
  check('Heist: cameras blinded -> vault stage', r2 === 2);

  await ev(() => {
    const d = window.__debug;
    const h = d.cheist();
    d.teleport(h.vaultPos.x + 0.5, 0, h.vaultPos.z + 0.5);
  });
  await page.waitForTimeout(250);
  await page.keyboard.down('KeyE');
  await page.waitForTimeout(4600);
  await page.keyboard.up('KeyE');
  const r3 = await ev(() => ({ stage: window.__debug.cheist().stage, wanted: window.__debug.world.wanted }));
  check('Heist: vault cracked, city furious', r3.stage === 3 && r3.wanted >= 4, `wanted ${r3.wanted}`);

  const money0 = await ev(() => window.__debug.world.money);
  await ev(() => { window.__debug.world.wanted = 0; window.__debug.world.wantedTimer = 0; });
  await page.waitForTimeout(400);
  const r4 = await ev(() => ({ stage: window.__debug.cheist().stage, money: window.__debug.world.money, day: window.__debug.cheist().doneDay }));
  check('Heist: heat lost, $15k banked, once per day', r4.stage === 0 && r4.money === money0 + 15000 && r4.day === (await ev(() => window.__debug.world.dailyDay)),
    `+$${r4.money - money0}`);
}

// ---- 3. demolition derby ----
{
  await resetPlayer();
  await ev(() => {
    const d = window.__debug;
    d.setClock(21);
    const car = d.world.parked.find((c) => !c.dead && !c.bike && !c.tank);
    const sp = d.derby().signPos;
    car.pos.set(sp.x - 4, 0, sp.z);
    d.player.pos.set(sp.x + 1, 0, sp.z + 1); // on foot at the gate, car parked beside
    d.world.money = 2000;
  });
  await page.waitForTimeout(250);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(300);
  const r1 = await ev(() => ({ active: window.__debug.derby().active, rivals: window.__debug.derby().cars.length, money: window.__debug.world.money }));
  check('Derby: entered ($500), 7 rivals staged', r1.active && r1.rivals === 7 && r1.money === 1500);

  await page.waitForTimeout(3500); // countdown
  await ev(() => { for (const c of window.__debug.derby().cars) c.health = 0; });
  await page.waitForTimeout(600);
  const r2 = await ev(() => ({ active: window.__debug.derby().active, money: window.__debug.world.money, n: window.__debug.world.stats.derbies }));
  check('Derby: last one rolling wins the purse', !r2.active && r2.money === 1500 + 3000 && r2.n === 1, `+$3000`);
}

// ---- 4. seaplane: flight + smuggle run ----
{
  await resetPlayer();
  await ev(() => { window.__debug.boardPlane(); });
  await page.waitForTimeout(200);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2000);
  await page.keyboard.up('KeyW');
  const r1 = await ev(() => {
    const p = window.__debug.plane();
    return { speed: p.speed, flying: !!window.__debug.player.inPlane };
  });
  check('Seaplane: throttle up on the water', r1.flying && r1.speed > 12, `${r1.speed.toFixed(1)} u/s`);

  const money0 = await ev(() => {
    const d = window.__debug;
    d.smuggle().active = true;
    d.smuggle().dropped = false;
    // low pass through the smoke
    const m = d.smuggle().markerPos;
    d.plane().pos.set(m.x, 10, m.z);
    return d.world.money;
  });
  await page.waitForTimeout(400);
  const dropped = await ev(() => window.__debug.smuggle().dropped);
  check('Seaplane: package dropped through the smoke', dropped === true);

  await ev(() => {
    const d = window.__debug;
    const s = d.smuggle().shackPos;
    const p = d.plane();
    p.pos.set(s.x + 20, 1.1, s.z);
    p.speed = 0;
    p.vy = 0;
  });
  await page.waitForTimeout(500);
  const r2 = await ev(() => ({ active: window.__debug.smuggle().active, money: window.__debug.world.money }));
  check('Seaplane: delivery pays at the dock', !r2.active && r2.money === money0 + 2000, `+$${r2.money - money0}`);
  await ev(() => {
    const d = window.__debug;
    d.player.inPlane = null;
    d.player.mesh.visible = true;
  });
}

// ---- 5. gang empire: takeover + raid defense ----
{
  await resetPlayer();
  await ev(() => {
    const d = window.__debug;
    const z = d.empire().zones[0];
    d.teleport(z.flag.x + 1, 0, z.flag.z + 1);
  });
  await page.waitForTimeout(250);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(300);
  const r1 = await ev(() => window.__debug.empire().zones[0].fight.length);
  check('Empire: takeover starts (3 defenders)', r1 === 3);

  await ev(() => {
    const d = window.__debug;
    for (const f of d.empire().zones[0].fight) { f.target.hit(d.world); f.target.hit(d.world); }
  });
  await page.waitForTimeout(400);
  const r2 = await ev(() => ({ owned: window.__debug.empire().zones[0].owned, hint: window.__debug.world.stats.districts }));
  check('Empire: district taken', r2.owned === true, `districts: ${r2.hint}`);

  const money1 = await ev(() => { window.__debug.empire().raidT = 0.01; return window.__debug.world.money; });
  await page.waitForTimeout(500);
  const r3 = await ev(() => !!window.__debug.empire().raid);
  check('Empire: rival raid arrives', r3 === true);
  await ev(() => {
    const d = window.__debug;
    for (const f of d.empire().raid.thugs) { f.target.hit(d.world); f.target.hit(d.world); }
  });
  await page.waitForTimeout(400);
  const r4 = await ev(() => ({ raid: !!window.__debug.empire().raid, owned: window.__debug.empire().zones[0].owned, money: window.__debug.world.money }));
  check('Empire: raid repelled, district held (+$500)', !r4.raid && r4.owned && r4.money === money1 + 500);
}

// ---- 6. deep harbor diving ----
{
  await resetPlayer();
  await ev(() => {
    const d = window.__debug;
    d.world.money = 2000;
    const s = d.diving().shackPos;
    d.teleport(s.x, 1.35, s.z + 1);
  });
  await page.waitForTimeout(250);
  await page.keyboard.press('KeyE'); // buy scuba
  await page.waitForTimeout(250);
  await page.keyboard.press('KeyE'); // dive
  await page.waitForTimeout(300);
  const r1 = await ev(() => ({ scuba: window.__debug.diving().scuba, on: window.__debug.diving().on }));
  check('Diving: scuba bought, submerged', r1.scuba && r1.on);

  const money0 = await ev(() => {
    const d = window.__debug;
    const p = d.diving().pearls[0];
    d.player.pos.set(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z);
    return d.world.money;
  });
  await page.waitForTimeout(300);
  const r2 = await ev(() => ({ got: window.__debug.diving().pearls[0].got, money: window.__debug.world.money }));
  check('Diving: pearl collected', r2.got && r2.money === money0 + 300);

  await ev(() => {
    const d = window.__debug;
    const w = d.diving().wrecks[0];
    d.player.pos.set(w.pos.x, w.pos.y, w.pos.z);
  });
  await page.waitForTimeout(300);
  const r3 = await ev(() => window.__debug.diving().wrecks[0].looted);
  check('Diving: sunken chest looted (+$800)', r3 === true);
  await ev(() => { window.__debug.diving().on = false; });
}

// ---- 7. paparazzi contract ----
{
  await resetPlayer();
  await ev(() => {
    const d = window.__debug;
    const k = d.pap().kioskPos;
    d.pap().cooldownT = 0;
    d.teleport(k.x + 1, 0, k.z + 1);
  });
  await page.waitForTimeout(250);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(300);
  const r1 = await ev(() => ({ job: !!window.__debug.pap().job, kind: window.__debug.pap().job?.kind }));
  check('Paparazzi: contract taken', r1.job === true, r1.kind);

  const money0 = await ev(() => {
    const d = window.__debug;
    const s = d.pap().job.subject;
    // stand 8m south of the subject and aim the camera straight at them
    d.player.pos.set(s.pos.x, s.pos.y, s.pos.z + 8);
    d.setCamYaw(Math.PI); // camera forward = -z, toward the subject
    return d.world.money;
  });
  await page.waitForTimeout(400);
  await page.keyboard.press('KeyG');
  await page.waitForTimeout(300);
  const r2 = await ev(() => ({ job: !!window.__debug.pap().job, money: window.__debug.world.money }));
  check('Paparazzi: shot lands, tabloid pays', !r2.job && r2.money > money0 + 299, `+$${r2.money - money0}`);
}

// ---- 8. mayor: election, policy, salary ----
{
  await resetPlayer();
  await ev(() => {
    const d = window.__debug;
    d.world.crowned = true;
    d.world.rep = 3000;
    d.world.money = 25000;
    const h = d.mayor().hallPos;
    d.teleport(h.x, 0, h.z + 2);
  });
  await page.waitForTimeout(250);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(300);
  const r1 = await ev(() => ({ elected: window.__debug.mayor().elected, money: window.__debug.world.money }));
  check('Mayor: elected ($20k campaign)', r1.elected && r1.money === 5000);

  await page.keyboard.press('Digit1'); // NORMAL -> MARTIAL
  await page.waitForTimeout(250);
  await page.keyboard.press('Digit4'); // salary
  await page.waitForTimeout(250);
  const r2 = await ev(() => ({ police: window.__debug.world.policy.police, money: window.__debug.world.money }));
  check('Mayor: policy flips + salary paid', r2.police === 2 && r2.money === 5800, `police stance ${r2.police}, $${r2.money}`);
}

// ---- 9. save round-trip for Season 3 ----
{
  await ev(() => window.__debug.world.onSave());
  const r = await ev(() => {
    const s = JSON.parse(localStorage.getItem('opencity-save-v1'));
    return {
      cheist: typeof s.cheistDay === 'number',
      empire: (s.empire || []).length === 1,
      scuba: s.scuba === true,
      pearls: (s.pearls || []).length === 1,
      chests: (s.chests || []).length === 1,
      mayor: s.mayor === true && s.policy?.police === 2,
    };
  });
  check('Season 3 progress persists', Object.values(r).every(Boolean), JSON.stringify(r));
}

// ---- 10. prestige (LAST: wipes the run, keeps the crown) ----
{
  await resetPlayer();
  await ev(() => {
    const d = window.__debug;
    const p = d.prestige().pos;
    d.teleport(p.x + 1, 0, p.z + 1);
  });
  await page.waitForTimeout(250);
  await page.keyboard.down('KeyE'); // arm (3s)
  await page.waitForTimeout(3400);
  await page.keyboard.up('KeyE');
  await page.waitForTimeout(300);
  const armed = await ev(() => window.__debug.prestige().armed);
  await page.keyboard.down('KeyE'); // confirm (3s) -> reload after 1.2s
  await page.waitForTimeout(3400);
  await page.keyboard.up('KeyE').catch(() => {});
  await page.waitForTimeout(2500); // reload happens here
  await page.waitForFunction(() => window.__debug, null, { timeout: 15000 });
  const r = await ev(() => ({
    prestige: window.__debug.world.prestige,
    payMult: window.__debug.world.payMult,
    money: window.__debug.world.money,
    crowned: !!window.__debug.world.crowned,
  }));
  check('Prestige: NG+ reload — star kept, run wiped', armed && r.prestige === 1 && r.payMult === 1.25 && r.money === 0 && r.crowned,
    JSON.stringify(r));
}

console.log(`\n${results.filter((r) => r[1]).length}/${results.length} passed, ${errors} page errors`);
await browser.close();
process.exit(results.every((r) => r[1]) && errors === 0 ? 0 : 1);
