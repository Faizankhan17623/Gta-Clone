import * as THREE from 'three';
import { pointBlocked } from './city.js';
import { showToast, showNews } from './hud.js';
import { sfxMissionPass, sfxPickup } from './sound.js';

// CAR WASH: a drive-through arch near the garage. Roll in slow, it scrubs
// dents and grime off the ride — the only way to repair a car's health
// short of buying a whole new one.

const COST_PER_HP = 4;

export function initCarwash(scene, world) {
  let pos = world.city.spawn.clone().add(new THREE.Vector3(30, 0, -6));
  const probe = new THREE.Vector3(pos.x, 1, pos.z);
  if (pointBlocked(probe, world.city.colliders, 2)) pos = world.city.spawn.clone().add(new THREE.Vector3(26, 0, -2));

  const arch = new THREE.Group();
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.4, 0.4), new THREE.MeshStandardMaterial({ color: 0x2a5a8a, metalness: 0.4 }));
    post.position.set(s * 2.4, 1.7, 0);
    arch.add(post);
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.4, 0.4), new THREE.MeshStandardMaterial({ color: 0x2a5a8a, metalness: 0.4 }));
  top.position.set(0, 3.4, 0);
  arch.add(top);
  const brush = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 3, 8), new THREE.MeshStandardMaterial({ color: 0x4ad2ff }));
  brush.rotation.z = Math.PI / 2;
  brush.position.set(0, 1.8, 0);
  arch.add(brush);
  arch.position.copy(pos);
  scene.add(arch);

  world.carwash = { pos, arch, brush, washing: 0 };
}

export function updateCarwash(world, dt, keys) {
  const cw = world.carwash;
  if (!cw) return;
  const player = world.player;
  world.carwashHint = null;
  if (cw.washing > 0) cw.brush.rotation.x += dt * 20;

  if (!player.inCar) { cw.washing = 0; return; }
  const car = player.inCar;
  const d = Math.hypot(car.pos.x - cw.pos.x, car.pos.z - cw.pos.z);
  if (d > 4.5) { cw.washing = 0; return; }

  const dmg = 100 - Math.min(100, car.health);
  if (dmg <= 0) { world.carwashHint = 'CAR WASH — this ride is already spotless'; cw.washing = 0; return; }

  const cost = Math.ceil(dmg * COST_PER_HP);
  const slow = car.vel.length() < 3;
  if (!slow) { world.carwashHint = `CAR WASH — slow down to roll through ($${cost} to fully repair)`; cw.washing = 0; return; }

  world.carwashHint = `CAR WASH — repairing... ($${cost} total)`;
  cw.washing += dt;
  if (world.money >= 1 && cw.washing > 0.3) {
    cw.washing = 0;
    const step = Math.min(dmg, 20);
    const stepCost = Math.ceil(step * COST_PER_HP);
    if (world.money < stepCost) { showToast('Not enough cash to keep washing'); return; }
    world.money -= stepCost;
    car.health = Math.min(100, car.health + step);
    sfxPickup();
    if (car.health >= 100) {
      sfxMissionPass();
      showToast('SPOTLESS — full repair complete');
      showNews('a very dented car rolls out the other side looking suspiciously new');
    }
  }
}
