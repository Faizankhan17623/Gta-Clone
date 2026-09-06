import * as THREE from 'three';
import { blockStart, pointBlocked, roadCenter, N } from './city.js';
import { showToast } from './hud.js';
import { sfxPickup } from './sound.js';

// GAS STATIONS: four fuel stops around the grid. Cars and bikes burn fuel as
// you drive; run the tank dry and the engine cuts and you coast to a halt.
// Pull onto a forecourt and hold E to refuel for cash. A light layer that is
// off by default — flip FUEL in the pause-menu settings to turn it on.

const SPOTS = [[1, 3], [7, 1], [3, 7], [8, 6]];
const TANK = 100;                 // full tank
const BURN = 0.55;                // % per second at full throttle
const PRICE_PER_PCT = 1.4;        // $ to fill one percent
const PUMP_RATE = 42;             // % filled per second while holding E

function pump(scene, pos) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 1.5, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x2b3a46, metalness: 0.4, roughness: 0.5 })
  );
  base.position.y = 0.75;
  base.castShadow = true;
  group.add(base);
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.34),
    new THREE.MeshBasicMaterial({ color: 0x6fe0ff })
  );
  face.position.set(0, 1.05, 0.26);
  group.add(face);
  const canopy = new THREE.Mesh(
    new THREE.BoxGeometry(9, 0.3, 6),
    new THREE.MeshStandardMaterial({ color: 0xdfe4ea, metalness: 0.2, roughness: 0.7 })
  );
  canopy.position.set(0, 4.2, 0);
  canopy.castShadow = true;
  group.add(canopy);
  for (const [px, pz] of [[-4, -2.6], [4, -2.6], [-4, 2.6], [4, 2.6]]) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 4.1, 6),
      new THREE.MeshStandardMaterial({ color: 0x9aa2ab, metalness: 0.6, roughness: 0.4 })
    );
    post.position.set(px, 2.05, pz);
    group.add(post);
  }
  const c = document.createElement('canvas');
  c.width = 128; c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#0a0a10'; g.fillRect(0, 0, 128, 32);
  g.fillStyle = '#ffb648'; g.font = 'bold 20px Arial';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('FUEL', 64, 17);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.85), new THREE.MeshBasicMaterial({ map: tex }));
  sign.position.set(0, 4.9, 0);
  group.add(sign);

  const ring = new THREE.Mesh(
    new THREE.CylinderGeometry(4.6, 4.6, 0.4, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffb648, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.position.y = 0.4;
  group.add(ring);
  group.userData.ring = ring;

  group.position.copy(pos);
  scene.add(group);
  return group;
}

// A gas station wants a clear apron just off a road: slide along a block edge
// beside the nearest road line until the canopy footprint is unobstructed.
function findApron(world, bi, bj) {
  const rx = roadCenter(Math.min(N, bi + 1)); // road just past the block, on +X
  const zEdge = blockStart(bj);
  for (let step = 0; step < 8; step++) {
    const z = zEdge + 8 + step * 8;
    const pos = new THREE.Vector3(rx - 12, 0, z);
    let clear = true;
    for (const [ox, oz] of [[0, 0], [4, 3], [-4, 3], [4, -3], [-4, -3]]) {
      if (pointBlocked(new THREE.Vector3(pos.x + ox, 1, pos.z + oz), world.city.colliders, 0.8)) { clear = false; break; }
    }
    if (clear) return pos;
  }
  return null;
}

export function initGasStations(scene, world) {
  const stations = [];
  for (const [bi, bj] of SPOTS) {
    const pos = findApron(world, bi, bj);
    if (!pos) continue;
    stations.push({ pos, mesh: pump(scene, pos) });
  }
  // fuel is enabled through settings; the level rides on the player
  world.settings.fuel = !!world.settings.fuel;
  world.gas = { stations, level: TANK, warned: false, owed: 0 };
  world.gasHint = null;
}

// Called from updateDriving with the throttle magnitude actually applied.
export function burnFuel(world, dt, throttleMag) {
  if (!world.settings.fuel) return;
  const g = world.gas;
  if (!g) return;
  g.level = Math.max(0, g.level - BURN * Math.min(1, Math.abs(throttleMag)) * dt);
  if (g.level < 12 && !g.warned) {
    g.warned = true;
    showToast('LOW FUEL — find a gas station');
  }
  if (g.level > 20) g.warned = false;
}

// Engine is dead while the tank is empty and fuel is on.
export function hasFuel(world) {
  return !world.settings.fuel || !world.gas || world.gas.level > 0;
}

export function updateGasStations(world, dt, keys) {
  const g = world.gas;
  if (!g) return;
  world.gasHint = null;
  const player = world.player;
  const car = player.inCar;

  for (const s of g.stations) {
    s.mesh.userData.ring.rotation.y += dt;
    s.mesh.userData.ring.visible = !!car && world.settings.fuel;
  }
  if (!world.settings.fuel) return;

  // full-tank refill only makes sense in a vehicle
  if (!car || car.tank) return;
  let near = null;
  for (const s of g.stations) {
    if (Math.hypot(car.pos.x - s.pos.x, car.pos.z - s.pos.z) < 6) { near = s; break; }
  }
  if (!near) return;

  const missing = TANK - g.level;
  if (missing < 0.5) {
    world.gasHint = 'Tank full';
    return;
  }
  if (keys['KeyE'] && world.money > 0) {
    const add = Math.min(missing, PUMP_RATE * dt, Math.max(0, world.money - g.owed) / PRICE_PER_PCT);
    g.level += add;
    // Carry fractional dollars across frames and refills.
    g.owed += add * PRICE_PER_PCT;
    const charge = Math.floor(g.owed);
    world.money -= charge;
    g.owed -= charge;
    if (Math.random() < dt * 4) sfxPickup();
    world.gasHint = `REFUELLING... ${Math.round(g.level)}%`;
    if (TANK - g.level < 0.5) {
      showToast('TANK FULL');
      world.onSave?.();
    }
  } else {
    const cost = Math.ceil(missing * PRICE_PER_PCT);
    world.gasHint = world.money > 0
      ? `Hold <b>E</b> to refuel (${Math.round(g.level)}% · full ≈ $${cost})`
      : 'No cash for fuel';
  }
}
