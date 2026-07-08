import * as THREE from 'three';
import { resolveCircle, HALF } from './city.js';

const CAR_COLORS = ['#6e1f1f', '#1f2f45', '#2a2a2e', '#3d3d42', '#5a5247', '#23402a', '#494544', '#6b6760', '#2e2330', '#14181d', '#b89b2e', '#742a14'];
export function randomCarColor() {
  return CAR_COLORS[(Math.random() * CAR_COLORS.length) | 0];
}

const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 12);
wheelGeo.rotateZ(Math.PI / 2);
const wheelMat = new THREE.MeshStandardMaterial({ color: 0x16161a, roughness: 0.9, metalness: 0.1 });

// Builds a car mesh facing +z. Returns { group, wheels, lightbar }.
export function createCarMesh(color, opts = {}) {
  const group = new THREE.Group();
  // metallic paint that picks up environment reflections
  const mat = (c, e) => new THREE.MeshStandardMaterial({ color: c, emissive: e || 0x000000, metalness: 0.7, roughness: 0.32 });
  const glassMat = (c) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.9, roughness: 0.12 });

  const bodyColor = opts.police ? '#f2f2f2' : color;
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.55, 4.4), mat(bodyColor));
  body.position.y = 0.62;
  body.castShadow = true;
  group.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 2.0), glassMat(opts.police ? '#10141c' : '#3c4c5c'));
  cabin.position.set(0, 1.14, -0.25);
  cabin.castShadow = true;
  group.add(cabin);

  if (opts.police) {
    const stripeL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 3.0), mat('#15151a'));
    stripeL.position.set(-1.01, 0.62, 0);
    group.add(stripeL);
    const stripeR = stripeL.clone();
    stripeR.position.x = 1.01;
    group.add(stripeR);
  }

  // head + tail lights
  const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), mat('#fff7cc', 0x887722));
  hl.position.set(-0.6, 0.66, 2.21);
  group.add(hl);
  const hr = hl.clone();
  hr.position.x = 0.6;
  group.add(hr);
  const tl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), mat('#aa1111', 0x550000));
  tl.position.set(-0.6, 0.66, -2.21);
  group.add(tl);
  const tr = tl.clone();
  tr.position.x = 0.6;
  group.add(tr);

  const wheels = [];
  const wpos = [[-0.95, 1.5], [0.95, 1.5], [-0.95, -1.5], [0.95, -1.5]];
  for (const [x, z] of wpos) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.order = 'YXZ';
    w.position.set(x, 0.36, z);
    group.add(w);
    wheels.push(w);
  }

  let lightbar = null;
  if (opts.police) {
    lightbar = { red: null, blue: null };
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.34), new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xcc0000 }));
    red.position.set(-0.3, 1.47, -0.25);
    group.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.34), new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x0011cc }));
    blue.position.set(0.3, 1.47, -0.25);
    group.add(blue);
    lightbar.red = red;
    lightbar.blue = blue;
  }

  return { group, wheels, lightbar };
}

// Slim, fast motorbike facing +z.
export function createBikeMesh(color) {
  const group = new THREE.Group();
  const mat = (c) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.7, roughness: 0.35 });

  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 2.0), mat(color));
  frame.position.y = 0.75;
  frame.castShadow = true;
  group.add(frame);
  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.8), mat('#15151a'));
  tank.position.set(0, 1.0, 0.35);
  group.add(tank);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.8), mat('#26262c'));
  seat.position.set(0, 1.02, -0.55);
  group.add(seat);
  const bars = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 0.08), mat('#3a3a40'));
  bars.position.set(0, 1.25, 0.85);
  group.add(bars);

  const wheels = [];
  for (const z of [1.05, -1.05]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.order = 'YXZ';
    w.scale.set(0.6, 1.2, 1.2);
    w.position.set(0, 0.42, z);
    group.add(w);
    wheels.push(w);
  }
  return { group, wheels, lightbar: null };
}

// Standard vehicle object used by player cars, parked cars, traffic and police.
// Note: `pos` aliases mesh.position so writes to pos move the mesh.
export function makeVehicle(scene, x, z, heading, color, opts = {}) {
  const { group, wheels, lightbar } = opts.bike ? createBikeMesh(color) : createCarMesh(color, opts);
  if (opts.monster) { // jack the body up on big wheels
    group.scale.set(1.25, 1.35, 1.25);
    for (const w of wheels) w.scale.setScalar(1.8);
  }
  group.position.set(x, 0, z);
  group.rotation.y = heading;
  scene.add(group);
  return {
    mesh: group,
    wheels,
    lightbar,
    pos: group.position,
    heading,
    vel: new THREE.Vector3(),
    health: opts.health ?? (opts.bike ? 60 : 100),
    dead: false,
    smokeT: 0,
    police: !!opts.police,
    bike: !!opts.bike,
    tank: !!opts.tank,
    monster: !!opts.monster,
    // physics stats (physStep falls back to car defaults)
    accel: opts.accel ?? (opts.bike ? 26 : undefined),
    top: opts.top ?? (opts.bike ? 55 : undefined),
    rad: opts.rad ?? (opts.bike ? 0.9 : undefined),
  };
}

const _fwd = new THREE.Vector3();
const _side = new THREE.Vector3();

// Arcade car physics step. ctl = { throttle: -1..1, steer: -1..1, handbrake: bool }
// Returns wall impact speed (0 if none).
export function physStep(v, ctl, dt, colliders) {
  _fwd.set(Math.sin(v.heading), 0, Math.cos(v.heading));
  const speedF = v.vel.dot(_fwd);

  let a = 0;
  if (ctl.throttle > 0) {
    a = (v.accel ?? 17) * ctl.throttle * Math.max(0, 1 - speedF / (v.top ?? 38));
  } else if (ctl.throttle < 0) {
    if (speedF > 0.5) a = -26; // braking
    else if (speedF > -11) a = 11 * ctl.throttle; // reversing
  }
  v.vel.addScaledVector(_fwd, a * dt);
  v.vel.multiplyScalar(Math.max(0, 1 - 0.45 * dt));

  // full steering authority from ~4.5 m/s so the car responds immediately
  const steerFactor = Math.max(-1, Math.min(1, speedF / 4.5));
  v.heading += ctl.steer * 2.1 * (ctl.handbrake ? 1.5 : 1) * steerFactor * dt;

  // lateral grip (low while handbraking => drift)
  _fwd.set(Math.sin(v.heading), 0, Math.cos(v.heading));
  const sf = v.vel.dot(_fwd);
  _side.copy(v.vel).addScaledVector(_fwd, -sf);
  const grip = ctl.handbrake ? 2.2 : 8;
  v.vel.addScaledVector(_side, -Math.min(1, grip * dt));

  v.pos.addScaledVector(v.vel, dt);
  v.pos.y = 0;

  let impact = 0;
  const hit = resolveCircle(v.pos, v.rad ?? 1.6, colliders);
  if (hit) {
    const vn = v.vel.x * hit.nx + v.vel.z * hit.nz;
    if (vn < 0) {
      impact = -vn;
      v.vel.x -= hit.nx * vn * 1.5;
      v.vel.z -= hit.nz * vn * 1.5;
      if (impact > 6) v.health -= (impact - 6) * 2.2;
    }
  }

  const B = HALF - 2.5;
  if (v.pos.x > B) { v.pos.x = B; v.vel.x = Math.min(0, v.vel.x); }
  if (v.pos.x < -B) { v.pos.x = -B; v.vel.x = Math.max(0, v.vel.x); }
  if (v.pos.z > B) { v.pos.z = B; v.vel.z = Math.min(0, v.vel.z); }
  if (v.pos.z < -B) { v.pos.z = -B; v.vel.z = Math.max(0, v.vel.z); }

  // visuals
  v.mesh.rotation.y = v.heading;
  v.mesh.rotation.z = v.bike ? -ctl.steer * 0.35 * Math.min(1, sf / 10) : 0; // bikes lean
  const spin = (sf * dt) / 0.36;
  const steerWheels = v.bike ? 1 : 2;
  for (let i = 0; i < v.wheels.length; i++) {
    const w = v.wheels[i];
    w.rotation.x += spin;
    if (i < steerWheels) w.rotation.y = ctl.steer * 0.45;
  }
  return impact;
}

// Circle-circle separation between two cars. Returns relative impact speed (0 if none).
export function separateCars(a, b, bStatic = false) {
  const dx = b.pos.x - a.pos.x;
  const dz = b.pos.z - a.pos.z;
  const R = 3.1;
  const d2 = dx * dx + dz * dz;
  if (d2 > R * R || d2 < 1e-6) return 0;
  const d = Math.sqrt(d2);
  const nx = dx / d;
  const nz = dz / d;
  const overlap = R - d;
  if (bStatic) {
    a.pos.x -= nx * overlap;
    a.pos.z -= nz * overlap;
  } else {
    a.pos.x -= nx * overlap * 0.5;
    a.pos.z -= nz * overlap * 0.5;
    b.pos.x += nx * overlap * 0.5;
    b.pos.z += nz * overlap * 0.5;
  }
  const relv = (a.vel.x - b.vel.x) * nx + (a.vel.z - b.vel.z) * nz;
  if (relv > 0) {
    a.vel.x -= nx * relv * 0.9;
    a.vel.z -= nz * relv * 0.9;
    if (!bStatic) {
      b.vel.x += nx * relv * 0.5;
      b.vel.z += nz * relv * 0.5;
    }
    return relv;
  }
  return 0;
}

// Recolor a vehicle's main body panel (garage respray).
export function resprayVehicle(v, color) {
  const body = v.mesh.children[0];
  if (body && body.material && body.material.color) body.material.color.set(color);
}

export function darkenCar(v) {
  const burnt = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.95, metalness: 0.05 });
  v.mesh.traverse((m) => {
    if (m.isMesh) m.material = burnt;
  });
}
