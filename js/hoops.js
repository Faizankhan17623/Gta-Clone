import * as THREE from 'three';
import { roadCenter } from './city.js';
import { showToast, showNews } from './hud.js';
import { sfxPickup, sfxMissionPass } from './sound.js';
import { addRep } from './economy.js';

// Sky hoops: ten golden rings floating above the streets. Swing, fly,
// jetpack or ramp through each once — $300 a hoop, $5000 for the set.
// Collected hoops are saved, like the hidden packages.

const SPOTS = [
  [1, 1], [3, 2], [5, 1], [7, 3], [9, 5],
  [2, 6], [4, 8], [6, 7], [8, 9], [0, 4],
];

export function initHoops(scene, world, save) {
  const got = new Set(save.hoops || []);
  const geo = new THREE.TorusGeometry(3.2, 0.3, 8, 22);
  const hoops = SPOTS.map(([i, j], idx) => {
    const m = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.9 })
    );
    m.position.set(roadCenter(i), 7 + (idx % 3) * 2.5, roadCenter(j));
    m.visible = !got.has(idx);
    scene.add(m);
    return { mesh: m, idx };
  });
  world.hoops = { list: hoops, got };
}

export function updateHoops(world, dt) {
  const h = world.hoops;
  const player = world.player;
  const focus = player.inHeli ? player.inHeli.pos : player.inCar ? player.inCar.pos : player.pos;
  const py = player.inHeli ? player.inHeli.pos.y : player.pos.y;

  for (const hp of h.list) {
    if (!hp.mesh.visible) continue;
    hp.mesh.rotation.y += dt * 1.2;
    if (Math.hypot(focus.x - hp.mesh.position.x, focus.z - hp.mesh.position.z) < 4 &&
        Math.abs(py - hp.mesh.position.y) < 3.5) {
      hp.mesh.visible = false;
      h.got.add(hp.idx);
      world.money += 300;
      sfxPickup();
      showToast(`SKY HOOP ${h.got.size}/10 +$300`);
      if (h.got.size === SPOTS.length) {
        world.money += 5000;
        addRep(world, 500);
        sfxMissionPass();
        showToast('ALL HOOPS! +$5000');
        showNews('every golden hoop over the city has been threaded');
      }
      world.onSave?.();
    }
  }
}
