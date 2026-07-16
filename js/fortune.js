import * as THREE from 'three';
import { pointBlocked } from './city.js';
import { showToast, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxPickup } from './sound.js';

// MADAME ZAZA: a purple tent by the park lawn. $50 buys a fortune — most
// of them are the city gossiping about itself, but roughly one palm in
// seven carries an actual $500 blessing.

const FORTUNES = [
  'A red van west of here sells loud answers to quiet questions.',
  'The bay remembers everyone who swims too long. Something down there keeps count.',
  'Ten blank walls itch for a name. Yours would do.',
  'When a payphone rings in this city, it is never a wrong number.',
  'The pigeons are not organized. Yet. Thin their ranks while you can.',
  'A man with an iron bag north of here sells mornings that last all day.',
  'Money sleeps safer behind glass than in a running man\'s pocket.',
  'Three cookers stir a pot in an industrial block. The smoke will call you.',
  'The cameras on the poles blink slower than you drive. Usually.',
  'A stray dollar given freely comes back with twenty-four friends.',
  'Storms pay photographers. Lightning keeps its own schedule.',
  'I see a crown. I see fireworks. I see you not paying for the second reading.',
];

export function initFortune(scene, world) {
  let pos = world.city.spawn.clone().add(new THREE.Vector3(-12, 0, 34));
  const probe = new THREE.Vector3(pos.x, 1, pos.z);
  if (pointBlocked(probe, world.city.colliders, 1.8)) pos = world.city.spawn.clone().add(new THREE.Vector3(-16, 0, 38));

  const tent = new THREE.Mesh(
    new THREE.ConeGeometry(1.6, 2.2, 6),
    new THREE.MeshStandardMaterial({ color: 0x5a2a7a, roughness: 0.7 })
  );
  tent.position.copy(pos).setY(1.1);
  scene.add(tent);
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xc99af7 })
  );
  orb.position.copy(pos).add(new THREE.Vector3(0, 0.9, 1.2));
  scene.add(orb);

  world.fortune = { pos, orb, idx: Math.floor(Math.random() * FORTUNES.length), cd: 0 };
}

export function updateFortune(world, dt, pressed) {
  const ft = world.fortune;
  if (!ft) return;
  const player = world.player;
  world.fortuneHint = null;
  ft.cd = Math.max(0, ft.cd - dt);
  ft.orb.position.y = 0.9 + Math.sin(performance.now() * 0.002) * 0.08;

  const onFoot = !player.inCar && !player.inHeli && !player.inBoat;
  const d = Math.hypot(player.pos.x - ft.pos.x, player.pos.z - ft.pos.z);
  if (d > 3.5 || !onFoot) return;

  if (ft.cd > 0) { world.fortuneHint = 'MADAME ZAZA — the spirits are catching their breath…'; return; }
  world.fortuneHint = 'Press <b>E</b> — MADAME ZAZA reads your palm, $50';
  if (!pressed['KeyE']) return;
  if (world.money < 50) { showToast('The spirits do not extend credit'); return; }
  world.money -= 50;
  ft.cd = 6;

  if (Math.random() < 0.15) {
    world.money += 500;
    sfxMissionPass();
    showMissionMsg('LUCKY PALM', 'Madame Zaza presses $500 back into your hand', '#c99af7');
    return;
  }
  ft.idx = (ft.idx + 1) % FORTUNES.length;
  sfxPickup();
  showMissionMsg('MADAME ZAZA', FORTUNES[ft.idx], '#c99af7');
}
