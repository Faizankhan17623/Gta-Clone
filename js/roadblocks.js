import * as THREE from 'three';
import { roadCenter, N, HALF } from './city.js';
import { showToast, showNews } from './hud.js';
import { addSparks, addFlash } from './effects.js';
import { sfxCrash } from './sound.js';

// POLICE ROADBLOCKS: at 3 stars and above the city drops barricades across
// roads ahead of your car — angled cruisers, striped barriers, a spike strip.
// Ram through (you take a knock and it scatters) or find another route.
// They only exist while you have heat and you are driving; they clean up
// when the chase ends.

const MAX = 3;
const SETUP_GAP = 9;   // seconds between new blocks

function barrier(scene, x, z, horizontal) {
  const group = new THREE.Group();
  const bar = new THREE.Mesh(
    new THREE.BoxGeometry(horizontal ? 6 : 0.5, 1.1, horizontal ? 0.5 : 6),
    new THREE.MeshStandardMaterial({ color: 0xf2f2f2, metalness: 0.2, roughness: 0.7 })
  );
  bar.position.y = 0.9;
  bar.castShadow = true;
  group.add(bar);
  // hazard stripes
  const c = document.createElement('canvas');
  c.width = 64; c.height = 16;
  const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#e23b2e' : '#f2f2f2'; g.fillRect(i * 8, 0, 8, 16); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(horizontal ? 6 : 6, 0.5),
    new THREE.MeshBasicMaterial({ map: tex })
  );
  strip.position.set(0, 0.9, horizontal ? 0.27 : 0);
  strip.rotation.y = horizontal ? 0 : Math.PI / 2;
  group.add(strip);
  for (const s of [-1, 1]) {
    const foot = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.5, 0.6),
      new THREE.MeshStandardMaterial({ color: 0xd24a20 })
    );
    foot.position.set(horizontal ? s * 2.7 : 0, 0.25, horizontal ? 0 : s * 2.7);
    group.add(foot);
  }
  group.position.set(x, 0, z);
  scene.add(group);
  return group;
}

function copCar(scene, x, z, yaw) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2, 0.7, 4.3),
    new THREE.MeshStandardMaterial({ color: 0xf2f2f2, metalness: 0.5, roughness: 0.35 })
  );
  body.position.y = 0.7;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.55, 2),
    new THREE.MeshStandardMaterial({ color: 0x10141c, metalness: 0.6, roughness: 0.2 })
  );
  cabin.position.set(0, 1.25, -0.25);
  group.add(cabin);
  for (const s of [-1, 1]) {
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.32, 3),
      new THREE.MeshStandardMaterial({ color: 0x15151a })
    );
    stripe.position.set(s * 1.02, 0.7, 0);
    group.add(stripe);
  }
  const lamp = new THREE.Mesh(
    new THREE.BoxGeometry(1, 0.16, 0.34),
    new THREE.MeshStandardMaterial({ color: 0x2472ff, emissive: 0x1a4fd0, emissiveIntensity: 0.9 })
  );
  lamp.position.set(0, 1.62, -0.25);
  group.add(lamp);
  group.userData.lamp = lamp;
  group.position.set(x, 0, z);
  group.rotation.y = yaw;
  scene.add(group);
  return group;
}

export function initRoadblocks(scene, world) {
  world.roadblocks = { scene, list: [], setupT: 0 };
}

function clearAll(world) {
  const rb = world.roadblocks;
  for (const b of rb.list) {
    for (const c of b.colliders) {
      const i = world.city.colliders.indexOf(c);
      if (i >= 0) world.city.colliders.splice(i, 1);
    }
    for (const m of b.meshes) rb.scene.remove(m);
  }
  rb.list.length = 0;
}

function dropBlock(world) {
  const rb = world.roadblocks;
  const car = world.player.inCar;
  if (!car) return;
  // place it on the road the car is nearest to, ahead in its travel direction
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  const ahead = { x: car.pos.x + fx * 42, z: car.pos.z + fz * 42 };
  if (Math.abs(ahead.x) > HALF - 20 || Math.abs(ahead.z) > HALF - 20) return;

  // snap to the closest road line, block the cross axis
  let bestV = 0, dV = 1e9, bestH = 0, dH = 1e9;
  for (let i = 0; i <= N; i++) {
    const r = roadCenter(i);
    if (Math.abs(ahead.x - r) < dV) { dV = Math.abs(ahead.x - r); bestV = r; }
    if (Math.abs(ahead.z - r) < dH) { dH = Math.abs(ahead.z - r); bestH = r; }
  }
  const horizontal = dH < dV; // the road runs along X, block spans X
  const cx = horizontal ? ahead.x : bestV;
  const cz = horizontal ? bestH : ahead.z;
  // don't stack two blocks on the same spot
  for (const b of rb.list) {
    if (Math.hypot(b.x - cx, b.z - cz) < 24) return;
  }

  const meshes = [];
  const colliders = [];
  meshes.push(barrier(rb.scene, cx, cz, horizontal));
  const carYaw = horizontal ? 0 : Math.PI / 2;
  for (const s of [-1, 1]) {
    const ox = horizontal ? s * 4.5 : 0;
    const oz = horizontal ? 0 : s * 4.5;
    meshes.push(copCar(rb.scene, cx + ox, cz + oz, carYaw + s * 0.5));
    colliders.push({
      x0: cx + ox - 2.4, z0: cz + oz - 2.4,
      x1: cx + ox + 2.4, z1: cz + oz + 2.4, h: 1.6,
    });
  }
  colliders.push({
    x0: cx - (horizontal ? 3.4 : 0.6), z0: cz - (horizontal ? 0.6 : 3.4),
    x1: cx + (horizontal ? 3.4 : 0.6), z1: cz + (horizontal ? 0.6 : 3.4), h: 1.3,
  });
  for (const c of colliders) world.city.colliders.push(c);
  rb.list.push({ x: cx, z: cz, horizontal, meshes, colliders, hp: 3, t: 0 });
  showNews('units set up a roadblock');
}

export function updateRoadblocks(world, dt) {
  const rb = world.roadblocks;
  if (!rb) return;
  const car = world.player.inCar;
  const heat = world.wanted;

  if (!car || heat < 3) {
    if (rb.list.length) clearAll(world);
    rb.setupT = 0;
    return;
  }

  rb.setupT -= dt;
  if (rb.setupT <= 0 && rb.list.length < MAX) {
    rb.setupT = SETUP_GAP;
    dropBlock(world);
  }

  for (let i = rb.list.length - 1; i >= 0; i--) {
    const b = rb.list[i];
    b.t += dt;
    // blip the light bars
    const on = Math.floor(b.t * 6) % 2 === 0;
    for (const m of b.meshes) {
      if (m.userData.lamp) m.userData.lamp.material.emissiveIntensity = on ? 1.1 : 0.15;
    }
    // ram-through: a fast hit scatters the block and knocks the car
    const d = Math.hypot(car.pos.x - b.x, car.pos.z - b.z);
    if (d < 6 && car.vel.length() > 12) {
      b.hp--;
      addSparks(car.pos.clone().setY(0.8), 14);
      addFlash(car.pos.clone().setY(0.8), 0xffcc66, 1.4);
      sfxCrash(9);
      world.shake = Math.max(world.shake || 0, 0.22);
      car.vel.multiplyScalar(0.72);
      car.health -= 6;
      if (b.hp <= 0) {
        for (const c of b.colliders) {
          const ci = world.city.colliders.indexOf(c);
          if (ci >= 0) world.city.colliders.splice(ci, 1);
        }
        for (const m of b.meshes) rb.scene.remove(m);
        rb.list.splice(i, 1);
        showToast('SMASHED THROUGH THE ROADBLOCK');
      } else {
        showToast('ROADBLOCK — punch through it!');
      }
    }
  }
}
