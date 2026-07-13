import * as THREE from 'three';
import { WATER_X0 } from './water.js';
import { showToast, showNews, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxMissionFail, sfxPickup } from './sound.js';
import { addRep } from './economy.js';
import { addSmoke } from './effects.js';

// Fishing off the north pier: cast, wait, and when the water says NOW you
// say E. Most of what bites is dinner. Some of it pays rent. One thing down
// there glows, and the fishmonger pays a suspicious amount not to see it.

const CATCHES = [
  { name: 'HARBOR PERCH', pay: 80, w: 0.55 },
  { name: 'STRIPED BASS', pay: 250, w: 0.27 },
  { name: 'KING MACKEREL', pay: 700, w: 0.12 },
  { name: 'GOLDEN SNAPPER', pay: 1500, w: 0.055 },
  { name: 'THE GLOWING EEL', pay: 4000, w: 0.005 },
];

export function initFishing(scene, world) {
  // rod stand at the end of the south pier (the north end belongs to GULL
  // AIR — press E there and you leave in a seaplane, not with a perch)
  const spot = new THREE.Vector3(WATER_X0 + 23, 1.35, -25);
  const stand = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 1, 0.5),
    new THREE.MeshLambertMaterial({ color: 0x6b4d2e })
  );
  stand.position.copy(spot).setY(1.85);
  scene.add(stand);
  const rod = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.05, 3, 6),
    new THREE.MeshLambertMaterial({ color: 0x2a2018 })
  );
  rod.position.copy(spot).add(new THREE.Vector3(0.3, 1.6, 0.3));
  rod.rotation.z = -0.7;
  scene.add(rod);

  world.fishing = {
    spot,
    state: 'idle', // idle | waiting | bite
    t: 0,
    caught: 0,
  };
}

function rollCatch() {
  let r = Math.random();
  for (const c of CATCHES) {
    if (r < c.w) return c;
    r -= c.w;
  }
  return CATCHES[0];
}

export function updateFishing(world, dt, pressed) {
  const f = world.fishing;
  if (!f) return;
  const player = world.player;
  world.fishHint = null;

  const d = Math.hypot(player.pos.x - f.spot.x, player.pos.z - f.spot.z);
  const here = d < 3 && !player.inCar && !player.inHeli && !player.inBoat && !player.swim;

  if (!here) {
    if (f.state !== 'idle') { f.state = 'idle'; showToast('LINE ABANDONED'); }
    return;
  }

  if (f.state === 'idle') {
    world.fishHint = 'Press <b>E</b> to CAST a line — the harbor bites at anything';
    if (pressed['KeyE']) {
      f.state = 'waiting';
      f.t = 2 + Math.random() * 4.5;
      showToast('🎣 LINE OUT... watch the water');
    }
    return;
  }

  if (f.state === 'waiting') {
    f.t -= dt;
    world.fishHint = '🎣 waiting on the water...';
    if (Math.random() < dt * 0.6) addSmoke(f.spot.clone().add(new THREE.Vector3(3, -0.6, 2)), 0.2);
    if (f.t <= 0) {
      f.state = 'bite';
      f.t = 0.9;
      sfxMissionFail(); // the jolt
      showToast('❗❗ BITE — press E NOW');
    }
    return;
  }

  // bite window
  f.t -= dt;
  world.fishHint = '❗❗ <b>E</b> — SET THE HOOK';
  if (pressed['KeyE']) {
    f.state = 'idle';
    const c = rollCatch();
    const pay = Math.round(c.pay * (world.payMult || 1));
    world.money += pay;
    f.caught++;
    if (world.stats) world.stats.fish = (world.stats.fish || 0) + 1;
    sfxPickup();
    if (c.name === 'THE GLOWING EEL') {
      addRep(world, 500);
      sfxMissionPass();
      showMissionMsg('THE GLOWING EEL', `+$${pay} — the fishmonger pays extra and burns his gloves`, '#5ef2a0');
      showNews('a dockside cooler glows faintly green; nobody opens it twice');
    } else {
      showToast(`🐟 ${c.name} +$${pay}`);
      if (c.pay >= 1500) showNews('a record snapper comes off the north pier — photos or it didn\'t happen');
    }
    world.onSave?.();
  } else if (f.t <= 0) {
    f.state = 'idle';
    showToast('...got away. The big ones always know.');
  }
}
