import * as THREE from 'three';
import { pointBlocked } from './city.js';
import { createCharacter } from './characters.js';
import { showToast } from './hud.js';
import { sfxMissionPass, sfxMissionFail, sfxPickup } from './sound.js';

// STREET DICE: two regulars crouched over a mat in an east-side alley.
// Highest pair of 2d6 wins, ties push, winners can let it ride for
// double-or-nothing. No cards, no ceiling, no receipts.

export function initDice(scene, world) {
  let pos = world.city.spawn.clone().add(new THREE.Vector3(36, 0, -14));
  const probe = new THREE.Vector3(pos.x, 1, pos.z);
  if (pointBlocked(probe, world.city.colliders, 1.8)) pos = world.city.spawn.clone().add(new THREE.Vector3(40, 0, -10));

  const mat = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 1.1),
    new THREE.MeshStandardMaterial({ color: 0x2a4a3a, roughness: 0.95 })
  );
  mat.rotation.x = -Math.PI / 2;
  mat.position.copy(pos).setY(0.02);
  scene.add(mat);
  for (let i = 0; i < 2; i++) {
    const ch = createCharacter({ shirt: i ? '#7a5a2a' : '#2a5a7a', pants: '#33352a' });
    ch.group.position.copy(pos).add(new THREE.Vector3(i ? 1.2 : -1.2, 0, -0.6));
    ch.group.rotation.y = i ? -1.2 : 1.2;
    // crouched over the mat
    ch.lLeg.rotation.x = 1.3;
    ch.rLeg.rotation.x = 1.3;
    ch.group.position.y = -0.5;
    ch.group.userData.baseY = -0.5;
    scene.add(ch.group);
  }

  world.dice = { pos, open: false, pot: 0 };
}

function roll2() {
  return [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
}

export function updateDice(world, dt, pressed) {
  const dc = world.dice;
  if (!dc) return;
  const player = world.player;
  world.diceHint = null;
  const onFoot = !player.inCar && !player.inHeli && !player.inBoat;
  const d = Math.hypot(player.pos.x - dc.pos.x, player.pos.z - dc.pos.z);
  if (d > 3.5 || !onFoot) { dc.open = false; dc.pot = 0; return; }

  if (!dc.open) {
    world.diceHint = 'Press <b>E</b> to crouch into the STREET DICE game';
    if (pressed['KeyE']) dc.open = true;
    return;
  }

  world.nearKiosk = true; // digits bet here, not switch weapons
  if (dc.pot > 0) {
    world.diceHint = `POT $${dc.pot} — 1) let it ride (double or nothing) · 2) take the money · <b>E</b> to stand up`;
    if (pressed['Digit2']) {
      world.money += dc.pot;
      sfxMissionPass();
      showToast(`You pocket $${dc.pot} and the alley pretends not to count it`);
      dc.pot = 0;
    } else if (pressed['Digit1']) {
      resolveRoll(world, dc, dc.pot, true);
    }
  } else {
    world.diceHint = 'STREET DICE: 1) bet $100 · 2) bet $500 · 3) bet $2000 · <b>E</b> to stand up';
    const bets = [100, 500, 2000];
    for (let i = 0; i < 3; i++) {
      if (!pressed['Digit' + (i + 1)]) continue;
      if (world.money < bets[i]) { showToast('Not enough cash'); continue; }
      world.money -= bets[i];
      resolveRoll(world, dc, bets[i], false);
    }
  }
  if (pressed['KeyE']) {
    if (dc.pot > 0) { world.money += dc.pot; showToast(`Cashing out $${dc.pot}`); dc.pot = 0; }
    dc.open = false;
  }
}

function resolveRoll(world, dc, stake, riding) {
  const you = roll2(), them = roll2();
  const ys = you[0] + you[1], ts = them[0] + them[1];
  const tag = `You ${you[0]}+${you[1]}=${ys} · Them ${them[0]}+${them[1]}=${ts}`;
  if (ys > ts) {
    dc.pot = stake * 2;
    sfxMissionPass();
    showToast(`${tag} — POT IS $${dc.pot}`);
  } else if (ys === ts) {
    dc.pot = stake;
    sfxPickup();
    showToast(`${tag} — push, pot stands at $${dc.pot}`);
  } else {
    dc.pot = 0;
    sfxMissionFail();
    showToast(`${tag} — the alley eats ${riding ? 'the whole pot' : `$${stake}`}`);
  }
}
