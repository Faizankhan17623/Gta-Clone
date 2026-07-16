import * as THREE from 'three';
import { blockStart, N, pointBlocked } from './city.js';
import { addChaos } from './economy.js';
import { addSparks } from './effects.js';
import { sfxCrash } from './sound.js';

// FIRE HYDRANTS: squat red plugs on street corners. Shoot one and it
// blows a geyser for a minute — stand on the spout and it launches you
// a rooftop's worth of air. The water department fixes them eventually.

export function initHydrants(scene, world) {
  const plugs = [];
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x9fd8f7, transparent: true, opacity: 0.55, roughness: 0.2 });
  for (let bi = 1; bi < N; bi += 2) {
    for (let bj = 1; bj < N; bj += 3) {
      const pos = new THREE.Vector3(blockStart(bi) - 2, 0, blockStart(bj) - 2);
      const probe = new THREE.Vector3(pos.x, 0.5, pos.z);
      if (pointBlocked(probe, world.city.colliders, 0.8)) continue;

      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.26, 0.7, 8),
        new THREE.MeshStandardMaterial({ color: 0xc93a2a, roughness: 0.5, metalness: 0.3 })
      );
      body.position.copy(pos).setY(0.35);
      scene.add(body);
      const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.16, 1, 8), waterMat);
      jet.visible = false;
      scene.add(jet);

      const h = { pos, body, jet, burstT: 0, dead: false, hp: 20 };
      h.target = {
        pos: h.pos, aimY: 0.4, r: 0.6, passive: true,
        get dead() { return h.dead; },
        hit() {
          h.hp -= 30;
          if (h.hp <= 0 && !h.dead) {
            h.dead = true;
            h.burstT = 60;
            h.jet.visible = true;
            addSparks(h.pos.clone().setY(0.6), 10);
            sfxCrash(8);
            addChaos(h.parentWorld, 3);
          }
        },
      };
      h.parentWorld = world;
      world.targets.push(h.target);
      plugs.push(h);
    }
  }
  world.hydrants = { plugs };
}

export function updateHydrants(world, dt) {
  const hy = world.hydrants;
  if (!hy) return;
  const player = world.player;
  const t = performance.now() * 0.02;
  for (const h of hy.plugs) {
    if (!h.dead) continue;
    h.burstT -= dt;
    if (h.burstT <= 0) { // the water department wins in the end
      h.dead = false;
      h.hp = 20;
      h.jet.visible = false;
      continue;
    }
    const height = 5 + Math.sin(t + h.pos.x) * 0.8;
    h.jet.scale.set(1, height, 1);
    h.jet.position.set(h.pos.x, height * 0.5, h.pos.z);
    // ride the spout
    if (!player.inCar && !player.inHeli && !player.inBoat) {
      const d = Math.hypot(player.pos.x - h.pos.x, player.pos.z - h.pos.z);
      if (d < 1.2 && player.pos.y < height + 1 && player.vy < 9) {
        player.vy = 13;
        player.onGround = false;
        player.glide = true;
      }
    }
  }
}
