import * as THREE from 'three';
import { pointBlocked } from './city.js';
import { showToast } from './hud.js';
import { sfxPickup } from './sound.js';

// STREET FOOD: three vendor carts near spawn. A hot dog patches you up,
// coffee makes you run like you mean it, and the ice-cream guy knows a
// trick about cooling police heat that nobody asks too much about.

const CARTS = [
  {
    key: 'hotdog', name: 'HOT DOG', color: 0xc94a3a, at: [6, -24], alt: [10, -20], cost: 25,
    hint: 'HOT DOG $25 — hearty, heals <b>+40</b>',
  },
  {
    key: 'coffee', name: 'COFFEE', color: 0x6a4a2a, at: [-6, -22], alt: [-10, -18], cost: 15,
    hint: 'COFFEE $15 — <b>+35% run speed</b> for a minute',
  },
  {
    key: 'icecream', name: 'ICE CREAM', color: 0xe8dff0, at: [34, 4], alt: [38, 8], cost: 10,
    hint: 'ICE CREAM $10 — cools one <b>wanted star</b>, cops love a cone too',
  },
];

export function initVendors(scene, world) {
  world.buffs = { speedT: 0, jumpT: 0 }; // season-9 buff clock, cheats use it too
  const carts = [];
  for (const def of CARTS) {
    let pos = world.city.spawn.clone().add(new THREE.Vector3(def.at[0], 0, def.at[1]));
    const probe = new THREE.Vector3(pos.x, 1, pos.z);
    if (pointBlocked(probe, world.city.colliders, 1.6)) pos = world.city.spawn.clone().add(new THREE.Vector3(def.alt[0], 0, def.alt[1]));

    const cart = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 1.1, 0.9),
      new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.6 })
    );
    cart.position.copy(pos).setY(0.55);
    scene.add(cart);
    const umbrella = new THREE.Mesh(
      new THREE.ConeGeometry(1.3, 0.5, 8),
      new THREE.MeshStandardMaterial({ color: 0xf0e6c8, roughness: 0.8 })
    );
    umbrella.position.copy(pos).setY(2.4);
    scene.add(umbrella);
    carts.push({ def, pos, cd: 0 });
  }
  world.vendors = { carts };
}

export function updateVendors(world, dt, pressed) {
  const v = world.vendors;
  if (!v) return;
  const player = world.player;
  world.vendorHint = null;
  const onFoot = !player.inCar && !player.inHeli && !player.inBoat;
  if (!onFoot) return;

  for (const cart of v.carts) {
    cart.cd = Math.max(0, cart.cd - dt);
    const d = Math.hypot(player.pos.x - cart.pos.x, player.pos.z - cart.pos.z);
    if (d > 3) continue;
    if (cart.cd > 0) { world.vendorHint = `${cart.def.name} — the vendor is restocking…`; break; }
    world.vendorHint = `Press <b>E</b> — ${cart.def.hint}`;
    if (!pressed['KeyE']) break;
    if (world.money < cart.def.cost) { showToast('Not enough cash'); break; }
    world.money -= cart.def.cost;
    cart.cd = 8;
    sfxPickup();
    if (cart.def.key === 'hotdog') {
      player.health = Math.min(world.maxHealth, player.health + 40);
      showToast('HOT DOG — that hits the spot (+40 health)');
    } else if (cart.def.key === 'coffee') {
      world.buffs.speedT = 60;
      showToast('COFFEE — the city slows down around you (+speed 60s)');
    } else {
      if (world.wanted > 0) { world.wanted--; showToast('ICE CREAM — a star melts away with it'); }
      else showToast('ICE CREAM — sweet, cold, uncomplicated');
    }
    break;
  }
}
