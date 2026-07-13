import * as THREE from 'three';
import { pointBlocked } from './city.js';
import { showToast, showNews, showMissionMsg } from './hud.js';
import { sfxMissionPass } from './sound.js';
import { addFlash } from './effects.js';

// New Game+: the golden pedestal. A crowned King can lay the run down and
// start again — keeping the crown, the wardrobe, the garage and the trophies,
// but zeroing the money, the missions, the map. In exchange: a prestige star,
// a 25% payout bonus per star, and a city that fights back from minute one.
// Some kings retire. Yours re-enters the ring.

const HOLD_TIME = 3;

export function initPrestige(scene, world, save, opts) {
  world.prestige = save?.prestige | 0;
  world.payMult = 1 + world.prestige * 0.25;

  // golden pedestal beside the plaza
  let pos = world.city.spawn.clone().add(new THREE.Vector3(8, 0, 26));
  const probe = new THREE.Vector3(pos.x, 1, pos.z);
  if (pointBlocked(probe, world.city.colliders, 1.5)) pos = world.city.spawn.clone().add(new THREE.Vector3(-8, 0, 26));

  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.9, 1.6, 12),
    new THREE.MeshStandardMaterial({ color: 0xd0a020, metalness: 0.85, roughness: 0.3, emissive: 0x403000 })
  );
  column.position.copy(pos).setY(0.8);
  column.castShadow = true;
  scene.add(column);
  const star = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.45),
    new THREE.MeshStandardMaterial({ color: 0xffe27a, metalness: 0.9, roughness: 0.2, emissive: 0x806010 })
  );
  star.position.copy(pos).setY(2.1);
  scene.add(star);

  world.prestigeState = { pos, star, holdT: 0, armed: false, armT: 0, saveKey: opts?.saveKey };
}

function doPrestige(world) {
  const p = (world.prestige | 0) + 1;
  let old = {};
  try { old = JSON.parse(localStorage.getItem(world.prestigeState.saveKey) || '{}') || {}; } catch {}
  // what a king keeps: the crown, the closet, the garage, the trophy shelf
  const kept = {
    prestige: p,
    crowned: true,
    char: old.char,
    suit: old.suit,
    suits: old.suits,
    garage: old.garage,
    mods: old.mods,
    ach: old.ach,
    settings: old.settings,
  };
  try { localStorage.setItem(world.prestigeState.saveKey, JSON.stringify(kept)); } catch {}
  location.reload();
}

export function updatePrestige(world, dt, keys) {
  const ps = world.prestigeState;
  if (!ps) return;
  const player = world.player;
  world.prestigeHint = null;
  ps.star.rotation.y += dt * 1.4;
  ps.star.position.y = 2.1 + Math.sin(world.time * 1.8) * 0.08;

  const d = Math.hypot(player.pos.x - ps.pos.x, player.pos.z - ps.pos.z);
  if (d > 3.2 || player.inCar || player.inHeli) { ps.holdT = 0; return; }

  if (!world.crowned) {
    world.prestigeHint = 'THE GOLDEN PEDESTAL — it hums, but not for you. (Kings only.)';
    return;
  }

  if (ps.armed) {
    ps.armT -= dt;
    if (ps.armT <= 0) { ps.armed = false; ps.holdT = 0; }
    if (keys['KeyE']) {
      ps.holdT += dt;
      world.prestigeHint = `⚠ NEW GAME+ in ${Math.ceil((HOLD_TIME - ps.holdT) * 10) / 10}s — release to abort`;
      addFlash(ps.pos.clone().setY(2), 0xffe27a, 0.3);
      if (ps.holdT >= HOLD_TIME) {
        sfxMissionPass();
        showMissionMsg('PRESTIGE ★' + ((world.prestige | 0) + 1), 'The city resets. The King does not.', '#ffe27a');
        showNews('the King touches the pedestal — and the whole city starts over');
        setTimeout(() => doPrestige(world), 1200);
        ps.armed = false;
        ps.holdT = 99; // latch until reload
      }
    } else {
      ps.holdT = 0;
      world.prestigeHint = `⚠ ARMED — hold <b>E</b> ${HOLD_TIME}s to PRESTIGE (resets money/missions, keeps crown/suits/garage · +25% payouts, harder city)`;
    }
    return;
  }

  if (keys['KeyE']) {
    ps.holdT += dt;
    world.prestigeHint = `NEW GAME+ — keep holding to arm... ${Math.ceil((HOLD_TIME - ps.holdT) * 10) / 10}s`;
    if (ps.holdT >= HOLD_TIME) {
      ps.armed = true;
      ps.armT = 6;
      ps.holdT = 0;
      showToast('⚠ PEDESTAL ARMED — hold E again to burn it all down');
    }
  } else {
    ps.holdT = Math.max(0, ps.holdT - dt * 2);
    world.prestigeHint = world.prestige > 0
      ? `THE GOLDEN PEDESTAL ★${world.prestige} — hold <b>E</b> for NEW GAME+ (+25% payouts each star)`
      : 'THE GOLDEN PEDESTAL — hold <b>E</b> for NEW GAME+ (reset the run, keep the crown)';
  }
}
