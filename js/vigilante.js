import * as THREE from 'three';
import { makeVehicle, physStep } from './car.js';
import { roadCenter, N } from './city.js';
import { setHint, showToast, showNews, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxMissionFail } from './sound.js';
import { addRep, addChaos } from './economy.js';

// Vigilante side job: hop into a police cruiser and press V — a criminal
// spawns fleeing across the city. Wreck their car (ram it or shoot it)
// before the clock dies and the next, tougher target spawns. The streak
// pays more each level and your best run is saved.

const BASE_TIME = 55;
const CRIM_COLORS = ['#c22a2a', '#7a2ac2', '#2a8c3c', '#d07020', '#20b8d0'];

export function initVigilante(world, save) {
  world.vig = {
    active: false,
    level: 0, // takedowns this run
    t: 0,
    crim: null,
    retargetT: 0,
    goal: new THREE.Vector3(),
    best: save.vigBest | 0,
  };
}

function spawnCriminal(world) {
  const v = world.vig;
  const p = world.player.inCar.pos;
  // an intersection 110-240m out so the chase starts with a pursuit leg
  let x = roadCenter(0), z = roadCenter(0);
  for (let i = 0; i < 30; i++) {
    x = roadCenter((Math.random() * (N + 1)) | 0);
    z = roadCenter((Math.random() * (N + 1)) | 0);
    const d = Math.hypot(x - p.x, z - p.z);
    if (d > 110 && d < 240) break;
  }
  const crim = makeVehicle(world.scene, x, z, Math.random() * Math.PI * 2, CRIM_COLORS[v.level % CRIM_COLORS.length], {
    health: 90 + v.level * 25,
    accel: 15 + Math.min(6, v.level),
    top: 26 + Math.min(10, v.level * 1.5),
  });
  world.traffic.push(crim); // shootable + rammable like any other car
  v.crim = crim;
  v.retargetT = 0;
  v.t = Math.max(32, BASE_TIME - v.level * 2);
}

// flee toward a far intersection, biased away from the pursuing player
function pickFleeGoal(world) {
  const v = world.vig;
  const c = v.crim;
  const chaser = world.player.inCar ? world.player.inCar.pos : world.player.pos;
  let bx = c.pos.x, bz = c.pos.z, best = -Infinity;
  for (let i = 0; i < 8; i++) {
    const x = roadCenter((Math.random() * (N + 1)) | 0);
    const z = roadCenter((Math.random() * (N + 1)) | 0);
    const away = Math.hypot(x - chaser.x, z - chaser.z);
    const run = Math.hypot(x - c.pos.x, z - c.pos.z);
    if (run < 40) continue;
    const score = away - run * 0.5;
    if (score > best) { best = score; bx = x; bz = z; }
  }
  v.goal.set(bx, 0, bz);
  v.retargetT = 3.5;
}

export function endVigilante(world, why) {
  const v = world.vig;
  if (!v || !v.active) return;
  v.active = false;
  world.vigBlip = null;
  if (v.crim && !v.crim.dead) {
    world.scene.remove(v.crim.mesh);
    const ti = world.traffic.indexOf(v.crim);
    if (ti >= 0) world.traffic.splice(ti, 1);
  }
  v.crim = null;
  sfxMissionFail();
  if (v.level > 0) showMissionMsg('VIGILANTE OVER', `${why} — streak of ${v.level}`, '#ff9a3d');
  else showToast('VIGILANTE OVER — ' + why);
  world.onSave?.();
}

export function updateVigilante(world, dt, pressed) {
  const v = world.vig;
  const player = world.player;
  const car = player.inCar;
  world.vigBlip = null;

  if (!v.active) {
    // offer the job whenever you're cruising in a working cop car
    if (car && car.police && !car.dead && !world.raceBlip && !world.arena?.active) {
      setHint('Press <b>V</b> to start VIGILANTE — hunt fleeing criminals' +
        (v.best ? ` (best streak ${v.best})` : ''));
      if (pressed['KeyV']) {
        v.active = true;
        v.level = 0;
        spawnCriminal(world);
        pickFleeGoal(world);
        sfxMissionPass();
        showMissionMsg('VIGILANTE', 'Wreck the fleeing car — ram it or shoot it', '#4a8cff');
        showNews('an unmarked cruiser starts settling scores downtown');
      }
    }
    return;
  }

  if (!car || !car.police || car.dead) { endVigilante(world, 'You lost the cruiser'); return; }

  const crim = v.crim;
  if (crim.dead) {
    // takedown — pay out, then chain the next target
    const payout = 300 + v.level * 200;
    v.level++;
    world.money += payout;
    addRep(world, 100 + v.level * 40);
    addChaos(world, 15);
    if (v.level > v.best) v.best = v.level;
    sfxMissionPass();
    showToast(`CRIMINAL DOWN +$${payout} · streak ${v.level}`);
    showNews('another getaway car ends up as scrap');
    world.onSave?.();
    spawnCriminal(world);
    pickFleeGoal(world);
    return;
  }

  v.t -= dt;
  if (v.t <= 0) { endVigilante(world, 'The criminal got away'); return; }

  v.retargetT -= dt;
  if (v.retargetT <= 0 || Math.hypot(v.goal.x - crim.pos.x, v.goal.z - crim.pos.z) < 18) {
    pickFleeGoal(world);
  }
  let err = Math.atan2(v.goal.x - crim.pos.x, v.goal.z - crim.pos.z) - crim.heading;
  while (err > Math.PI) err -= Math.PI * 2;
  while (err < -Math.PI) err += Math.PI * 2;
  physStep(crim, {
    steer: Math.max(-1, Math.min(1, err * 2.2)),
    throttle: 1,
    handbrake: false,
  }, dt, world.city.colliders);

  world.vigBlip = { x: crim.pos.x, z: crim.pos.z };
  const d = Math.hypot(crim.pos.x - car.pos.x, crim.pos.z - car.pos.z);
  setHint(`VIGILANTE Lv ${v.level + 1} — target HP <b>${Math.max(0, Math.round(crim.health))}</b> · ${Math.ceil(v.t)}s · ${Math.round(d)}m`);
}
