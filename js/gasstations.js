import * as THREE from 'three';
import { blockStart, pointBlocked, roadCenter, N } from './city.js';
import { showToast } from './hud.js';
import { consumeFuel, refillVehicle, FUEL_PRICE } from './vehicleFuel.js';

// GAS STATIONS: four fuel stops around the grid. Cars and bikes burn fuel as
// you drive; run the tank dry and the engine cuts and you coast to a halt.
// Pull onto a forecourt and hold E to refuel for cash. A light layer that is
// enabled by default. Fuel remains attached to each individual vehicle.

const SPOTS = [[4, 5], [1, 3], [7, 1], [3, 7], [8, 6]];

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
  const hose = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(.38, 1.3, 0), new THREE.Vector3(.85, .9, .1),
    new THREE.Vector3(.8, .3, .2), new THREE.Vector3(.45, .85, .3),
  ]), 12, .035, 5, false), new THREE.MeshStandardMaterial({ color: 0x151719 }));
  group.add(hose);
  const nozzle = new THREE.Mesh(new THREE.BoxGeometry(.09, .27, .14),
    new THREE.MeshStandardMaterial({ color: 0x23bc78 }));
  nozzle.position.set(.45, .96, .3); group.add(nozzle);
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
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#0a0a10'; g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#ffb648'; g.font = 'bold 23px Arial';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('PETROL · $2 / L', 128, 32);
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
    // Test the full driving apron and its road entrance, including street props
    // between the canopy corners. Corner-only probes missed roadside bins.
    for (let ox = -4; ox <= 10 && clear; ox += 2) {
      for (let oz = -3; oz <= 3; oz += 2) {
        if (pointBlocked(new THREE.Vector3(pos.x + ox, 0, pos.z + oz), world.city.colliders, 1.6)) {
          clear = false; break;
        }
      }
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
  world.settings.fuel = world.settings.fuel !== false;
  world.gas = { stations, active: null };
  world.gasHint = null;
}

// Called from updateDriving with the throttle magnitude actually applied.
export function burnFuel(world, dt, throttleMag, boosting = false) {
  const car = world.player.inCar;
  if (!world.settings.fuel || !car || car.tank) return;
  consumeFuel(car, dt, throttleMag, boosting);
  const fraction = car.fuelLiters / car.fuelCapacityLiters;
  if (fraction < .12 && !car.fuelWarned) {
    car.fuelWarned = true;
    showToast('LOW FUEL — petrol pumps are marked F on the map');
  }
  if (fraction > .2) car.fuelWarned = false;
}

// Engine is dead while the tank is empty and fuel is on.
export function hasFuel(world) {
  const car = world.player.inCar;
  return !world.settings.fuel || !car || car.tank || car.fuelLiters > 0;
}

export function nearbyPump(world, car) {
  return world.gas?.stations.find(s => Math.hypot(car.pos.x - s.pos.x, car.pos.z - s.pos.z) < 5);
}

export function canRefuel(world, car) {
  return !!(world.settings.fuel && car && !car.dead && !car.tank && car.vel.length() < .5
    && car.fuelCapacityLiters - car.fuelLiters > .001 && world.money > .00001 && nearbyPump(world, car));
}

export function updateGasStations(world, dt, keys) {
  const g = world.gas;
  if (!g) return;
  world.gasHint = null;
  const car = world.player.inCar;
  const previous = g.active;
  if (previous) previous.refuelling = false;
  g.active = null;

  for (const s of g.stations) {
    s.mesh.userData.ring.rotation.y += dt;
    s.mesh.userData.ring.visible = !!car && world.settings.fuel;
  }
  if (world.settings.fuel && car && !car.tank && !car.dead) {
    const near = nearbyPump(world, car);
    if (!near) {
      if (!hasFuel(world)) world.gasHint = 'OUT OF FUEL — E to exit · find another vehicle';
    } else if (car.vel.length() >= .5) {
      world.gasHint = 'PETROL — stop inside the ring to refuel';
    } else if (car.fuelCapacityLiters - car.fuelLiters <= .001) {
      world.gasHint = 'Tank full · E to exit';
    } else if (canRefuel(world, car) && keys.KeyE && !keys.KeyW && !keys.KeyS) {
      car.refuelling = true;
      g.active = car;
      const result = refillVehicle(car, dt, world.money);
      world.money = result.money;
      world.gasHint = `REFUELLING · ${car.fuelLiters.toFixed(1)} / ${car.fuelCapacityLiters} L · release E to stop`;
      if (car.fuelCapacityLiters - car.fuelLiters <= .001) showToast('TANK FULL');
    } else {
      world.gasHint = world.money > .00001
        ? `Hold <b>E</b> for petrol · $${FUEL_PRICE}/L · full $${Math.ceil((car.fuelCapacityLiters - car.fuelLiters) * FUEL_PRICE)} · Shift+E to exit`
        : 'No cash for petrol · E to exit';
    }
  }
  if (previous && previous !== g.active) world.onSave?.();
}
