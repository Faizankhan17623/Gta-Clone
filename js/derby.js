import * as THREE from 'three';
import { blockStart, BLOCK, pointBlocked } from './city.js';
import { makeVehicle, physStep, separateCars, darkenCar } from './car.js';
import { showToast, showNews, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxMissionFail, sfxCrash, engine } from './sound.js';
import { addRep, addChaos } from './economy.js';
import { addExplosion, addSparks, addSmoke } from './effects.js';

// Derby Nights: a dirt oval on the north lawn, open 20:00-02:00. Drive
// anything through the gate, pay the $500 entry, and it's you against seven
// lunatics — last machine still rolling takes the purse. Garage armor and
// ram spikes suddenly look like very sensible purchases.

const ENTRY = 500;
const PURSE = 3000;
const RING_R = 22;
const AI_COLORS = ['#b23434', '#f5a800', '#2fd06a', '#c95aff', '#3dd2ff', '#f2f2f2', '#8a5222'];

export function initDerby(scene, world) {
  // probe for a clear lawn north of the park
  let cx = blockStart(5) + BLOCK / 2;
  let cz = blockStart(3) + BLOCK / 2;
  const probe = new THREE.Vector3();
  outer:
  for (const [bi, bj] of [[5, 3], [3, 5], [6, 6], [4, 3], [3, 4]]) {
    const x = blockStart(bi) + BLOCK / 2;
    const z = blockStart(bj) + BLOCK / 2;
    let clear = true;
    for (const [dx, dz] of [[0, 0], [15, 0], [-15, 0], [0, 15], [0, -15], [15, 15], [-15, -15]]) {
      probe.set(x + dx, 1, z + dz);
      if (pointBlocked(probe, world.city.colliders, 1)) { clear = false; break; }
    }
    if (clear) { cx = x; cz = z; break outer; }
  }

  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(RING_R + 2, RING_R + 2, 0.18, 36),
    new THREE.MeshLambertMaterial({ color: 0x6a4a30 })
  );
  pad.position.set(cx, 0.09, cz);
  pad.receiveShadow = true;
  scene.add(pad);
  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(RING_R + 2.4, RING_R + 2.4, 1.2, 36, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xff9a3d, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })
  );
  rim.position.set(cx, 0.6, cz);
  scene.add(rim);

  // gate sign
  const c = document.createElement('canvas');
  c.width = 160; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#1a1008'; g.fillRect(0, 0, 160, 64);
  g.fillStyle = '#ff9a3d'; g.font = 'bold 22px Arial'; g.textAlign = 'center';
  g.fillText('DERBY NIGHTS', 80, 28);
  g.font = 'bold 12px Arial'; g.fillStyle = '#f2f2f2';
  g.fillText('20:00-02:00 · $500 · last one rolling', 80, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.35), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  const signPos = new THREE.Vector3(cx + RING_R + 5, 0, cz);
  sign.position.copy(signPos).setY(2.2);
  sign.rotation.y = -Math.PI / 2;
  scene.add(sign);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.6, 0.25), new THREE.MeshLambertMaterial({ color: 0x3a2a18 }));
  post.position.copy(signPos).setY(1.3);
  scene.add(post);

  world.derby = { center: new THREE.Vector3(cx, 0, cz), signPos, active: false, cars: [], countT: 0, cleanT: 0 };
}

// wasted/busted mid-derby: no refunds, the wrecks stay a while
export function abortDerby(world) {
  const d = world.derby;
  if (!d?.active) return;
  d.active = false;
  d.cleanT = 8;
}

function endDerby(world, won) {
  const d = world.derby;
  d.active = false;
  d.cleanT = 8; // wrecks smoulder a while, then the lawn gets cleaned
  if (won) {
    const pay = Math.round(PURSE * (world.payMult || 1));
    world.money += pay;
    addRep(world, 300);
    if (world.stats) world.stats.derbies = (world.stats.derbies || 0) + 1;
    sfxMissionPass();
    showMissionMsg('LAST ONE ROLLING', `+$${pay} — the crowd wants your autograph and your bumper`, '#ff9a3d');
    showNews('derby night ends with one very dented champion');
  } else {
    sfxMissionFail();
    showMissionMsg('WRECKED OUT', 'The purse goes home with someone uglier.', '#ff5a4a');
  }
  world.onSave?.();
}

const _bv = new THREE.Vector3();

export function updateDerby(world, dt) {
  const d = world.derby;
  if (!d) return;
  const player = world.player;
  world.derbyHint = null;

  // clear the wreckage after the dust settles
  if (!d.active && d.cars.length) {
    d.cleanT -= dt;
    if (d.cleanT <= 0) {
      for (const c of d.cars) world.scene.remove(c.mesh);
      d.cars = [];
    }
  }

  const night = world.clock >= 20 || world.clock < 2;

  if (!d.active) {
    const focus = player.inCar ? player.inCar.pos : player.pos;
    const ds = Math.hypot(focus.x - d.signPos.x, focus.z - d.signPos.z);
    if (ds < 9) {
      if (!night) world.derbyHint = 'DERBY NIGHTS — gates open at <b>20:00</b>';
      else if (player.inCar) world.derbyHint = 'DERBY — park it and press <b>E</b> at the gate to enter';
      else if (findEntryCar(world)) {
        world.derbyHint = `Press <b>E</b> to enter the DEMOLITION DERBY — $${ENTRY} entry, $${PURSE} purse, your car rides with you`;
      } else {
        world.derbyHint = 'DERBY — bring a car to the gate (bikes and tanks need not apply)';
      }
    }
    return;
  }

  // ---- live derby ----
  const pcar = player.inCar && !player.inCar.dead ? player.inCar : null;

  if (d.countT > 0) {
    d.countT -= dt;
    world.derbyHint = `DERBY — <b>${Math.ceil(d.countT)}</b>...`;
    if (d.countT <= 0) {
      sfxCrash(14);
      showToast('🏁 WRECK EVERYTHING');
    }
    return;
  }

  const alive = d.cars.filter((c) => !c.dead);
  world.derbyHint = `DERBY — rivals rolling: <b>${alive.length}</b>` +
    (pcar ? ` · your ride ${Math.max(0, Math.round(pcar.health))}hp` : '');

  // AI: floor it at the nearest thing that still moves
  for (const c of alive) {
    let tgt = pcar;
    let best = pcar ? c.pos.distanceTo(pcar.pos) : Infinity;
    for (const o of alive) {
      if (o === c) continue;
      const dd = c.pos.distanceTo(o.pos);
      if (dd < best) { best = dd; tgt = o; }
    }
    if (!tgt) break;
    const err = Math.atan2(tgt.pos.x - c.pos.x, tgt.pos.z - c.pos.z) - c.heading;
    let e = err;
    while (e > Math.PI) e -= Math.PI * 2;
    while (e < -Math.PI) e += Math.PI * 2;
    physStep(c, { steer: Math.max(-1, Math.min(1, e * 2.2)), throttle: Math.abs(e) > 2.4 ? -0.6 : 1, handbrake: false }, dt, world.city.colliders);

    // keep everyone inside the bowl
    _bv.set(c.pos.x - d.center.x, 0, c.pos.z - d.center.z);
    const r = _bv.length();
    if (r > RING_R) {
      _bv.multiplyScalar(1 / r);
      c.vel.addScaledVector(_bv, -14 * dt * (r - RING_R));
      c.pos.addScaledVector(_bv, -(r - RING_R) * 0.5);
    }
    if (c.health < 40 && Math.random() < dt * 4) addSmoke(c.pos.clone().setY(1), 0.6);
  }

  // demolition: every pair trades paint and worse
  const combat = pcar ? [pcar, ...alive] : alive;
  for (let i = 0; i < combat.length; i++) {
    for (let j = i + 1; j < combat.length; j++) {
      const a = combat[i];
      const b = combat[j];
      const imp = separateCars(a, b, false);
      if (imp > 4) {
        a.health -= imp * (b.spikes ? 4 : 2);
        b.health -= imp * (a.spikes ? 4 : 2);
        sfxCrash(imp);
        addSparks(a.pos.clone().lerp(b.pos, 0.5).setY(0.8), 8);
        if (a === pcar || b === pcar) world.shake = Math.min(0.4, imp * 0.02);
      }
    }
  }
  // player ring containment (gentler — you're allowed to flee like a coward)
  if (pcar) {
    _bv.set(pcar.pos.x - d.center.x, 0, pcar.pos.z - d.center.z);
    const r = _bv.length();
    if (r > RING_R + 6) {
      pcar.health -= 6 * dt; // the crowd throws bottles
      if (Math.random() < dt) showToast('GET BACK IN THE RING');
    }
  }

  for (const c of alive) {
    if (c.health <= 0) {
      c.dead = true;
      c.vel.set(0, 0, 0);
      addExplosion(c.pos);
      darkenCar(c);
      addChaos(world, 8);
    }
  }

  const aliveNow = d.cars.filter((c) => !c.dead).length;
  if (!pcar) { endDerby(world, false); return; }
  if (aliveNow === 0) endDerby(world, true);
}

// a usable ride parked near the gate (you drove it here, then hopped out)
function findEntryCar(world) {
  const d = world.derby;
  let best = null;
  let bestD = 12;
  for (const v of world.parked) {
    if (v.dead || v.bike || v.tank) continue;
    const dd = Math.hypot(v.pos.x - d.signPos.x, v.pos.z - d.signPos.z);
    if (dd < bestD) { bestD = dd; best = v; }
  }
  return best;
}

// called from main with pressed keys — E at the gate, ON FOOT, car parked
// beside you (pressing E inside a car means "get out", so entry is on foot)
export function tryStartDerby(world, pressed) {
  const d = world.derby;
  if (!d || d.active) return;
  const player = world.player;
  const night = world.clock >= 20 || world.clock < 2;
  const ds = Math.hypot(player.pos.x - d.signPos.x, player.pos.z - d.signPos.z);
  if (!pressed['KeyE'] || ds > 9 || player.inCar || player.inHeli || !night) return;
  const entry = findEntryCar(world);
  if (!entry) return;
  if (world.money < ENTRY) { showToast('Not enough cash for the entry fee'); return; }
  world.money -= ENTRY;

  // clean any old wrecks, then buckle the player into their ride at the edge
  for (const c of d.cars) world.scene.remove(c.mesh);
  d.cars = [];
  const pi = world.parked.indexOf(entry);
  if (pi >= 0) world.parked.splice(pi, 1);
  entry.ai = null;
  player.inCar = entry;
  player.mesh.visible = false;
  engine.start();
  const pcar = player.inCar;
  pcar.pos.set(d.center.x, 0, d.center.z + RING_R - 4);
  pcar.heading = Math.PI;
  pcar.vel.set(0, 0, 0);

  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.4;
    const car = makeVehicle(
      world.scene,
      d.center.x + Math.sin(a) * (RING_R - 4),
      d.center.z + Math.cos(a) * (RING_R - 4),
      a + Math.PI, // face inward
      AI_COLORS[i], { health: 130 }
    );
    car.derby = true;
    d.cars.push(car);
  }
  d.active = true;
  d.countT = 3;
  sfxMissionFail();
  showMissionMsg('DEMOLITION DERBY', 'Seven rivals. One purse. Zero insurance.', '#ff9a3d');
  showNews('derby night at the north lawn — paramedics on standby, optimistically');
}
