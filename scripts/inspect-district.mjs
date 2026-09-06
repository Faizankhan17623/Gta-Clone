import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const label = process.argv[2] || 'district';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', label);
await mkdir(out, { recursive: true });
const mobile = process.argv.includes('--mobile');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: mobile ? { width: 960, height: 600 } : { width: 1440, height: 900 }, hasTouch: mobile, isMobile: mobile, serviceWorkers: 'block' });
const errors = [];
// Time jumps trigger full-screen event announcements; hide only those overlays
// in review captures, without changing the live game's UI or event state.
const captureStyle = '#banner, #toast, #missionmsg { visibility: hidden !important; }';
page.on('pageerror', e => errors.push(e.message));
page.on('requestfailed', r => errors.push(`${r.url()}: ${r.failure()?.errorText}`));
try {
  await page.goto(`http://localhost:${process.env.PORT || 8080}`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForFunction(() => window.__debug, null, { timeout: 20000 });
  await page.click('#playbtn');
  await page.evaluate(() => { const d = window.__debug; d.world.godT = 999; d.world.noCopsT = 999; d.weather.intensity = 0; });
  const checks = await page.evaluate(async () => {
    const { groundHeight, resolveCircle, ROAD } = await import('/js/city.js');
    const city = window.__debug.world.city;
    if (!city.buildings) return { baseline: true };
    const buildings = city.buildings.filter(b => b.style && b.bi >= 4 && b.bi <= 5 && b.bj >= 4 && b.bj <= 5);
    const roofsAligned = buildings.every(b => {
      const collider = city.colliders.find(c => Math.abs(c.x0 - (b.x - b.w / 2)) < .001 && Math.abs(c.z0 - (b.z - b.d / 2)) < .001);
      return collider && Math.abs(groundHeight({ x: b.x, z: b.z, y: b.h + 1 }, [collider]) - (b.h + .2)) < .001;
    });
    const buildingsSolid = buildings.every(b => {
      const p = { x: b.x, z: b.z };
      resolveCircle(p, .4, city.colliders);
      return p.x < b.x - b.w / 2 || p.x > b.x + b.w / 2 || p.z < b.z - b.d / 2 || p.z > b.z + b.d / 2;
    });
    const propsClearOfRoad = city.colliders.filter(c => c.detail).every(c =>
      !city.roadXs.some(x => c.x1 > x - ROAD / 2 && c.x0 < x + ROAD / 2) &&
      !city.roadZs.some(z => c.z1 > z - ROAD / 2 && c.z0 < z + ROAD / 2));
    const canary = buildings[0];
    const detailBudgetBounded = city.district.stats.loadedDistricts <= 4;
    const nearbyVisible = city.district.group?.visible === true;
    const character = window.__debug.player.ch;
    const articulatedCharacter = !!(character.lElbow && character.rElbow && character.lKnee && character.rKnee);
    const sedan = window.__debug.world.parked.find(v => v.mesh.userData.modelDetail);
    const vehicleContract = !!sedan && sedan.wheels.length === 4 && sedan.mesh.children[0].userData.respray === true;
    const batchedBuildingFaces = city.buildings.every(b => b.mesh.geometry.groups.length === 2 &&
      b.mesh.geometry.groups.reduce((n, g) => n + g.count, 0) === 36);
    return { sixteenBuildings: buildings.length === 16, roofsAligned, buildingsSolid, propsClearOfRoad, detailBudgetBounded, nearbyVisible, facadeHasMaterial: !!canary.mesh.material[0].map, articulatedCharacter, vehicleContract, batchedBuildingFaces };
  });
  for (const [name, passed] of Object.entries(checks)) assert.equal(passed, true, name);
  for (const [name, hour] of [['day', 13], ['dusk', 18.8], ['night', 23]]) {
    await page.evaluate(hour => {
      const d = window.__debug;
      d.teleport(0, 0, -18); d.player.vy = 0;
      d.setCamYaw(0.6); d.setCamPitch(0.12); d.setClock(hour);
    }, hour);
    await page.waitForTimeout(1600);
    await page.screenshot({ path: path.join(out, `${name}.png`), style: captureStyle });
  }
  await page.evaluate(() => {
    const d = window.__debug;
    d.teleport(3, 0, 42); d.player.vy = 0;
    d.setCamYaw(1.1); d.setCamPitch(.12); d.setClock(16.5);
  });
  await page.waitForTimeout(1600);
  await page.screenshot({ path: path.join(out, 'street.png'), style: captureStyle });
  const report = await page.evaluate(async () => {
    const d = window.__debug;
    const frames = [];
    let prev = performance.now();
    await new Promise(resolve => {
      function frame(now) { frames.push(now - prev); prev = now; if (frames.length < 40) requestAnimationFrame(frame); else resolve(); }
      requestAnimationFrame(frame);
    });
    frames.sort((a, b) => a - b);
    return { state: d.getState(), medianFrameMs: frames[20], p95FrameMs: frames[38], buildingCount: d.world.city.buildings?.length, district: d.world.city.district?.stats, renderer: d.renderInfo?.(), colliders: d.world.city.colliders.length };
  });
  await page.evaluate(() => {
    const d = window.__debug;
    const sedan = d.world.parked.find(v => v.mesh.userData.modelDetail);
    if (!sedan) return;
    d.teleport(sedan.pos.x - 3, 0, sedan.pos.z - 6); d.player.vy = 0;
    d.setCamYaw(.4); d.setCamPitch(.16); d.setClock(15);
  });
  await page.waitForTimeout(1600);
  await page.screenshot({ path: path.join(out, 'sedan.png'), style: captureStyle });
  await writeFile(path.join(out, 'report.json'), JSON.stringify({ ...report, checks, mobile, errors }, null, 2));
  console.log(JSON.stringify({ ...report, checks, mobile, errors, screenshots: out }, null, 2));
  if (errors.length) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ message: error.message, errors }, null, 2));
  await page.screenshot({ path: path.join(out, 'failure.png') });
  process.exitCode = 1;
} finally { await browser.close(); }
