import * as THREE from 'three';
import { blockStart, BLOCK, N, pointBlocked } from './city.js';
import { showToast, showNews, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxPickup } from './sound.js';
import { addRep } from './economy.js';

// STORM CHASER: a weather-service kiosk pays escalating money for a clean
// lightning-flash photo, but only while a storm is actually rolling. Frame
// the sky (not a subject — point roughly up/out) and press G the instant a
// flash lands. Miss the flash window and it's just rain on the lens.

const RANKS = [
  { name: 'RANK 1 — WET LENS', pay: 500, needFlash: false },
  { name: 'RANK 2 — CHASER', pay: 900, needFlash: true },
  { name: 'RANK 3 — INTO THE CELL', pay: 1500, needFlash: true },
  { name: 'RANK 4 — EYE CONTACT', pay: 2400, needFlash: true },
];

export function initStormChaser(scene, world, save) {
  let pos = world.city.spawn.clone().add(new THREE.Vector3(-22, 0, -30));
  const probe = new THREE.Vector3(pos.x, 1, pos.z);
  if (pointBlocked(probe, world.city.colliders, 1.4)) pos = world.city.spawn.clone().add(new THREE.Vector3(-26, 0, -24));

  const van = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 1.6, 3.6),
    new THREE.MeshStandardMaterial({ color: 0x2a3a3a, metalness: 0.4, roughness: 0.6 })
  );
  van.position.copy(pos).setY(0.8);
  scene.add(van);
  const dish = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.1, 0.7, 10, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xc9c9d2, metalness: 0.6, roughness: 0.3, side: THREE.DoubleSide })
  );
  dish.position.copy(pos).add(new THREE.Vector3(0, 2.4, 0));
  dish.rotation.x = Math.PI * 0.6;
  scene.add(dish);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6), new THREE.MeshStandardMaterial({ color: 0x1c2026 }));
  mast.position.copy(pos).add(new THREE.Vector3(0, 1.8, 0));
  scene.add(mast);

  world.storm = {
    pos, dish, rank: Math.min(RANKS.length, save?.stormRank | 0), cooldownT: 0, flashSeen: 0,
  };
}

export function updateStormChaser(world, dt, pressed, camera) {
  const st = world.storm;
  if (!st) return;
  const player = world.player;
  world.stormHint = null;
  st.dish.rotation.z += dt * 0.4;
  st.cooldownT = Math.max(0, st.cooldownT - dt);
  st.flashSeen = Math.max(0, st.flashSeen - dt);
  if (world.lightningFlash > 0.5) st.flashSeen = 0.35; // brief window after the strike lands

  const stormy = (world.rainI || 0) > 0.35;
  const focus = player.inCar ? player.inCar.pos : player.pos;
  const d = Math.hypot(focus.x - st.pos.x, focus.z - st.pos.z);

  if (st.rank >= RANKS.length) return; // every rank paid out

  if (d < 5 && !player.inHeli) {
    const rung = RANKS[st.rank];
    if (!stormy) {
      world.stormHint = `WEATHER VAN — ${rung.name}: come back when a storm rolls in`;
    } else if (st.cooldownT > 0) {
      world.stormHint = `WEATHER VAN — filing the last shot (${Math.ceil(st.cooldownT)}s)`;
    } else {
      world.stormHint = `WEATHER VAN — ${rung.name}: point up at the storm and press <b>G</b> on a flash (pays $${rung.pay})`;
    }
  }

  // the actual shot can be taken from anywhere in the storm, not just at the van —
  // that's the whole appeal of a storm chaser
  if (stormy && st.cooldownT <= 0 && pressed['KeyG']) {
    const rung = RANKS[st.rank];
    camera.getWorldDirection(_dir);
    const skyward = _dir.y > 0.15; // roughly pointed at the sky, not the pavement
    if (rung.needFlash && st.flashSeen <= 0) {
      sfxPickup();
      showToast('TOO LATE — wait for the next flash');
      return;
    }
    if (!skyward) {
      sfxPickup();
      showToast('POINT THE CAMERA AT THE SKY');
      return;
    }
    const pay = Math.round(rung.pay * (world.payMult || 1));
    world.money += pay;
    addRep(world, 100 + st.rank * 30);
    st.rank++;
    st.cooldownT = 8;
    if (world.stats) world.stats.stormShots = (world.stats.stormShots || 0) + 1;
    sfxMissionPass();
    showMissionMsg('STORM SHOT SOLD', `+$${pay} — ${rung.name} filed with the weather service`, '#8fd0ff');
    showNews('the evening broadcast runs a lightning photo nobody can quite explain how they got');
    world.onSave?.();
  }
}

const _dir = new THREE.Vector3();
