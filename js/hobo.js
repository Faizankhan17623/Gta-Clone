import * as THREE from 'three';
import { pointBlocked } from './city.js';
import { createCharacter } from './characters.js';
import { showToast, showMissionMsg } from './hud.js';
import { sfxPickup, sfxMissionPass } from './sound.js';
import { addRep } from './economy.js';

// OLD MOSES: sits against a wall west of spawn with a cardboard sign.
// Ten bucks buys him a meal and you five rep. Every fifth ten he pays
// back in secrets, and at karma 25 he settles all his debts at once.

const TIPS = [
  'Four graffiti marks and a bunker under the city. Kids talk. Walls listen.',
  'A ghost drives the rain at three in the morning. Don\'t flag it down.',
  'The numbers on the harbor mast? Somebody\'s counting down, friend.',
  'Cops can\'t chase what a suppressor never announces. Gunsmith\'s by the garage.',
  'That casino back alley hatch ain\'t for deliveries, if you follow me.',
];

export function initHobo(scene, world, save) {
  let pos = world.city.spawn.clone().add(new THREE.Vector3(-36, 0, 10));
  const probe = new THREE.Vector3(pos.x, 1, pos.z);
  if (pointBlocked(probe, world.city.colliders, 1.4)) pos = world.city.spawn.clone().add(new THREE.Vector3(-38, 0, 4));

  const ch = createCharacter({ shirt: '#5a4a3a', pants: '#3a3226', skin: '#b9855c', hair: '#777' });
  ch.group.position.copy(pos);
  ch.group.position.y = -0.5;
  ch.group.userData.baseY = -0.5;
  ch.lLeg.rotation.x = 1.4;
  ch.rLeg.rotation.x = 1.4;
  scene.add(ch.group);
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.5, 0.04),
    new THREE.MeshStandardMaterial({ color: 0xa8905e, roughness: 0.95 })
  );
  sign.position.copy(pos).add(new THREE.Vector3(0.7, 0.35, 0.2));
  sign.rotation.y = -0.4;
  scene.add(sign);

  world.hobo = { pos, karma: save?.karma ?? 0, paid: false, cd: 0 };
}

export function updateHobo(world, dt, pressed) {
  const ho = world.hobo;
  if (!ho) return;
  const player = world.player;
  world.hoboHint = null;
  ho.cd = Math.max(0, ho.cd - dt);

  const onFoot = !player.inCar && !player.inHeli && !player.inBoat;
  const d = Math.hypot(player.pos.x - ho.pos.x, player.pos.z - ho.pos.z);
  if (d > 3 || !onFoot || ho.cd > 0) return;

  world.hoboHint = `Press <b>E</b> to give OLD MOSES $10 · karma <b>${ho.karma}</b>`;
  if (!pressed['KeyE']) return;
  if (world.money < 10) { showToast('You\'re broker than he is'); return; }
  world.money -= 10;
  ho.karma++;
  ho.cd = 2;
  addRep(world, 5);
  sfxPickup();

  if (ho.karma === 25 && !ho.paid) {
    ho.paid = true;
    world.money += 250 * 25 / 2.5; // $2500 — Moses remembers every dollar
    sfxMissionPass();
    showMissionMsg('OLD MOSES', 'Turns out he owned the block all along. He settles up: $2500.', '#c9b458');
  } else if (ho.karma % 5 === 0) {
    showMissionMsg('OLD MOSES', TIPS[(ho.karma / 5 - 1) % TIPS.length], '#c9b458');
  } else {
    showToast(`Moses nods — karma ${ho.karma} (+5 rep)`);
  }
  world.onSave?.();
}
