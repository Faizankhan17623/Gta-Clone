import * as THREE from 'three';
import { roadCenter } from './city.js';
import { setHint, showToast, showNews, showMissionMsg } from './hud.js';
import { sfxPickup, sfxMissionPass, sfxMissionFail } from './sound.js';
import { addRep } from './economy.js';
import { WATER_X0, WATER_Y } from './water.js';

// Free-roam races: drive into a start ring in a car (or stand in one on foot
// for the swing trial) and the countdown begins. Checkpoint rings, a timer,
// gold/silver/bronze medals, cash payouts, best times saved.

const rc = roadCenter;

const RACES = [
  {
    key: 'circuit', name: 'DOWNTOWN CIRCUIT', kind: 'car', color: 0xff9a3d,
    start: [rc(5) + 6, rc(4)],
    cps: [[rc(7), rc(4)], [rc(7), rc(7)], [rc(3), rc(7)], [rc(3), rc(3)], [rc(5), rc(3)], [rc(5) + 6, rc(4)]],
    gold: 62, silver: 85, bronze: 115,
  },
  {
    key: 'sprint', name: 'CROSSTOWN SPRINT', kind: 'car', color: 0xff9a3d,
    start: [rc(1), rc(1) + 6],
    cps: [[rc(9), rc(1)], [rc(9), rc(9)], [rc(4), rc(9)]],
    gold: 55, silver: 75, bronze: 100,
  },
  {
    key: 'swing', name: 'SKYLINE SWING TRIAL', kind: 'foot', color: 0x4ad2ff,
    start: [rc(5) - 6, rc(5)],
    cps: [[rc(4), rc(5), 20], [rc(4), rc(3), 26], [rc(6), rc(3), 22], [rc(7), rc(5), 28], [rc(6), rc(6), 20], [rc(5), rc(6), 12]],
    gold: 70, silver: 95, bronze: 125,
  },
  {
    key: 'harbor', name: 'HARBOR CIRCUIT', kind: 'boat', color: 0x3dd2ff, water: true,
    start: [WATER_X0 + 34, -2],
    cps: [[WATER_X0 + 130, -70], [WATER_X0 + 210, 0], [WATER_X0 + 130, 70], [WATER_X0 + 34, -2]],
    gold: 58, silver: 80, bronze: 105,
  },
  {
    key: 'slalom', name: 'BUOY SLALOM', kind: 'boat', color: 0xffd24a, water: true,
    start: [WATER_X0 + 34, 40],
    cps: [[WATER_X0 + 80, 70], [WATER_X0 + 120, 40], [WATER_X0 + 160, 70], [WATER_X0 + 200, 40], [WATER_X0 + 160, 10], [WATER_X0 + 80, 40]],
    gold: 62, silver: 85, bronze: 110,
  },
];

const PAYOUT = { gold: 1500, silver: 800, bronze: 400 };

function ringMesh(color, r, h) {
  return new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, h, 26, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })
  );
}

export function initRaces(scene, world, save) {
  world.raceBest = { ...(save.races || {}) };
  const defs = [];
  for (const def of RACES) {
    const start = ringMesh(def.color, def.water ? 6 : 4.5, 1.2);
    start.position.set(def.start[0], (def.water ? WATER_Y : 0) + 0.7, def.start[1]);
    scene.add(start);
    defs.push({ def, start });
  }
  // one travelling checkpoint ring + a beacon so the next gate is easy to spot
  const cp = ringMesh(0x7cf78c, 6, 3);
  cp.visible = false;
  scene.add(cp);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.8, 1.3, 60, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x7cf78c, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false })
  );
  beam.visible = false;
  scene.add(beam);

  world.races = { defs, cp, beam, active: null, idx: 0, t: 0, countdown: 0, cdT: 0 };
  return world.races;
}

function moveCpRing(st) {
  const c = st.active.cps[st.idx];
  const y = c[2] || 0;
  st.cp.position.set(c[0], y + 1.6, c[1]);
  st.cp.visible = true;
  st.beam.position.set(c[0], y + 30, c[1]);
  st.beam.visible = true;
}

export function endRace(world, failed) {
  const st = world.races;
  if (!st || !st.active) return;
  const def = st.active;
  st.active = null;
  st.cdT = 5; // breather so a loop race can't restart itself at the finish ring
  st.cp.visible = false;
  st.beam.visible = false;
  world.raceBlip = null;
  setHint(null);
  if (failed) {
    sfxMissionFail();
    showMissionMsg('RACE OVER', 'Try again from the start ring', '#ff5a4a');
    return;
  }
  const t = st.t;
  const medal = t <= def.gold ? 'gold' : t <= def.silver ? 'silver' : t <= def.bronze ? 'bronze' : null;
  const pay = medal ? PAYOUT[medal] : 100;
  world.money += pay;
  const best = world.raceBest[def.key];
  if (!best || t < best) {
    world.raceBest[def.key] = Math.round(t * 10) / 10;
    showNews(`new record on the ${def.name.toLowerCase()}`);
  }
  addRep(world, medal === 'gold' ? 400 : medal === 'silver' ? 200 : 100);
  world.addXP?.(150);
  sfxMissionPass();
  showMissionMsg(
    medal ? `${medal.toUpperCase()} MEDAL!` : 'FINISHED',
    `${t.toFixed(1)}s · +$${pay}${world.raceBest[def.key] ? ` · best ${world.raceBest[def.key]}s` : ''}`,
    medal === 'gold' ? '#ffd24a' : '#7cf78c'
  );
  world.onSave?.();
}

export function updateRaces(world, dt) {
  const st = world.races;
  const player = world.player;
  world.raceHint = null;

  if (!st.active) {
    st.cdT = Math.max(0, st.cdT - dt);
    if (st.cdT > 0 || world.mission?.active || world.arena?.active || player.inHeli) return;
    for (const { def, start } of st.defs) {
      start.rotation.y += dt;
      const focus = player.inBoat ? player.inBoat.pos : player.inCar ? player.inCar.pos : player.pos;
      const d = Math.hypot(focus.x - def.start[0], focus.z - def.start[1]);
      if (d > 24) continue;
      const ready = def.kind === 'car' ? !!player.inCar && !player.inCar.tank
        : def.kind === 'boat' ? !!player.inBoat
        : !player.inCar && !player.inBoat;
      if (d > (def.water ? 6.5 : 4.5)) {
        world.raceHint = `${def.name} — ${def.kind === 'foot' ? 'step' : 'drive'} into the ring to race` +
          (world.raceBest[def.key] ? ` (best ${world.raceBest[def.key]}s)` : '');
        continue;
      }
      if (!ready) {
        world.raceHint = def.kind === 'car' ? `${def.name} — you need a car for this one`
          : def.kind === 'boat' ? `${def.name} — you need a boat or jet-ski`
          : `${def.name} — on foot only, webs ready`;
        continue;
      }
      st.active = def;
      st.idx = 0;
      st.t = 0;
      st.countdown = 3;
      moveCpRing(st);
      showMissionMsg(def.name, 'Get ready...', '#ffd24a');
      break;
    }
    return;
  }

  const def = st.active;

  // countdown, then the clock runs
  if (st.countdown > 0) {
    const before = Math.ceil(st.countdown);
    st.countdown -= dt;
    const after = Math.ceil(st.countdown);
    if (after !== before && after > 0) showMissionMsg(def.name, `${after}...`, '#ffd24a');
    if (st.countdown <= 0) { showMissionMsg('GO!', '', '#7cf78c'); sfxPickup(); }
    return;
  }

  st.t += dt;

  // abandoning the vehicle (or wrecking it) forfeits a car/boat race
  if (def.kind === 'car' && (!player.inCar || player.inCar.dead)) { endRace(world, true); return; }
  if (def.kind === 'boat' && !player.inBoat) { endRace(world, true); return; }
  if (st.t > def.bronze + 30) { endRace(world, true); return; }

  const focus = player.inBoat ? player.inBoat.pos : player.inCar ? player.inCar.pos : player.pos;
  const c = def.cps[st.idx];
  const cy = c[2] || 0;
  const dy = cy > 0 ? Math.abs(player.pos.y - cy) : 0;
  st.cp.rotation.y += dt * 2;
  world.raceBlip = { x: c[0], z: c[1] };
  setHint(`${def.name} — gate ${st.idx + 1}/${def.cps.length} · <b>${st.t.toFixed(1)}s</b> (gold ${def.gold}s)`);

  if (Math.hypot(focus.x - c[0], focus.z - c[1]) < (def.kind === 'foot' ? 6.5 : def.kind === 'boat' ? 9 : 7) && dy < 7) {
    st.idx++;
    if (st.idx >= def.cps.length) { endRace(world, false); return; }
    sfxPickup();
    moveCpRing(st);
  }
}
