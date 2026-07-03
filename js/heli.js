import * as THREE from 'three';
import { resolveCircle, pointBlocked, HALF } from './city.js';
import { addExplosion, addTracer, addFlash, addSmoke } from './effects.js';
import { addCrime } from './police.js';

const _v = new THREE.Vector3();

export function createHeliMesh(police) {
  const group = new THREE.Group();
  group.rotation.order = 'YXZ';
  const mat = (c, e) => new THREE.MeshStandardMaterial({ color: c, emissive: e || 0x000000, metalness: 0.55, roughness: 0.4 });
  const bodyColor = police ? '#1d2b45' : '#5a5247';

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.7, 4.6), mat(bodyColor));
  body.position.y = 1.8;
  body.castShadow = true;
  group.add(body);

  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.2, 1.2), mat(police ? '#16213a' : '#494238'));
  nose.position.set(0, 1.6, 2.7);
  nose.castShadow = true;
  group.add(nose);

  // cockpit glass
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.9, 1.4), mat('#9fc0d8', 0x223344));
  glass.position.set(0, 2.35, 1.9);
  group.add(glass);

  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 4.4), mat(bodyColor));
  tail.position.set(0, 2.1, -4.2);
  tail.castShadow = true;
  group.add(tail);

  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.5, 1.0), mat(bodyColor));
  fin.position.set(0, 3.0, -6.0);
  group.add(fin);

  // skids
  for (const sx of [-1.05, 1.05]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 4.0), mat('#2a2a2e'));
    skid.position.set(sx, 0.1, 0.4);
    group.add(skid);
    const legF = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), mat('#2a2a2e'));
    legF.position.set(sx, 0.6, 1.4);
    group.add(legF);
    const legB = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), mat('#2a2a2e'));
    legB.position.set(sx, 0.6, -0.8);
    group.add(legB);
  }

  // main rotor
  const mainRotor = new THREE.Group();
  mainRotor.position.set(0, 2.95, 0.4);
  const bladeGeo = new THREE.BoxGeometry(0.32, 0.06, 11);
  const bladeMat = mat('#15151a');
  const b1 = new THREE.Mesh(bladeGeo, bladeMat);
  const b2 = new THREE.Mesh(bladeGeo, bladeMat);
  b2.rotation.y = Math.PI / 2;
  mainRotor.add(b1, b2);
  group.add(mainRotor);

  // tail rotor
  const tailRotor = new THREE.Group();
  tailRotor.position.set(0.42, 2.6, -6.1);
  const tb = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.9, 0.2), bladeMat);
  tailRotor.add(tb);
  group.add(tailRotor);

  if (police) {
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 8, 6),
      new THREE.MeshLambertMaterial({ color: 0x3355ff, emissive: 0x2233cc })
    );
    beacon.position.set(0, 1.0, 2.9);
    group.add(beacon);
    // searchlight cone aimed down
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(7, 26, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide })
    );
    cone.position.set(0, -12, 2);
    group.add(cone);
  }

  return { group, mainRotor, tailRotor };
}

export function makeHeli(scene, x, y, z, heading, police = false) {
  const { group, mainRotor, tailRotor } = createHeliMesh(police);
  group.position.set(x, y, z);
  group.rotation.y = heading;
  scene.add(group);
  return {
    mesh: group,
    mainRotor,
    tailRotor,
    pos: group.position,
    heading,
    vel: new THREE.Vector3(),
    health: police ? 70 : 100,
    dead: false,
    police,
    rotorSpeed: police ? 1 : 0,
    smokeT: 0,
    // police AI state
    orbitA: Math.random() * Math.PI * 2,
    shootT: 2,
    burst: 0,
    leaving: false,
  };
}

export function spinRotors(h, dt) {
  h.mainRotor.rotation.y += 32 * h.rotorSpeed * dt;
  h.tailRotor.rotation.x += 45 * h.rotorSpeed * dt;
}

// Player flight physics. ctl = { fwd: -1..1, yaw: -1..1, up: -1..1 }
export function physStepHeli(h, ctl, dt, colliders) {
  h.rotorSpeed = Math.min(1, h.rotorSpeed + dt * 0.8);

  h.heading += ctl.yaw * 1.5 * dt;
  _v.set(Math.sin(h.heading), 0, Math.cos(h.heading));
  h.vel.x += _v.x * ctl.fwd * 24 * dt;
  h.vel.z += _v.z * ctl.fwd * 24 * dt;
  h.vel.x *= Math.max(0, 1 - 0.75 * dt);
  h.vel.z *= Math.max(0, 1 - 0.75 * dt);

  const targetVy = ctl.up > 0 ? 12 : ctl.up < 0 ? -10 : 0;
  h.vel.y += (targetVy - h.vel.y) * Math.min(1, 3.5 * dt);

  h.pos.addScaledVector(h.vel, dt);

  if (h.pos.y > 110) { h.pos.y = 110; h.vel.y = Math.min(0, h.vel.y); }
  if (h.pos.y < 0.6) {
    if (h.vel.y < -13) h.health -= (-h.vel.y - 13) * 5; // hard landing
    h.pos.y = 0.6;
    h.vel.y = 0;
    h.vel.x *= Math.max(0, 1 - 4 * dt);
    h.vel.z *= Math.max(0, 1 - 4 * dt);
  }

  // building collision (only colliders taller than current altitude)
  const hit = resolveCircle(h.pos, 2.4, colliders, h.pos.y);
  if (hit) {
    const vn = h.vel.x * hit.nx + h.vel.z * hit.nz;
    if (vn < 0) {
      h.vel.x -= hit.nx * vn * 1.4;
      h.vel.z -= hit.nz * vn * 1.4;
      if (-vn > 5) h.health -= (-vn - 5) * 3;
    }
  }

  const B = HALF + 40;
  h.pos.x = Math.max(-B, Math.min(B, h.pos.x));
  h.pos.z = Math.max(-B, Math.min(B, h.pos.z));

  // visuals: tilt with motion
  const fwdSpeed = h.vel.x * Math.sin(h.heading) + h.vel.z * Math.cos(h.heading);
  h.mesh.rotation.y = h.heading;
  h.mesh.rotation.x = -Math.max(-0.3, Math.min(0.3, fwdSpeed / 35 * 0.35)); // nose dips when flying forward
  h.mesh.rotation.z = -ctl.yaw * 0.13;
  spinRotors(h, dt);
}

export function explodeHeli(world, h, byPlayer) {
  if (h.dead) return;
  h.dead = true;
  addExplosion(h.pos);
  h.mesh.traverse((m) => {
    if (m.isMesh) m.material = new THREE.MeshLambertMaterial({ color: 0x141416 });
  });
  if (byPlayer && h.police) addCrime(world, 1);
}

// Dead helis tumble out of the sky; returns true once fully crashed (caller removes).
export function updateFallingHeli(world, h, dt) {
  h.vel.y -= 24 * dt;
  h.heading += 3.5 * dt;
  h.mesh.rotation.y = h.heading;
  h.mesh.rotation.z += 1.2 * dt;
  h.pos.addScaledVector(h.vel, dt);
  addSmoke(h.pos.clone(), 1.2);
  if (h.pos.y <= 0.8) {
    addExplosion(h.pos);
    world.scene.remove(h.mesh);
    return true;
  }
  return false;
}

// ---------------- Police helicopters ----------------

export function updatePoliceHelis(world, dt, hooks) {
  const player = world.player;
  const focus = player.inHeli ? player.inHeli.pos : player.inCar ? player.inCar.pos : player.pos;

  const desired = world.wanted >= 5 ? 2 : world.wanted >= 3 ? 1 : 0;
  // boss choppers (missions) don't count toward the wanted-level quota
  const alive = world.policeHelis.filter((h) => !h.dead && !h.leaving && !h.boss).length;
  if (alive < desired) {
    const ang = Math.random() * Math.PI * 2;
    const h = makeHeli(world.scene, focus.x + Math.sin(ang) * 140, 60, focus.z + Math.cos(ang) * 140, ang + Math.PI, true);
    world.policeHelis.push(h);
    if (hooks?.onSpawn) hooks.onSpawn();
  }
  if (alive > desired) {
    for (const h of world.policeHelis) {
      if (!h.dead && !h.leaving && !h.boss) { h.leaving = true; break; }
    }
  }

  for (let i = world.policeHelis.length - 1; i >= 0; i--) {
    const h = world.policeHelis[i];

    if (h.dead) {
      if (updateFallingHeli(world, h, dt)) world.policeHelis.splice(i, 1);
      continue;
    }

    spinRotors(h, dt);

    let tx, ty, tz;
    if (h.leaving) {
      _v.subVectors(h.pos, focus).setY(0);
      if (_v.lengthSq() < 1) _v.set(1, 0, 0);
      _v.normalize();
      tx = h.pos.x + _v.x * 60;
      tz = h.pos.z + _v.z * 60;
      ty = 80;
      if (h.pos.distanceTo(focus) > 280) {
        world.scene.remove(h.mesh);
        world.policeHelis.splice(i, 1);
        continue;
      }
    } else {
      h.orbitA += dt * 0.45;
      tx = focus.x + Math.sin(h.orbitA) * 22;
      tz = focus.z + Math.cos(h.orbitA) * 22;
      ty = 30;
    }

    // climb over buildings in the way
    if (pointBlocked(_v.set(h.pos.x, h.pos.y - 8, h.pos.z), world.city.colliders, 6)) {
      ty = Math.max(ty, h.pos.y + 15);
    }

    _v.set(tx - h.pos.x, ty - h.pos.y, tz - h.pos.z);
    const dist = _v.length();
    _v.normalize();
    const speed = Math.min(30, dist * 1.1);
    h.vel.lerp(_v.multiplyScalar(speed), Math.min(1, 1.6 * dt));
    h.pos.addScaledVector(h.vel, dt);
    if (h.pos.y < 12) h.pos.y = 12;

    h.heading = Math.atan2(focus.x - h.pos.x, focus.z - h.pos.z);
    h.mesh.rotation.y = h.heading;
    h.mesh.rotation.x = -Math.max(-0.25, Math.min(0.25, (h.vel.x * Math.sin(h.heading) + h.vel.z * Math.cos(h.heading)) / 30 * 0.3));

    // door gunner
    if (!h.leaving) {
      h.shootT -= dt;
      const range = h.pos.distanceTo(focus);
      if (h.burst > 0 && h.shootT <= 0) {
        h.burst--;
        h.shootT = 0.13;
        fireAtPlayer(world, h, focus, hooks);
      } else if (h.burst === 0 && h.shootT <= 0 && range < 70) {
        h.burst = 5;
        h.shootT = 0.4;
      }
    }
  }
}

function fireAtPlayer(world, h, focus, hooks) {
  const player = world.player;
  const from = h.pos.clone();
  from.y -= 1;
  const aim = focus.clone();
  aim.y += 1;
  aim.x += (Math.random() - 0.5) * 4;
  aim.z += (Math.random() - 0.5) * 4;
  addTracer(from, aim);
  addFlash(aim, 0xffd080, 0.3);
  if (hooks?.onShot) hooks.onShot();
  if (Math.random() < 0.45) {
    if (player.inHeli) player.inHeli.health -= 7;
    else if (player.inCar) player.inCar.health -= 7;
    else player.health -= 6;
  }
}
