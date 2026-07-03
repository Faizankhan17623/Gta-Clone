import * as THREE from 'three';
import { makeVehicle, physStep, separateCars, darkenCar } from './car.js';
import { roadCenter, HALF, N } from './city.js';
import { addTracer, addFlash, addExplosion } from './effects.js';
import { showToast } from './hud.js';

// Five stars brings the army: a tank hunts the player, lobbing shells.
// It's slow, nearly indestructible — and stealable.

const _v = new THREE.Vector3();

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function makeTank(scene, x, z, heading) {
  const t = makeVehicle(scene, x, z, heading, '#3b4630', {
    tank: true, health: 600, accel: 9, top: 13, rad: 2.2,
  });
  // dress the car chassis up as a tank
  const mat = new THREE.MeshStandardMaterial({ color: 0x3b4630, metalness: 0.4, roughness: 0.7 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.9, 1.0, 5.4), mat);
  hull.position.y = 0.9;
  hull.castShadow = true;
  t.mesh.add(hull);
  const turret = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.8, 2.4), mat);
  turret.position.y = 1.8;
  turret.castShadow = true;
  t.mesh.add(turret);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 3.4, 8), mat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 1.85, 2.6);
  turret.add(barrel);
  t.turret = turret;
  t.shootT = 4;
  t.leaveT = 0;
  return t;
}

// hooks: { boom(pos) } — main's rocket explosion, reused for shells
export function updateArmy(world, dt, hooks) {
  const player = world.player;
  const focus = player.inCar ? player.inCar.pos : player.inHeli ? player.inHeli.pos : player.pos;

  // spawn one tank at five stars
  const active = world.tanks.filter((t) => !t.dead && t !== player.inCar).length;
  if (world.wanted >= 5 && active < 1) {
    let x = 0;
    let z = 0;
    for (let tries = 0; tries < 12; tries++) {
      const road = roadCenter((Math.random() * (N + 1)) | 0);
      const along = (Math.random() * 2 - 1) * (HALF - 14);
      if (Math.random() < 0.5) { x = road; z = along; } else { x = along; z = road; }
      const d = Math.hypot(x - focus.x, z - focus.z);
      if (d > 70 && d < 150) break;
    }
    world.tanks.push(makeTank(world.scene, x, z, Math.atan2(focus.x - x, focus.z - z)));
    showToast('THE ARMY IS HERE — TANK INBOUND');
  }

  for (let i = world.tanks.length - 1; i >= 0; i--) {
    const t = world.tanks[i];
    if (t.dead) {
      t.deadT = (t.deadT || 0) + dt;
      if (t.deadT > 12) {
        world.scene.remove(t.mesh);
        world.tanks.splice(i, 1);
      }
      continue;
    }
    if (t === player.inCar) continue; // the player drives it now

    // heat's off: the army packs up and leaves
    if (world.wanted < 4) {
      t.leaveT += dt;
      if (t.leaveT > 12) {
        world.scene.remove(t.mesh);
        world.tanks.splice(i, 1);
        continue;
      }
    } else {
      t.leaveT = 0;
    }

    const dx = focus.x - t.pos.x;
    const dz = focus.z - t.pos.z;
    const dist = Math.hypot(dx, dz);
    const err = wrapAngle(Math.atan2(dx, dz) - t.heading);
    physStep(t, {
      steer: Math.max(-1, Math.min(1, err * 2)),
      throttle: dist > 14 ? 1 : 0,
      handbrake: false,
    }, dt, world.city.colliders);

    // grind through anything in the way
    for (const o of world.traffic) if (!o.dead) separateCars(t, o, false);
    for (const o of world.parked) separateCars(t, o, false);
    if (player.inCar && !player.inCar.dead) {
      const imp = separateCars(t, player.inCar, false);
      if (imp > 3) player.inCar.health -= imp * 3; // a tank shrugs, your car crumples
    }

    // turret tracks the player
    t.turret.rotation.y = wrapAngle(Math.atan2(dx, dz) - t.heading);

    // cannon
    t.shootT -= dt;
    if (t.shootT <= 0 && dist < 90 && !player.inHeli) {
      t.shootT = 3.6;
      const from = t.pos.clone();
      from.y = 1.9;
      const aim = focus.clone();
      aim.y += 0.5;
      aim.x += (Math.random() - 0.5) * 7;
      aim.z += (Math.random() - 0.5) * 7;
      addTracer(from, aim);
      addFlash(from, 0xffd080, 0.8);
      hooks.boom(aim);
    }

    if (t.health <= 0) killTank(world, t);
  }
}

export function killTank(world, t) {
  if (t.dead) return;
  t.dead = true;
  t.vel.set(0, 0, 0);
  addExplosion(t.pos);
  darkenCar(t);
  world.money += 500;
  showToast('TANK DESTROYED +$500');
}
