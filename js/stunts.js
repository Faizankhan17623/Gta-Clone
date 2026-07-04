import * as THREE from 'three';
import { roadCenter, N, HALF } from './city.js';
import { showToast, showNews } from './hud.js';
import { sfxPickup, sfxMissionPass } from './sound.js';
import { addSparks } from './effects.js';

// Stunt systems: launch ramps on the roads (first jump off each pays),
// rampage skulls (45s of unlimited RPG mayhem), and web trampolines.

const RAMPS = 12;

export function initStunts(scene, world) {
  const ramps = [];
  const rampGeo = new THREE.BoxGeometry(4.2, 0.25, 7);
  const rampMat = new THREE.MeshLambertMaterial({ color: 0xc7641e });
  for (let i = 0; i < RAMPS; i++) {
    // scatter along roads, alternating axis, facing along the road
    const vertical = i % 2 === 0;
    const road = roadCenter(1 + ((i * 2.3) | 0) % (N - 1));
    const along = -HALF + 60 + (i / RAMPS) * (2 * HALF - 120);
    const x = vertical ? road : along;
    const z = vertical ? along : road;
    const heading = vertical ? 0 : Math.PI / 2;
    const mesh = new THREE.Mesh(rampGeo, rampMat);
    mesh.position.set(x, 0.9, z);
    mesh.rotation.y = heading;
    mesh.rotation.x = -0.3; // the slope
    mesh.castShadow = true;
    scene.add(mesh);
    ramps.push({ pos: new THREE.Vector3(x, 0, z), mesh, done: false, cd: 0 });
  }

  // rampage skulls in three far corners
  const skulls = [];
  const skullGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
  for (const [sx, sz] of [[-HALF + 40, -HALF + 40], [HALF - 40, HALF - 40], [-HALF + 40, HALF - 40]]) {
    const mesh = new THREE.Mesh(
      skullGeo,
      new THREE.MeshLambertMaterial({ color: 0xd03030, emissive: 0x801515, emissiveIntensity: 0.8 })
    );
    mesh.position.set(sx, 1.2, sz);
    scene.add(mesh);
    skulls.push({ pos: mesh.position, mesh, cd: 0 });
  }

  world.rampageT = 0;
  world.rampageCount = 0;
  world.tramps = [];
  return { ramps, skulls };
}

// Fire a trampoline web at a ground point the camera looks at (T key).
const trampGeo = new THREE.CylinderGeometry(3, 3, 0.18, 20);
export function placeTrampoline(scene, world, camera, playerPos) {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  if (dir.y > -0.03) dir.y = -0.03; // always lands on the ground somewhere ahead
  const t = -camera.position.y / dir.y;
  if (t > 55) return false;
  const p = camera.position.clone().addScaledVector(dir, t);
  if (Math.hypot(p.x - playerPos.x, p.z - playerPos.z) > 45) return false;
  const mesh = new THREE.Mesh(
    trampGeo,
    new THREE.MeshBasicMaterial({ color: 0xf2f2ec, transparent: true, opacity: 0.55 })
  );
  mesh.position.set(p.x, 0.35, p.z);
  scene.add(mesh);
  world.tramps.push({ pos: mesh.position, mesh, life: 30 });
  if (world.tramps.length > 4) { // keep the city tidy
    const old = world.tramps.shift();
    old.mesh.parent?.remove(old.mesh);
  }
  return true;
}

// Returns a bounce velocity if the player is falling onto a trampoline.
export function tryBounce(world, pos, vy) {
  if (vy >= 0) return null;
  for (const tr of world.tramps) {
    if (pos.y < 1.6 && Math.hypot(pos.x - tr.pos.x, pos.z - tr.pos.z) < 3) {
      return Math.max(13, -vy * 0.95);
    }
  }
  return null;
}

// Car drove over a ramp fast enough? Sets up the air time; pays on first use.
export function checkRamp(state, world, car, dt) {
  car.airY = car.airY || 0;
  car.airVy = car.airVy || 0;

  if (car.airY <= 0) {
    const speed = car.vel.length();
    for (const r of state.ramps) {
      r.cd = Math.max(0, r.cd - dt);
      if (r.cd > 0 || speed < 15) continue;
      if (Math.hypot(car.pos.x - r.pos.x, car.pos.z - r.pos.z) < 3.4) {
        r.cd = 3;
        car.airVy = speed * 0.45;
        car.airY = 0.01;
        car.rampRef = r;
        break;
      }
    }
  }

  if (car.airY > 0 || car.airVy > 0) {
    car.airVy -= 24 * dt;
    car.airY = Math.max(0, car.airY + car.airVy * dt);
    car.pos.y = car.airY;
    if (car.airY === 0 && car.airVy < 0) { // touched down
      car.airVy = 0;
      const r = car.rampRef;
      car.rampRef = null;
      if (r && !r.done) {
        r.done = true;
        world.money += 400;
        world.addXP?.(50);
        sfxMissionPass();
        showToast('STUNT JUMP! +$400');
        showNews('daredevil clears a stunt ramp');
        world.onSave?.();
      }
    }
  }
}

export function updateStunts(state, world, dt) {
  const player = world.player;
  const focus = player.inCar ? player.inCar.pos : player.pos;

  // skull pickups start a rampage
  for (const s of state.skulls) {
    s.cd = Math.max(0, s.cd - dt);
    s.mesh.visible = s.cd <= 0;
    s.mesh.rotation.y += dt * 2;
    if (s.cd <= 0 && Math.hypot(s.pos.x - focus.x, s.pos.z - focus.z) < 3.4) {
      s.cd = 240;
      world.rampageT = 45;
      world.rampageCount = 0;
      sfxPickup();
      showToast('RAMPAGE! 45s — UNLIMITED RPG, $150 A WRECK');
      showNews('explosions rock the city in a violent rampage');
    }
  }

  if (world.rampageT > 0) {
    world.rampageT -= dt;
    if (world.rampageT <= 0) {
      world.rampageT = 0;
      showToast(`RAMPAGE OVER — ${world.rampageCount} destroyed, +$${world.rampageCount * 150}`);
    }
  }

  // trampolines wear out
  for (let i = world.tramps.length - 1; i >= 0; i--) {
    const tr = world.tramps[i];
    tr.life -= dt;
    tr.mesh.material.opacity = 0.55 * Math.min(1, tr.life / 5);
    if (tr.life <= 0) {
      tr.mesh.parent?.remove(tr.mesh);
      world.tramps.splice(i, 1);
    }
  }

  // ramp glow pulse
  for (const r of state.ramps) {
    if (!r.done) r.mesh.material.emissive?.set?.(0);
  }
}

export function bounceFx(pos) {
  addSparks(pos.clone().setY(0.6), 8, 0xffffff);
}
