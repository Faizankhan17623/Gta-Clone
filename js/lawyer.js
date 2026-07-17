import * as THREE from 'three';
import { pointBlocked } from './city.js';
import { showToast, showMissionMsg } from './hud.js';
import { sfxMissionPass } from './sound.js';

// SAUL BETTERCALL, ATTORNEY: a storefront west of spawn. $1000 puts him
// on retainer — the next time the cuffs close at three-plus stars, he
// meets you at the precinct door and Harbor Island never happens
// (prison.js checks world.lawyerRetained). One bust per retainer.

const RETAINER = 1000;

export function initLawyer(scene, world, save) {
  let pos = world.city.spawn.clone().add(new THREE.Vector3(-40, 0, -4));
  const probe = new THREE.Vector3(pos.x, 1, pos.z);
  if (pointBlocked(probe, world.city.colliders, 1.6)) pos = world.city.spawn.clone().add(new THREE.Vector3(-44, 0, 2));

  const office = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 2.6, 2),
    new THREE.MeshStandardMaterial({ color: 0x6a5a8a, roughness: 0.6 })
  );
  office.position.copy(pos).setY(1.3);
  scene.add(office);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 0.1), new THREE.MeshBasicMaterial({ color: 0xf0d24a }));
  sign.position.copy(pos).add(new THREE.Vector3(0, 2.9, 1));
  scene.add(sign);

  world.lawyer = { pos };
  world.lawyerRetained = !!save?.lawyer;
}

export function updateLawyer(world, dt, pressed) {
  const lw = world.lawyer;
  if (!lw) return;
  const player = world.player;
  world.lawyerHint = null;

  const onFoot = !player.inCar && !player.inHeli && !player.inBoat;
  const d = Math.hypot(player.pos.x - lw.pos.x, player.pos.z - lw.pos.z);
  if (d > 3.5 || !onFoot) return;

  if (world.lawyerRetained) {
    world.lawyerHint = 'SAUL BETTERCALL — already on retainer. "Relax. Go commit commerce."';
    return;
  }
  world.lawyerHint = `Press <b>E</b> — put SAUL BETTERCALL on retainer, $${RETAINER} (skips your next prison intake)`;
  if (!pressed['KeyE']) return;
  if (world.money < RETAINER) { showToast('"I like you. Not pro bono like you."'); return; }
  world.money -= RETAINER;
  world.lawyerRetained = true;
  sfxMissionPass();
  showMissionMsg('ON RETAINER', '"If they book you, say nothing. I\'ll hear about it before you do."', '#b08af0');
  world.onSave?.();
}
