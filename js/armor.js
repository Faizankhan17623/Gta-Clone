import * as THREE from 'three';
import { pointBlocked } from './city.js';
import { showToast } from './hud.js';
import { sfxPickup } from './sound.js';

// SURPLUS & SUNDRY: an army-surplus stall past the workbench. $1500
// straps on 50 points of plate that eats half of every hit — from any
// source in the game, because the vest watches your health bar, not the
// bullets. Refill anytime it's dented.

const COST = 1500;
const MAX = 50;

export function initArmor(scene, world, save) {
  let pos = world.city.spawn.clone().add(new THREE.Vector3(28, 0, 32));
  const probe = new THREE.Vector3(pos.x, 1, pos.z);
  if (pointBlocked(probe, world.city.colliders, 1.4)) pos = world.city.spawn.clone().add(new THREE.Vector3(32, 0, 36));

  const crate = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x4a5a3a, roughness: 0.8 })
  );
  crate.position.copy(pos).setY(0.5);
  scene.add(crate);
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), crate.material);
  helm.position.copy(pos).setY(1.15);
  scene.add(helm);

  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;right:18px;bottom:92px;font:700 15px/1 monospace;' +
    'color:#9fc87a;text-shadow:0 1px 4px #000;display:none;z-index:30;pointer-events:none';
  document.body.appendChild(el);

  world.armor = { pos, el, plate: save?.armor ?? 0, lastHp: null };
}

export function updateArmor(world, dt, pressed) {
  const ar = world.armor;
  if (!ar) return;
  const player = world.player;
  world.armorHint = null;

  // the vest watches the health bar: half of any loss is taken as plate
  if (ar.lastHp !== null && ar.plate > 0) {
    const loss = ar.lastHp - player.health;
    if (loss > 0.5) {
      const absorbed = Math.min(ar.plate, loss * 0.5);
      player.health += absorbed;
      ar.plate -= absorbed;
      if (ar.plate <= 0.5) { ar.plate = 0; showToast('ARMOR SHREDDED — the vest is done'); }
    }
  }
  ar.lastHp = player.health;

  // HUD chip
  if (ar.plate > 0) {
    ar.el.style.display = 'block';
    ar.el.textContent = `▣ ${Math.ceil(ar.plate)}`;
  } else if (ar.el.style.display !== 'none') {
    ar.el.style.display = 'none';
  }

  // the stall
  const onFoot = !player.inCar && !player.inHeli && !player.inBoat;
  const d = Math.hypot(player.pos.x - ar.pos.x, player.pos.z - ar.pos.z);
  if (d > 3 || !onFoot) return;
  const price = Math.round(COST * (world.discount || 1));
  if (ar.plate >= MAX) { world.armorHint = 'SURPLUS & SUNDRY — your plate is already full, soldier'; return; }
  world.armorHint = `Press <b>E</b> — BODY ARMOR, $${price} (${Math.ceil(ar.plate)}/${MAX} plate)`;
  if (!pressed['KeyE']) return;
  if (world.money < price) { showToast('Not enough cash — the vest stays on the rack'); return; }
  world.money -= price;
  ar.plate = MAX;
  sfxPickup();
  showToast('PLATE ON — half of everything that hits you hits this first');
  world.onSave?.();
}
