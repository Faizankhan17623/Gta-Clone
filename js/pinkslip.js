import * as THREE from 'three';
import { roadCenter, blockStart, N, pointBlocked } from './city.js';
import { makeVehicle } from './car.js';
import { showToast, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxMissionFail, sfxPickup } from './sound.js';

// PINK SLIPS: a drag strip on the west perimeter road. Five rivals, each
// faster on paper than the last — beat their time over the quarter-mile
// and their car is parked at the strip with your name on the title.
// Lose and your ride stays with them (you get walked home).

const RIVALS = [
  { name: 'STALLED SAL', time: 30, color: '#a05a2a' },
  { name: 'TWO-STROKE TINA', time: 26, color: '#2aa08a' },
  { name: 'REDLINE RAY', time: 23, color: '#c92a2a' },
  { name: 'GHOST PEPPER', time: 20.5, color: '#e8e8f0' },
  { name: 'THE UNDERTAKER', time: 18.5, color: '#1a1a22' },
];

export function initPinkslip(scene, world, save) {
  const startPos = new THREE.Vector3(roadCenter(0), 0, blockStart(2));
  const finishPos = new THREE.Vector3(roadCenter(0), 0, blockStart(2) + 350);

  const post = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 3.4, 0.4),
    new THREE.MeshStandardMaterial({ color: 0xf05a9a, roughness: 0.5 })
  );
  post.position.copy(startPos).add(new THREE.Vector3(6, 1.7, 0));
  scene.add(post);
  const flagMat = new THREE.MeshBasicMaterial({ color: 0xf05a9a });
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9), flagMat);
  flag.position.copy(post.position).add(new THREE.Vector3(0.9, 1.2, 0));
  scene.add(flag);

  world.pinkslip = { startPos, finishPos, on: false, t: 0, rank: save?.slipRank ?? 0, cars: save?.slipCars ?? 0 };
}

export function endPinkslip(world, quiet) {
  const ps = world.pinkslip;
  if (!ps?.on) return;
  ps.on = false;
  world.slipBlip = null;
  if (!quiet) { sfxMissionFail(); showToast('DRAG VOID — the rival keeps warming his engine'); }
}

export function updatePinkslip(world, dt, pressed) {
  const ps = world.pinkslip;
  if (!ps) return;
  const player = world.player;
  world.slipHint = null;
  world.slipBlip = null;

  if (!ps.on) {
    if (ps.rank >= RIVALS.length) return; // strip conquered
    const car = player.inCar;
    if (!car) return;
    const d = Math.hypot(car.pos.x - ps.startPos.x, car.pos.z - ps.startPos.z);
    if (d < 10) {
      const rv = RIVALS[ps.rank];
      world.slipHint = `PINK SLIPS vs <b>${rv.name}</b> — quarter-mile in under ${rv.time}s · press <b>E</b>… no wait, <b>1</b> to launch`;
      world.nearKiosk = true;
      if (pressed['Digit1']) {
        ps.on = true;
        ps.t = 0;
        sfxPickup();
        showMissionMsg('PINK SLIPS', `${rv.name} flags it — GO GO GO`, '#f05a9a');
      }
    }
    return;
  }

  const car = player.inCar;
  if (!car) { endPinkslip(world); return; }
  ps.t += dt;
  const rv = RIVALS[ps.rank];
  world.slipBlip = { x: ps.finishPos.x, z: ps.finishPos.z };
  world.slipHint = `QUARTER-MILE — <b>${ps.t.toFixed(1)}s</b> / beat ${rv.time}s`;

  if (ps.t > rv.time + 8) { endPinkslip(world); return; }
  if (Math.hypot(car.pos.x - ps.finishPos.x, car.pos.z - ps.finishPos.z) < 12) {
    ps.on = false;
    world.slipBlip = null;
    if (ps.t <= rv.time) {
      ps.rank++;
      ps.cars++;
      // the rival's car, parked at the strip, yours now
      const win = makeVehicle(world.scene, ps.startPos.x + 10, ps.startPos.z + 6 * ps.rank, Math.PI, rv.color);
      world.parked.push(win);
      const pay = Math.round(300 * ps.rank * (world.payMult || 1));
      world.money += pay;
      sfxMissionPass();
      showMissionMsg('PINK SLIP WON', `${rv.name}'s keys + $${pay} · ${ps.rank}/${RIVALS.length} rivals down`, '#f05a9a');
      world.onSave?.();
    } else {
      sfxMissionFail();
      showMissionMsg('TOO SLOW', `${rv.name} laughs in ${rv.time}s — run it back`, '#f05a9a');
    }
  }
}
