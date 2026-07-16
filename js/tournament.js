import * as THREE from 'three';
import { roadCenter } from './city.js';
import { makeVehicle, physStep, separateCars, darkenCar } from './car.js';
import { showToast, showNews, showMissionMsg, setHint } from './hud.js';
import { sfxPickup, sfxMissionPass, sfxMissionFail, sfxCrash } from './sound.js';
import { addRep } from './economy.js';
import { addSparks, addSmoke } from './effects.js';

// THE LADDER: a street-racing tournament, five rungs of escalating rivals.
// Enter at the starting arch downtown. Beat the pack (top 2 finish, you
// need to be one of them) to climb; lose it and you re-run the same rung.
// The fifth win hands you the champion's car and a paint job nobody else
// on the road is allowed to touch.

const rc = roadCenter;
const START = [rc(2) + 6, rc(6)];
const CPS = [[rc(8), rc(6)], [rc(8), rc(2)], [rc(4), rc(2)], [rc(2) + 6, rc(6)]];
const RUNGS = [
  { name: 'RUNG 1 — LOCAL TALENT', rivals: 2, skill: 0.72, pay: 800 },
  { name: 'RUNG 2 — THE REGULARS', rivals: 3, skill: 0.82, pay: 1400 },
  { name: 'RUNG 3 — SPONSORED PLATES', rivals: 3, skill: 0.9, pay: 2200 },
  { name: 'RUNG 4 — THE UNDERGROUND', rivals: 4, skill: 0.97, pay: 3200 },
  { name: 'RUNG 5 — THE CHAMPION', rivals: 4, skill: 1.05, pay: 5000, champ: true },
];
const AI_COLORS = ['#f5a800', '#c95aff', '#3dd2ff', '#2fd06a'];

function ringMesh(color) {
  return new THREE.Mesh(
    new THREE.CylinderGeometry(6, 6, 1.4, 24, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false })
  );
}

export function initTournament(scene, world, save) {
  const start = ringMesh(0xffa030);
  start.position.set(START[0], 0.8, START[1]);
  scene.add(start);

  const cp = ringMesh(0x7cf78c);
  cp.visible = false;
  scene.add(cp);

  world.tourney = {
    startPos: start.position, start, cp,
    rung: Math.min(RUNGS.length, save?.tourneyRung | 0),
    active: false, idx: 0, t: 0, countdown: 0, cars: [], champCar: !!save?.tourneyChamp,
  };
}

function clearCars(world) {
  const t = world.tourney;
  for (const c of t.cars) world.scene.remove(c.mesh);
  t.cars = [];
}

export function abortTournament(world) {
  const t = world.tourney;
  if (!t?.active) return;
  t.active = false;
  clearCars(world);
  t.cp.visible = false;
}

function startRace(world) {
  const t = world.tourney;
  const rung = RUNGS[t.rung];
  const player = world.player;
  t.active = true;
  t.idx = 0;
  t.t = 0;
  t.countdown = 3;
  t.place = null;
  clearCars(world);
  for (let i = 0; i < rung.rivals; i++) {
    const car = makeVehicle(world.scene, START[0] + 3 + i * 2.4, START[1] + 4, Math.PI, AI_COLORS[i % AI_COLORS.length], { health: 999 });
    car.skill = rung.skill * (0.94 + Math.random() * 0.12);
    car.cpIdx = 0;
    car.finished = false;
    t.cars.push(car);
  }
  showMissionMsg(rung.name, `Finish top 2 of ${rung.rivals + 1} to climb the ladder — ${player.inCar ? 'GO!' : 'get in a car!'}`, '#ffa030');
  showNews(`illegal street race forming up downtown — ${rung.rivals} rivals on the grid`);
  sfxMissionFail();
}

function finishRung(world, place) {
  const t = world.tourney;
  const rung = RUNGS[t.rung];
  t.active = false;
  clearCars(world);
  t.cp.visible = false;
  if (place <= 2) {
    const pay = Math.round(rung.pay * (world.payMult || 1));
    world.money += pay;
    addRep(world, 200 + t.rung * 60);
    t.rung = Math.min(RUNGS.length, t.rung + 1);
    sfxMissionPass();
    if (rung.champ) {
      t.champCar = true;
      showMissionMsg('LADDER CHAMPION', `+$${pay} — the champion's gold-striped ride is yours. Nobody else gets that paint.`, '#ffd24a');
      showNews('an unknown driver clears the underground ladder in a single season');
    } else {
      showMissionMsg(`P${place} — CLIMBING`, `+$${pay} — next rung unlocked`, '#7cf78c');
    }
    world.onSave?.();
  } else {
    sfxMissionFail();
    showMissionMsg('OUT OF THE MONEY', `P${place} — same rung, try again`, '#ff5a4a');
  }
}

function moveCp(t) {
  const c = CPS[t.idx];
  t.cp.position.set(c[0], 0.8, c[1]);
  t.cp.visible = true;
}

export function updateTournament(world, dt, pressed) {
  const t = world.tourney;
  if (!t) return;
  const player = world.player;
  world.tourneyHint = null;
  world.tourneyBlip = null;
  t.start.rotation.y += dt;

  if (!t.active) {
    if (t.rung >= RUNGS.length) return; // undefeated
    const focus = player.inCar ? player.inCar.pos : player.pos;
    const d = Math.hypot(focus.x - t.startPos.x, focus.z - t.startPos.z);
    if (d < 8) {
      const rung = RUNGS[t.rung];
      if (!player.inCar) {
        world.tourneyHint = `${rung.name} — bring a car to the arch to enter`;
      } else {
        world.tourneyHint = `Press <b>E</b> to enter ${rung.name} (${rung.rivals} rivals, top 2 climb)`;
        if (pressed['KeyE']) startRace(world);
      }
    }
    return;
  }

  if (t.countdown > 0) {
    const before = Math.ceil(t.countdown);
    t.countdown -= dt;
    const after = Math.ceil(t.countdown);
    if (after !== before) { if (after > 0) showMissionMsg(RUNGS[t.rung].name, `${after}...`, '#ffa030'); else { showMissionMsg('GO!', '', '#7cf78c'); sfxPickup(); moveCp(t); } }
    return;
  }

  if (!player.inCar || player.inCar.dead) { abortTournament(world); sfxMissionFail(); showMissionMsg('RACE ABANDONED', 'Same rung, try again', '#ff5a4a'); return; }
  t.t += dt;

  const pcar = player.inCar;
  const c = CPS[t.idx];
  world.tourneyBlip = { x: c[0], z: c[1] };
  world.tourneyHint = `${RUNGS[t.rung].name} — gate ${t.idx + 1}/${CPS.length} · <b>${t.t.toFixed(1)}s</b>`;
  t.cp.rotation.y += dt * 2;

  // AI rivals chase their own checkpoint index the same way the player does
  for (const car of t.cars) {
    if (car.finished) continue;
    const cc = CPS[car.cpIdx];
    const err = Math.atan2(cc[0] - car.pos.x, cc[1] - car.pos.z) - car.heading;
    let e = err;
    while (e > Math.PI) e -= Math.PI * 2;
    while (e < -Math.PI) e += Math.PI * 2;
    physStep(car, { steer: Math.max(-1, Math.min(1, e * 2.2)), throttle: car.skill, handbrake: false }, dt, world.city.colliders);
    if (Math.hypot(car.pos.x - cc[0], car.pos.z - cc[1]) < 8) {
      car.cpIdx++;
      if (car.cpIdx >= CPS.length) { car.finished = true; car.finishT = t.t; }
    }
  }
  for (let i = 0; i < t.cars.length; i++) {
    for (let j = i + 1; j < t.cars.length; j++) {
      const imp = separateCars(t.cars[i], t.cars[j], false);
      if (imp > 6) { sfxCrash(imp * 0.4); addSparks(t.cars[i].pos.clone().lerp(t.cars[j].pos, 0.5).setY(0.8), 4); }
    }
    const imp = separateCars(pcar, t.cars[i], false);
    if (imp > 6) world.shake = Math.min(0.3, imp * 0.015);
  }

  // player reaching the gate
  if (Math.hypot(pcar.pos.x - c[0], pcar.pos.z - c[1]) < 7) {
    t.idx++;
    if (t.idx >= CPS.length) {
      const finishedBeforePlayer = t.cars.filter((cc) => cc.finished).length;
      finishRung(world, finishedBeforePlayer + 1);
      return;
    }
    sfxPickup();
    moveCp(t);
  }

  // all rivals done and player still short — they beat you, tally place
  const finished = t.cars.filter((cc) => cc.finished).length;
  if (finished === t.cars.length && t.idx < CPS.length) {
    finishRung(world, finished + 1);
  }
}
