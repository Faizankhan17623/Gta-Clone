import * as THREE from 'three';
import { pointBlocked } from './city.js';
import { applySuit } from './characters.js';
import { showToast, showNews } from './hud.js';
import { sfxMissionPass } from './sound.js';

// BARBER SHOP: cosmetic hair-color changes near the wardrobe. Purely for
// looking the part — no stat behind it, just vanity.

const COST = 250;
const COLORS = [
  { key: 'black', name: 'JET BLACK', hex: '#0a0a0a' },
  { key: 'brown', name: 'CHESTNUT', hex: '#4a2f1a' },
  { key: 'blonde', name: 'PLATINUM', hex: '#e8d8a0' },
  { key: 'red', name: 'CRIMSON', hex: '#a02818' },
  { key: 'blue', name: 'ELECTRIC BLUE', hex: '#3a6adf' },
  { key: 'green', name: 'TOXIC GREEN', hex: '#4ad24a' },
];

export function initBarber(scene, world, save) {
  let pos = world.city.spawn.clone().add(new THREE.Vector3(22, 0, 2));
  const probe = new THREE.Vector3(pos.x, 1, pos.z);
  if (pointBlocked(probe, world.city.colliders, 1.4)) pos = world.city.spawn.clone().add(new THREE.Vector3(24, 0, -2));

  const chair = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.6, 1, 10),
    new THREE.MeshStandardMaterial({ color: 0xb02040, metalness: 0.3, roughness: 0.6 })
  );
  chair.position.copy(pos).setY(0.5);
  scene.add(chair);
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.15, 1.8, 10),
    new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.2 })
  );
  pole.position.copy(pos).add(new THREE.Vector3(1.4, 0.9, 0));
  scene.add(pole);

  world.barber = { pos, open: false, hair: save?.hair || null };
  if (world.barber.hair) applySuit(world.player.ch, { hair: world.barber.hair });
}

export function updateBarber(world, dt, pressed) {
  const b = world.barber;
  if (!b) return;
  const player = world.player;
  world.barberHint = null;
  const onFoot = !player.inCar && !player.inHeli && !player.inBoat;
  const d = Math.hypot(player.pos.x - b.pos.x, player.pos.z - b.pos.z);
  if (d > 3.4 || !onFoot) { b.open = false; return; }

  if (!b.open) {
    world.barberHint = 'Press <b>E</b> for a HAIRCUT — new color';
    if (pressed['KeyE']) b.open = true;
    return;
  }

  const lines = COLORS.map((c, i) => `${i + 1}) ${c.name}`).join(' · ');
  world.barberHint = `BARBER ($${COST}): ${lines} · <b>E</b> to close`;
  for (let i = 0; i < COLORS.length; i++) {
    if (!pressed['Digit' + (i + 1)]) continue;
    const c = COLORS[i];
    if (world.money < COST) { showToast('Not enough cash'); continue; }
    world.money -= COST;
    b.hair = c.hex;
    applySuit(player.ch, { hair: c.hex });
    sfxMissionPass();
    showToast(`NEW LOOK — ${c.name}`);
    showNews('a fresh haircut hits the streets, wanted posters unaffected');
    world.onSave?.();
  }
  if (pressed['KeyE']) b.open = false;
}
