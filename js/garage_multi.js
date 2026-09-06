import * as THREE from 'three';
import { blockStart } from './city.js';
import { showToast, showNews } from './hud.js';
import { makeVehicle, resprayVehicle } from './car.js';
import { sfxPickup, sfxMissionPass } from './sound.js';

// LOCKUP: a second, larger garage with three numbered bays. Drive a car or
// bike onto a bay and exit to store it — type, tuning class and paint are
// kept. Press 1-3 on foot to bring that bay's vehicle out. Stored rides
// respawn here if wrecked. This is separate from the spawn-side garage pad
// (shops.js); it does not touch that save.

const SLOTS = 3;

// Read a compact, save-safe descriptor off any vehicle.
function describe(v) {
  const d = { bike: !!v.bike, monster: !!v.monster };
  if (v.accel != null) d.accel = v.accel;
  if (v.top != null) d.top = v.top;
  if (v.rad != null) d.rad = v.rad;
  const bodyColor = v.mesh?.children?.[0]?.material?.color;
  d.color = bodyColor ? '#' + bodyColor.getHexString() : (v.bike ? '#23262d' : '#3d6b8f');
  return d;
}

function buildFrom(scene, desc, x, z) {
  const opts = {};
  if (desc.bike) opts.bike = true;
  if (desc.monster) opts.monster = true;
  if (desc.accel != null) opts.accel = desc.accel;
  if (desc.top != null) opts.top = desc.top;
  if (desc.rad != null) opts.rad = desc.rad;
  const v = makeVehicle(scene, x, z, 0, desc.color || '#3d6b8f', opts);
  if (desc.color) resprayVehicle(v, desc.color);
  return v;
}

export function initGarageMulti(scene, world, save) {
  const base = new THREE.Vector3(blockStart(2) + 30, 0, blockStart(7) + 8);

  // shed + numbered bays
  const shed = new THREE.Mesh(
    new THREE.BoxGeometry(20, 5, 9),
    new THREE.MeshStandardMaterial({ color: 0x394450, metalness: 0.2, roughness: 0.8 })
  );
  shed.position.copy(base).setY(2.5).add(new THREE.Vector3(0, 0, -6));
  shed.castShadow = true;
  scene.add(shed);

  const bays = [];
  for (let i = 0; i < SLOTS; i++) {
    const bx = base.x - 6 + i * 6;
    const bz = base.z;
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(2.9, 2.9, 0.18, 20),
      new THREE.MeshStandardMaterial({ color: 0x1a2a45, roughness: 0.9 })
    );
    pad.position.set(bx, 0.25, bz);
    scene.add(pad);
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(2.9, 2.9, 0.5, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x4a8cff, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.position.set(bx, 0.45, bz);
    scene.add(ring);

    const c = document.createElement('canvas');
    c.width = 32; c.height = 32;
    const g = c.getContext('2d');
    g.fillStyle = '#0a0a10'; g.fillRect(0, 0, 32, 32);
    g.fillStyle = '#8fd0ff'; g.font = 'bold 24px Arial';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(i + 1), 16, 17);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const num = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex }));
    num.position.set(bx, 2.4, bz - 4.4);
    scene.add(num);

    bays.push({ x: bx, z: bz, ring, veh: null, desc: null });
  }

  const saved = Array.isArray(save?.lockup) ? save.lockup : [];
  for (let i = 0; i < SLOTS && i < saved.length; i++) {
    if (saved[i]) bays[i].desc = saved[i];
  }

  world.lockup = { base, bays, hint: null };
}

// Persisted array of bay descriptors (or null).
export function lockupSave(world) {
  const lk = world.lockup;
  if (!lk) return [];
  return lk.bays.map((b) => b.desc || null);
}

function ensureBayVehicles(world) {
  const lk = world.lockup;
  for (const b of lk.bays) {
    if (!b.desc) continue;
    if (b.veh && !b.veh.dead && world.parked.includes(b.veh)) continue;
    if (b.veh && b.veh === world.player.inCar) continue; // being driven
    b.veh = buildFrom(world.scene, b.desc, b.x, b.z);
    world.parked.push(b.veh);
  }
}

export function updateGarageMulti(world, dt, keys, pressed) {
  const lk = world.lockup;
  if (!lk) return;
  lk.hint = null;
  world.lockupHint = null;
  const player = world.player;

  for (const b of lk.bays) b.ring.rotation.y += dt;
  ensureBayVehicles(world);

  // store the car you drove in: exit it on a bay
  const car = player.inCar;
  const onFoot = !car && !player.inHeli && player.pos.y < 2;

  const near = Math.hypot(player.pos.x - lk.base.x, player.pos.z - lk.base.z) < 16;
  if (!near) return;

  if (car && !car.tank) {
    for (let i = 0; i < lk.bays.length; i++) {
      const b = lk.bays[i];
      if (Math.hypot(car.pos.x - b.x, car.pos.z - b.z) > 3.2) continue;
      world.lockupHint = `LOCKUP BAY ${i + 1} — exit the vehicle here to store it`;
      break;
    }
    return;
  }

  if (!onFoot) return;
  world.nearKiosk = true;
  const summary = lk.bays.map((b, i) =>
    b.desc ? `${i + 1}) ${b.desc.bike ? 'BIKE' : b.desc.monster ? 'TRUCK' : 'CAR'}` : `${i + 1}) empty`
  ).join(' · ');
  world.lockupHint = `LOCKUP — press a number to bring a ride out · ${summary}`;

  for (let i = 0; i < SLOTS; i++) {
    if (!pressed['Digit' + (i + 1)]) continue;
    const b = lk.bays[i];
    if (!b.desc) { showToast(`Bay ${i + 1} is empty`); continue; }
    if (b.veh && !b.veh.dead) {
      // nudge it off the pad so the player can walk into it
      b.veh.pos.x += 3;
      showToast(`BAY ${i + 1} — ${b.desc.bike ? 'bike' : 'car'} is on the forecourt`);
      sfxPickup();
    }
  }
}

// Called from main's garage check on vehicle exit.
export function lockupStore(world, car) {
  const lk = world.lockup;
  if (!lk || !car || car.tank) return false;
  for (let i = 0; i < lk.bays.length; i++) {
    const b = lk.bays[i];
    if (Math.hypot(car.pos.x - b.x, car.pos.z - b.z) > 3.4) continue;
    b.desc = describe(car);
    b.veh = car; // keep the mesh already on the pad
    showToast(`STORED IN BAY ${i + 1}`);
    showNews('a vehicle is put away at the lockup');
    world.onSave?.();
    return true;
  }
  return false;
}
