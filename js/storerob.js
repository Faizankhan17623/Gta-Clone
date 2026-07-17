import * as THREE from 'three';
import { blockStart, pointBlocked } from './city.js';
import { showToast, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxMissionFail } from './sound.js';
import { addCrime } from './police.js';

// CORNER STORES: four 24-hour marts across the grid. Hold the register
// (E starts it, stand your ground 8 seconds) and walk out with the till
// — but each store you hit today has better cameras than the last: the
// heat climbs +2, +3, +4, +5. Registers refill overnight.

const SPOTS = [[1, 4], [4, 2], [6, 8], [3, 6]];

export function initStorerob(scene, world) {
  const stores = [];
  for (let i = 0; i < SPOTS.length; i++) {
    const [bi, bj] = SPOTS[i];
    let pos = new THREE.Vector3(blockStart(bi) + 20, 0, blockStart(bj) - 2.5);
    const probe = new THREE.Vector3(pos.x, 1, pos.z);
    if (pointBlocked(probe, world.city.colliders, 1.6)) pos = new THREE.Vector3(blockStart(bi) + 36, 0, blockStart(bj) - 2.5);

    const shop = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 2.4, 2),
      new THREE.MeshStandardMaterial({ color: 0x2a6a4a, roughness: 0.7 })
    );
    shop.position.copy(pos).setY(1.2);
    scene.add(shop);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.3, 2.1), new THREE.MeshBasicMaterial({ color: 0x7cf78c }));
    strip.position.copy(pos).setY(2.6);
    scene.add(strip);

    stores.push({ pos, doneDay: -99, progress: 0 });
  }
  world.storerob = { stores, hitsToday: 0, day: -1 };
}

export function updateStorerob(world, dt, keys) {
  const sr = world.storerob;
  if (!sr) return;
  const player = world.player;
  world.storeHint = null;
  if (sr.day !== world.dailyDay) { sr.day = world.dailyDay; sr.hitsToday = 0; }

  const onFoot = !player.inCar && !player.inHeli && !player.inBoat;
  if (!onFoot) return;

  for (const st of sr.stores) {
    const d = Math.hypot(player.pos.x - st.pos.x, player.pos.z - st.pos.z);
    if (d > 3) { st.progress = 0; continue; }

    if (st.doneDay === world.dailyDay) { world.storeHint = 'CORNER STORE — the till is already empty and the clerk is done with today'; break; }

    if (keys['KeyE']) {
      st.progress += dt / 8;
      world.storeHint = `HOLDING THE REGISTER… <b>${Math.min(99, Math.round(st.progress * 100))}%</b> — don't move`;
      if (st.progress >= 1) {
        st.doneDay = world.dailyDay;
        sr.hitsToday++;
        const heat = 1 + sr.hitsToday; // 2, 3, 4, 5
        const take = 300 + Math.floor(Math.random() * 200) + sr.hitsToday * 100;
        world.money += take;
        addCrime(world, heat);
        sfxMissionPass();
        sfxMissionFail(); // alarm
        showMissionMsg('REGISTER CLEANED', `+$${take} — cameras got everything (+${heat} heat)`, '#7cf78c');
        world.onSave?.();
      }
    } else {
      world.storeHint = `Hold <b>E</b> to ROB the corner store — hit #${sr.hitsToday + 1} today means +${2 + sr.hitsToday} heat`;
    }
    break;
  }
}
