// Full feature audit: verify every shipped feature live, one by one.
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
    d.player.mesh.visible = true;
    d.player.pos.set(d.world.city.spawn.x + 5, 0, d.world.city.spawn.z + 5);
    d.player.vel.set(0, 0, 0);
    d.player.vy = 0;
    d.player.health = d.world.maxHealth;
    d.player.glide = false;
    d.world.wanted = 0;
    d.world.style = 0;
  });
  await page.waitForTimeout(150);
}

// ---- 1. web swing ----
{
  await resetPlayer();
  const ok = await ev(() => {
    const d = window.__debug;
    const c = d.world.city.colliders.find((c) => c.h >= 40);
    d.player.pos.set((c.x0 + c.x1) / 2, 0, c.z0 - 12);
    d.setCamYaw(0);
    return true;
  });
  await page.waitForTimeout(400);
  await page.mouse.down({ button: 'right' });
  await ev(() => window.__debug.startSwing());
  await page.waitForTimeout(800);
  const s = await ev(() => ({ att: window.__debug.web.attached, y: window.__debug.player.pos.y }));
  check('Web swinging', ok && s.att && s.y > 1, `airborne at ${s.y.toFixed(1)}m`);
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(200);
}

// ---- 2. glide hang-time after release ----
{
  const glide = await ev(() => {
    const d = window.__debug;
    d.player.pos.y = 25;
    d.player.vel.set(20, 0, 0);
    d.web.attached = true; // simulate releasing a fast swing
    d.stopSwing();
    return d.player.glide === true;
  });
  check('Release glide (hang-time)', glide);
  await page.waitForTimeout(1200);
}

// ---- 3. zip-to-point (tap) ----
{
  await resetPlayer();
  await ev(() => {
    const d = window.__debug;
    const c = d.world.city.colliders.find((c) => c.h >= 40);
    d.player.pos.set((c.x0 + c.x1) / 2, 0, c.z0 - 12);
    d.setCamYaw(0);
  });
  await page.waitForTimeout(400);
  await page.mouse.down({ button: 'right' });
  await ev(() => window.__debug.startSwing());
  await page.waitForTimeout(80); // quick tap
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(300);
  const zip = await ev(() => window.__debug.web.zip || window.__debug.player.pos.y > 3);
  check('Zip-to-point (tap right click)', zip);
  await page.waitForTimeout(2500); // let it finish + land
}

// ---- 4. wall-run ----
{
  await resetPlayer();
  const setup = await ev(() => {
    const d = window.__debug;
    const c = d.world.city.colliders.find((c) => c.h >= 30);
    // hover just beside the south wall, airborne, facing it
    d.player.pos.set((c.x0 + c.x1) / 2, 2, c.z0 - 0.6);
    d.player.vy = 0;
    d.player.onGround = false;
    d.player.wallT = 1.0;
    d.setCamYaw(0); // W pushes +z, into the wall
    return true;
  });
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(400);
  const y = await ev(() => window.__debug.player.pos.y);
  await page.keyboard.up('KeyW');
  check('Wall-run', setup && y > 2.5, `climbed to ${y.toFixed(1)}m`);
  await page.waitForTimeout(1200);
}

// ---- 5. style meter ----
{
  await resetPlayer();
  await ev(() => {
    const d = window.__debug;
    d.world.style = 0;
    const c = d.world.city.colliders.find((c) => c.h >= 40);
    d.player.pos.set((c.x0 + c.x1) / 2, 0, c.z0 - 12);
    d.setCamYaw(0); // face the wall before firing
  });
  await page.waitForTimeout(400);
  const style = await ev(() => {
    const d = window.__debug;
    // a mid-air web catch awards style
    d.player.onGround = false;
    d.player.pos.y = 10;
    d.startSwing();
    return d.world.style;
  });
  await ev(() => window.__debug.stopSwing());
  check('Style meter', style > 0, `+${style} for mid-air catch`);
  await page.waitForTimeout(800);
}

// ---- 6. web attack ----
{
  await resetPlayer();
  await ev(() => {
    const d = window.__debug;
    const p = d.world.peds[0];
    p.dead = false;
    p.webT = 0;
    p.pos.set(d.player.pos.x, 0, d.player.pos.z + 8);
    d.setCamYaw(0);
    d.setCamPitch(-0.1);
  });
  await page.waitForTimeout(500);
  await ev(() => window.__debug.webAttack());
  const webbed = await ev(() => window.__debug.world.peds.some((p) => p.webT > 0));
  check('Web attack (Q) pins peds', webbed);
}

// ---- 7. store robbery ----
{
  await resetPlayer();
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
  const gain = (await ev(() => window.__debug.world.money)) - before;
  const heat = await ev(() => window.__debug.world.wanted);
  check('Store robbery (hold E)', gain >= 250 && heat >= 2, `+$${gain}, ${heat} stars`);
  await ev(() => { window.__debug.world.wanted = 0; });
}

// ---- 8. upgrade den ----
{
  await resetPlayer();
  await ev(() => {
    const d = window.__debug;
    d.world.money += 800;
    d.world.upgrades.range = false;
    d.player.pos.copy(d.shops.denPos);
  });
  await page.waitForTimeout(300);
  const near = await ev(() => window.__debug.world.nearDen);
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(300);
  const bought = await ev(() => window.__debug.world.upgrades.range);
  check('WEB DEN upgrades', near && bought, 'bought LONG WEBS at the den');
}

// ---- 9. gang territory ----
{
  const g = await ev(() => {
    const d = window.__debug;
    return {
      exists: !!d.gang,
      members: d.gang.members.filter((m) => !m.dead).length,
      owned: d.gang.owned,
      kills: d.gang.kills,
    };
  });
  // shoot one gangster via debug to prove the takeover counter works
  const killWorks = await ev(() => {
    const d = window.__debug;
    const before = d.gang.kills;
    const m = d.gang.members.find((m) => !m.dead);
    // same path a bullet takes
    return new Promise((res) => {
      import('./js/gangs.js').then((mod) => {
        mod.killGangMember(d.world, m);
        res(d.gang.kills === before + 1);
      }).catch(() => res(false));
    });
  });
  check('Gang territory (Vipers)', g.exists && g.members >= 8, `${g.members} members patrolling`);
  check('Territory takeover counter', killWorks, 'kill raises the count');
}

// ---- 10. motorbike ----
{
  await resetPlayer();
  const found = await ev(() => {
    const d = window.__debug;
    const bike = d.world.parked.find((v) => v.bike && !v.dead);
    if (!bike) return false;
    d.player.pos.set(bike.pos.x + 2, 0, bike.pos.z);
    return true;
  });
  await page.waitForTimeout(200);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(200);
  const onBike = await ev(() => !!window.__debug.player.inCar?.bike);
  check('Motorbike', found && onBike, 'found one parked and mounted it');

  // ---- 11. car radio ----
  const st0 = await ev(() => window.__debug.world.radioSt);
  await page.keyboard.press('KeyR');
  await page.waitForTimeout(200);
  const st1 = await ev(() => window.__debug.world.radioSt);
  check('Car radio (R)', st1 === (st0 + 1) % 4, `station ${st0} -> ${st1}`);
  await page.keyboard.press('KeyE'); // dismount
  await page.waitForTimeout(300);
}

// ---- 12. tank at 5 stars + stealable ----
{
  await resetPlayer();
  await ev(() => { window.__debug.world.wanted = 5; window.__debug.world.wantedTimer = 0; });
  await page.waitForTimeout(1500);
  const n = await ev(() => window.__debug.world.tanks.filter((t) => !t.dead).length);
  check('Army tank at 5 stars', n >= 1, `${n} tank hunting`);
  const stole = await ev(() => {
    const d = window.__debug;
    const t = d.world.tanks.find((t) => !t.dead);
    if (!t) return false;
    t.vel.set(0, 0, 0); // it parks at 14m to shell you — walk up while it's stopped
    d.player.pos.set(t.pos.x + 3, 0, t.pos.z);
    d.player.vel.set(0, 0, 0);
    return true;
  });
  await page.waitForTimeout(200);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(300);
  const inTank = await ev(() => !!window.__debug.player.inCar?.tank);
  check('Tank is stealable', stole && inTank);
  await page.keyboard.press('KeyE');
  await ev(() => { window.__debug.world.wanted = 0; window.__debug.player.inCar = null; window.__debug.player.mesh.visible = true; });
}

// ---- 13. missions: all six types ----
{
  const types = [];
  for (const [done, want] of [[0, 'delivery'], [1, 'race'], [2, 'air'], [3, 'taxi'], [4, 'hit'], [5, 'boss']]) {
    await resetPlayer();
    const got = await ev(async (doneN) => {
      const d = window.__debug;
      d.mission.active = false;
      d.mission.done = doneN;
      // walk into the yellow beam
      d.player.pos.set(d.mission.markerPos.x, 0, d.mission.markerPos.z);
      await new Promise((r) => setTimeout(r, 300));
      return d.mission.active ? d.mission.type : 'none';
    }, done);
    types.push(got);
    // end it cleanly
    await ev(() => { window.__debug.mission.timeLeft = 0.01; });
    await page.waitForTimeout(300);
  }
  check('Missions: delivery/race/air/taxi/hit/boss', JSON.stringify(types) === JSON.stringify(['delivery', 'race', 'air', 'taxi', 'hit', 'boss']), types.join(', '));
  // boss chopper should now be leaving after the fail
  await ev(() => { for (const h of window.__debug.world.policeHelis) { h.boss = false; h.leaving = true; } });
}

// ---- 14. pigeons ----
{
  const p = await ev(() => {
    const d = window.__debug;
    return d.flocks && d.flocks.length >= 3 && d.flocks.every((f) => f.mesh);
  });
  check('Pigeon flocks', p);
}

// ---- 15. day/night + weather objects ----
{
  const dn = await ev(() => {
    const d = window.__debug;
    d.setClock(23); // late night
    return d.world.clock >= 22 && !!d.weather;
  });
  check('Day/night cycle + weather', dn, 'clock set to 23:00, weather system live');
  await ev(() => window.__debug.setClock(12));
}

// ---- 16. death topple + respawn ----
{
  await resetPlayer();
  await ev(() => { window.__debug.player.health = 0; });
  await page.waitForTimeout(400);
  const over = await ev(() => ({
    state: window.__debug.getState(),
    fell: Math.abs(window.__debug.player.mesh.rotation.z - Math.PI / 2) < 0.1,
  }));
  await page.waitForFunction(() => window.__debug.getState() === 'play', null, { timeout: 8000 });
  const back = await ev(() => window.__debug.player.health > 0 && window.__debug.player.mesh.rotation.z === 0);
  check('WASTED topple + respawn', over.state === 'over' && over.fell && back);
}

// ---- 17. save file has the new fields ----
{
  const save = await ev(() => {
    window.__debug.world.onSave();
    return JSON.parse(localStorage.getItem('opencity-save-v1') || '{}');
  });
  const ok = 'upg' in save && 'gang' in save && 'radio' in save && 'money' in save;
  check('Autosave (upgrades/gang/radio persisted)', ok, Object.keys(save).join(','));
}

console.log('---');
const fails = results.filter(([, ok]) => !ok).length;
console.log(`AUDIT: ${results.length - fails}/${results.length} features verified, runtime errors: ${errors}`);
await browser.close();
process.exitCode = fails > 0 || errors > 0 ? 1 : 0;
