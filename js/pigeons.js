import * as THREE from 'three';
import { blockStart, N, pointBlocked } from './city.js';
import { showToast, showNews } from './hud.js';
import { sfxPickup, sfxMissionPass } from './sound.js';
import { addSparks } from './effects.js';

// PIGEONS: 25 of the city's proudest vermin, perched on sidewalks all
// over the grid. Classic open-world housekeeping — shoot them all.
// Bounties at 10 and at the full flock.

const COUNT = 25;

export function initPigeons(scene, world, save) {
  const got = new Set(save?.pigeons || []);
  const birds = [];
  // deterministic scatter: one bird near every fourth block edge
  let id = 0;
  for (let bi = 0; bi < N && id < COUNT; bi++) {
    for (let bj = 0; bj < N && id < COUNT; bj++) {
      if ((bi * 3 + bj * 7) % 4 !== 0) continue;
      const ox = 4 + ((bi * 13 + bj * 5) % 44);
      let pos = new THREE.Vector3(blockStart(bi) + ox, 0, blockStart(bj) - 3.2);
      const probe = new THREE.Vector3(pos.x, 0.5, pos.z);
      if (pointBlocked(probe, world.city.colliders, 0.6)) pos = new THREE.Vector3(blockStart(bi) + ox, 0, blockStart(bj) - 6);

      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.18, 0.3),
        new THREE.MeshLambertMaterial({ color: 0x8a8f9a })
      );
      body.position.copy(pos).setY(0.12);
      body.rotation.y = (bi + bj) * 1.3;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshLambertMaterial({ color: 0x5a6a4a }));
      head.position.set(0, 0.12, 0.16);
      body.add(head);
      scene.add(body);

      const b = { id, mesh: body, pos: body.position, dead: got.has(id) };
      if (b.dead) body.visible = false;
      b.target = {
        pos: b.pos, aimY: 0.15, r: 0.5, passive: true,
        get dead() { return b.dead; },
        hit() {
          if (b.dead) return;
          b.dead = true;
          b.mesh.visible = false;
          addSparks(b.pos.clone().setY(0.3), 6);
          onPigeon(b.parentWorld);
        },
      };
      b.parentWorld = world;
      world.targets.push(b.target);
      birds.push(b);
      id++;
    }
  }
  world.pigeonNet = { birds };
}

function onPigeon(world) {
  const done = world.pigeonNet.birds.filter((b) => b.dead).length;
  if (world.stats) world.stats.pigeons = done;
  sfxPickup();
  showToast(`PIGEON ${done}/${COUNT}`);
  if (done === 10) {
    world.money += 2500;
    sfxMissionPass();
    showToast('10 PIGEONS — the city sanitation fund pays $2500');
  } else if (done === COUNT) {
    world.money += 10000;
    sfxMissionPass();
    showToast('THE FLOCK IS DOWN — $10000. The statues thank you.');
    showNews('pigeon population mysteriously collapses; pest control claims credit');
  }
  world.onSave?.();
}

export function updatePigeons(world, dt) {
  const pn = world.pigeonNet;
  if (!pn) return;
  // idle peck: cheap sine bob, staggered per bird
  const t = performance.now() * 0.003;
  for (let i = 0; i < pn.birds.length; i++) {
    const b = pn.birds[i];
    if (b.dead) continue;
    b.mesh.rotation.z = Math.max(0, Math.sin(t + i * 1.7)) * 0.35;
  }
}
