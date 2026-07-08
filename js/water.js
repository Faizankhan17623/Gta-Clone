import * as THREE from 'three';
import { HALF } from './city.js';

// The harbor: open water past the east edge of the city, behind a low seawall.
// Drivable speedboats and a jet-ski, plus swimming for anyone who falls in.

export const WATER_X0 = HALF + 6;    // seawall / shoreline
export const WATER_X1 = HALF + 260;  // open-water limit
export const WATER_Z = HALF + 40;    // half-width along the shore
export const WATER_Y = 0.55;         // surface height

export function inWater(x, z) {
  return x > WATER_X0 + 1 && x < WATER_X1 && Math.abs(z) < WATER_Z;
}

function makeBoatMesh(kind, color) {
  const group = new THREE.Group();
  const mat = (c) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.55, roughness: 0.4 });
  if (kind === 'jet') {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 2.4), mat(color));
    hull.position.y = 0.3;
    hull.castShadow = true;
    group.add(hull);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 1.1), mat('#1a1a20'));
    seat.position.set(0, 0.65, -0.3);
    group.add(seat);
    const bars = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.08), mat('#2e2e34'));
    bars.position.set(0, 0.85, 0.6);
    group.add(bars);
  } else {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 6.4), mat(color));
    hull.position.y = 0.42;
    hull.castShadow = true;
    group.add(hull);
    const bow = new THREE.Mesh(new THREE.ConeGeometry(1.05, 1.8, 4), mat(color));
    bow.rotation.x = Math.PI / 2;
    bow.rotation.y = Math.PI / 4;
    bow.position.set(0, 0.42, 4.0);
    group.add(bow);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.14, 5.6), mat('#c9bfa4'));
    deck.position.y = 0.88;
    group.add(deck);
    const console = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.7, 0.9), mat('#20242c'));
    console.position.set(0, 1.25, 0.9);
    group.add(console);
    const shield = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.55, 0.06),
      new THREE.MeshStandardMaterial({ color: '#3c4c5c', metalness: 0.9, roughness: 0.12 })
    );
    shield.position.set(0, 1.75, 1.35);
    shield.rotation.x = -0.25;
    group.add(shield);
  }
  return group;
}

export function makeBoat(scene, x, z, heading, kind, color) {
  const mesh = makeBoatMesh(kind, color);
  mesh.position.set(x, WATER_Y - 0.15, z);
  mesh.rotation.y = heading;
  scene.add(mesh);
  return {
    mesh,
    pos: mesh.position,
    heading,
    vel: new THREE.Vector3(),
    kind,
    boat: true,
    dead: false,
    accel: kind === 'jet' ? 22 : 15,
    top: kind === 'jet' ? 42 : 32,
  };
}

export function initWater(scene, world) {
  // animated water sheet
  const segs = 36;
  const geo = new THREE.PlaneGeometry(WATER_X1 - WATER_X0, WATER_Z * 2, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x1b4a66, transparent: true, opacity: 0.88, metalness: 0.55, roughness: 0.2,
  });
  const water = new THREE.Mesh(geo, waterMat);
  water.position.set((WATER_X0 + WATER_X1) / 2, WATER_Y, 0);
  scene.add(water);
  const base = geo.attributes.position.array.slice(); // rest pose for the wave loop

  // seabed tint so the shallows don't show scrubland green
  const bed = new THREE.Mesh(
    new THREE.PlaneGeometry(WATER_X1 - WATER_X0, WATER_Z * 2),
    new THREE.MeshLambertMaterial({ color: 0x11202c })
  );
  bed.rotation.x = -Math.PI / 2;
  bed.position.set((WATER_X0 + WATER_X1) / 2, -0.02, 0);
  scene.add(bed);

  // seawall along the shoreline hides the water sheet's edge
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 1.6, WATER_Z * 2),
    new THREE.MeshLambertMaterial({ color: 0x6d6f74 })
  );
  wall.position.set(WATER_X0 - 0.4, 0.5, 0);
  wall.receiveShadow = true;
  scene.add(wall);

  // wooden piers out over the water, near the city's mid road
  const plankMat = new THREE.MeshLambertMaterial({ color: 0x6b4d2e });
  const postGeo = new THREE.CylinderGeometry(0.18, 0.18, 2.4, 6);
  const piers = [];
  for (const pz of [-24, 14]) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(26, 0.35, 4.4), plankMat);
    pier.position.set(WATER_X0 + 12, 1.15, pz);
    pier.castShadow = true;
    scene.add(pier);
    piers.push(pz);
    for (const dx of [3, 11, 19]) {
      for (const dz of [-1.8, 1.8]) {
        const post = new THREE.Mesh(postGeo, plankMat);
        post.position.set(WATER_X0 + dx + 1, 0.2, pz + dz);
        scene.add(post);
      }
    }
    // walkable: register the pier as a rooftop-style collider
    world.city.colliders.push({
      x0: WATER_X0 - 1, z0: pz - 2.2, x1: WATER_X0 + 25, z1: pz + 2.2, h: 1.35 + 0.3,
    });
  }

  // moored boats, bows pointed out to open water
  const boats = [
    makeBoat(scene, WATER_X0 + 20, -19, Math.PI / 2, 'speed', '#b23434'),
    makeBoat(scene, WATER_X0 + 20, 9, Math.PI / 2, 'speed', '#2e5d8f'),
    makeBoat(scene, WATER_X0 + 14, 19, Math.PI / 2, 'jet', '#f5a800'),
  ];

  world.boats = boats;
  return { water, geo, base, boats, t: 0 };
}

const _fwd = new THREE.Vector3();
const _side = new THREE.Vector3();

// Arcade boat physics: buoyant, drifty, no brakes to speak of.
export function physStepBoat(b, ctl, dt, time) {
  _fwd.set(Math.sin(b.heading), 0, Math.cos(b.heading));
  const speedF = b.vel.dot(_fwd);

  let a = 0;
  if (ctl.throttle > 0) a = b.accel * Math.max(0, 1 - speedF / b.top);
  else if (ctl.throttle < 0) a = speedF > 0.5 ? -10 : -5;
  b.vel.addScaledVector(_fwd, a * dt);
  b.vel.multiplyScalar(Math.max(0, 1 - 0.35 * dt)); // water drag

  // rudder only bites with way on
  const steerFactor = Math.max(-1, Math.min(1, speedF / 6));
  b.heading += ctl.steer * 1.5 * steerFactor * dt;

  // hulls slip sideways more than tyres grip
  _fwd.set(Math.sin(b.heading), 0, Math.cos(b.heading));
  const sf = b.vel.dot(_fwd);
  _side.copy(b.vel).addScaledVector(_fwd, -sf);
  b.vel.addScaledVector(_side, -Math.min(1, 2.5 * dt));

  b.pos.x += b.vel.x * dt;
  b.pos.z += b.vel.z * dt;

  // stay on the water
  let bumped = 0;
  if (b.pos.x < WATER_X0 + 3) { b.pos.x = WATER_X0 + 3; if (b.vel.x < 0) { bumped = -b.vel.x; b.vel.x = 0; } }
  if (b.pos.x > WATER_X1 - 3) { b.pos.x = WATER_X1 - 3; if (b.vel.x > 0) { bumped = b.vel.x; b.vel.x = 0; } }
  if (b.pos.z > WATER_Z - 3) { b.pos.z = WATER_Z - 3; if (b.vel.z > 0) { bumped = b.vel.z; b.vel.z = 0; } }
  if (b.pos.z < -WATER_Z + 3) { b.pos.z = -WATER_Z + 3; if (b.vel.z < 0) { bumped = -b.vel.z; b.vel.z = 0; } }

  // bob and lean with speed
  b.pos.y = WATER_Y - 0.15 + Math.sin(time * 2 + b.pos.x * 0.2) * 0.06;
  b.mesh.rotation.y = b.heading;
  b.mesh.rotation.x = -Math.min(0.14, sf * 0.006) + Math.sin(time * 1.7) * 0.015;
  b.mesh.rotation.z = -ctl.steer * Math.min(0.28, sf * 0.012);
  return bumped;
}

export function updateWater(state, world, dt) {
  state.t += dt;
  const pos = state.geo.attributes.position;
  const arr = pos.array;
  const base = state.base;
  // gentle rolling swell
  for (let i = 0; i < arr.length; i += 3) {
    arr[i + 1] = Math.sin(state.t * 1.4 + base[i] * 0.05 + base[i + 2] * 0.08) * 0.14;
  }
  pos.needsUpdate = true;

  // idle boats bob at their moorings
  for (const b of state.boats) {
    if (b === world.player.inBoat) continue;
    b.pos.y = WATER_Y - 0.15 + Math.sin(state.t * 2 + b.pos.x * 0.2) * 0.06;
    b.mesh.rotation.x = Math.sin(state.t * 1.5 + b.pos.z) * 0.02;
  }
}
