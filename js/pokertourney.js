import * as THREE from 'three';
import { pointBlocked } from './city.js';
import { showToast, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxMissionFail, sfxPickup } from './sound.js';

// THE BACKROOM CLASSIC: a poker tournament behind the Lucky 7. $2000
// buys a seat against four regulars. Three fast-fold showdowns — pick
// your pressure each hand (1 safe / 2 push / 3 shove) and survive the
// table shrinking around you. Last stack standing takes $10,000.

const HANDS = ['a pair of nines', 'two pair', 'trip sevens', 'a straight', 'a flush', 'a full house', 'quads'];
const BUYIN = 2000;
const PRIZE = 10000;

export function initPokertourney(scene, world) {
  let pos = world.city.spawn.clone().add(new THREE.Vector3(-22, 0, 8));
  const probe = new THREE.Vector3(pos.x, 1, pos.z);
  if (pointBlocked(probe, world.city.colliders, 1.4)) pos = world.city.spawn.clone().add(new THREE.Vector3(-26, 0, 4));

  const table = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.2, 0.75, 10),
    new THREE.MeshStandardMaterial({ color: 0x2a5a3a, roughness: 0.8 })
  );
  table.position.copy(pos).setY(0.38);
  scene.add(table);

  world.pokerT = { pos, on: false, round: 0, left: 5 };
}

export function updatePokertourney(world, dt, pressed) {
  const pt = world.pokerT;
  if (!pt) return;
  const player = world.player;
  world.pokerTHint = null;
  const onFoot = !player.inCar && !player.inHeli && !player.inBoat;
  const d = Math.hypot(player.pos.x - pt.pos.x, player.pos.z - pt.pos.z);
  if (d > 3.2 || !onFoot) { if (pt.on) { pt.on = false; showToast('You walk from the table — the buy-in stays'); } return; }

  if (!pt.on) {
    world.pokerTHint = `Press <b>E</b> — THE BACKROOM CLASSIC: $${BUYIN} seat, $${PRIZE} to the last stack`;
    if (pressed['KeyE']) {
      if (world.money < BUYIN) { showToast('The floor man looks through you. Come back funded.'); return; }
      world.money -= BUYIN;
      pt.on = true;
      pt.round = 1;
      pt.left = 5;
      sfxPickup();
      showMissionMsg('SHUFFLE UP', 'Five stacks. Three showdowns. Pick your pressure.', '#c9b458');
    }
    return;
  }

  world.nearKiosk = true;
  world.pokerTHint = `ROUND ${pt.round}/3 — ${pt.left} left · 1) play it SAFE · 2) PUSH · 3) SHOVE`;
  let odds = 0;
  if (pressed['Digit1']) odds = 0.8;
  else if (pressed['Digit2']) odds = 0.62;
  else if (pressed['Digit3']) odds = 0.45;
  if (!odds) return;

  const yours = HANDS[Math.min(HANDS.length - 1, Math.floor(Math.random() * 4) + (odds < 0.5 ? 2 : 0))];
  if (Math.random() < odds) {
    pt.left = Math.max(2, pt.left - (odds < 0.5 ? 2 : 1));
    sfxPickup();
    if (pt.round >= 3) {
      pt.on = false;
      world.money += PRIZE;
      sfxMissionPass();
      showMissionMsg('LAST STACK STANDING', `${yours} holds up — the Classic pays $${PRIZE}`, '#c9b458');
      if (world.stats) world.stats.pokerT = (world.stats.pokerT || 0) + 1;
      world.onSave?.();
    } else {
      pt.round++;
      showToast(`${yours} holds — ${pt.left} stacks left, blinds up`);
    }
  } else {
    pt.on = false;
    sfxMissionFail();
    showMissionMsg('FELTED', `${yours} runs into a cooler. The rail nods knowingly.`, '#c9b458');
  }
}
