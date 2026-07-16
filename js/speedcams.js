import * as THREE from 'three';
import { blockStart, pointBlocked } from './city.js';
import { showToast } from './hud.js';
import { addCrime } from './police.js';
import { addFlash, addSparks } from './effects.js';
import { sfxCrash } from './sound.js';

// SPEED CAMERAS: eight gray boxes on poles along the grid. Blow past one
// over the limit and it flashes you a $120 fine straight out of pocket.
// They are, of course, shootable — but the city notices.

const SPOTS = [[1, 2], [3, 5], [5, 1], [2, 8], [8, 3], [6, 4], [4, 7], [8, 8]];
const LIMIT = 26; // m/s, ~94 km/h

export function initSpeedcams(scene, world) {
  const cams = [];
  for (const [bi, bj] of SPOTS) {
    let pos = new THREE.Vector3(blockStart(bi) + 30, 0, blockStart(bj) - 2);
    const probe = new THREE.Vector3(pos.x, 1, pos.z);
    if (pointBlocked(probe, world.city.colliders, 0.8)) pos = new THREE.Vector3(blockStart(bi) + 44, 0, blockStart(bj) - 2);

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 3.4, 6),
      new THREE.MeshStandardMaterial({ color: 0x777d84, metalness: 0.6, roughness: 0.4 })
    );
    pole.position.copy(pos).setY(1.7);
    scene.add(pole);
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.4, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x3a4048, metalness: 0.4, roughness: 0.5 })
    );
    box.position.copy(pos).setY(3.4);
    scene.add(box);

    const c = { pos, box, pole, cd: 0, dead: false, hp: 30 };
    c.target = {
      pos: c.pos, aimY: 3.4, r: 0.7, passive: true,
      get dead() { return c.dead; },
      hit() {
        c.hp -= 30;
        if (c.hp <= 0 && !c.dead) {
          c.dead = true;
          c.box.rotation.z = 0.7;
          c.box.position.y = 3.1;
          addSparks(c.pos.clone().setY(3.3), 10);
          sfxCrash(6);
          addCrime(c.parentWorld, 1);
          showToast('SPEED CAMERA DESTROYED — the city noticed');
        }
      },
    };
    c.parentWorld = world;
    world.targets.push(c.target);
    cams.push(c);
  }
  world.speedcams = { cams };
}

export function updateSpeedcams(world, dt) {
  const sc = world.speedcams;
  if (!sc) return;
  const player = world.player;
  const car = player.inCar;
  for (const c of sc.cams) {
    c.cd = Math.max(0, c.cd - dt);
    if (c.dead || !car || c.cd > 0) continue;
    const d = Math.hypot(car.pos.x - c.pos.x, car.pos.z - c.pos.z);
    if (d < 13 && car.vel.length() > LIMIT) {
      c.cd = 15;
      const fine = Math.min(world.money, 120);
      world.money -= fine;
      addFlash(c.pos.clone().setY(3.4), 0xffffff, 2.2);
      world.shake = Math.max(world.shake || 0, 0.12);
      showToast(fine > 0 ? `SPEED CAMERA — fined $${fine}` : 'SPEED CAMERA — flash, but your pockets are empty');
    }
  }
}
