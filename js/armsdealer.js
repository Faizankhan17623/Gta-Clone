import * as THREE from 'three';
import { pointBlocked } from './city.js';
import { showToast, showNews } from './hud.js';
import { sfxMissionPass } from './sound.js';

// BLACK MARKET ARMS DEALER: a van in a back alley sells bulk ammo at a
// premium, no waiting for yellow crates — and once rep is high enough,
// unlocks a one-time RPG ammo restock nobody else offers.

const DEALS = [
  { key: 'mg', name: 'MG DRUM', ammo: 40, cost: 900 },
  { key: 'sg', name: 'SHOTGUN SHELLS', ammo: 16, cost: 700 },
  { key: 'sn', name: 'SNIPER CASE', ammo: 6, cost: 1400 },
  { key: 'gren', name: 'GRENADE CRATE', ammo: 4, cost: 1200 },
  { key: 'rpg', name: 'RPG ROUNDS', ammo: 3, cost: 2600, repNeed: 1500 },
];

export function initArmsdealer(scene, world) {
  // west of spawn, clear of the storm-chaser van, bounty board and drone pad
  let pos = world.city.spawn.clone().add(new THREE.Vector3(-32, 0, -8));
  const probe = new THREE.Vector3(pos.x, 1, pos.z);
  if (pointBlocked(probe, world.city.colliders, 2)) pos = world.city.spawn.clone().add(new THREE.Vector3(-34, 0, -14));

  const van = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 1.8, 4),
    new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.5, roughness: 0.5 })
  );
  van.position.copy(pos).setY(0.9);
  scene.add(van);
  const light = new THREE.PointLight(0xff3030, 3, 8);
  light.position.copy(pos).add(new THREE.Vector3(0, 1.5, 0));
  scene.add(light);

  world.armsdealer = { pos, open: false };
}

export function updateArmsdealer(world, dt, pressed, ammo) {
  const ad = world.armsdealer;
  if (!ad) return;
  const player = world.player;
  world.armsHint = null;
  const onFoot = !player.inCar && !player.inHeli && !player.inBoat;
  const d = Math.hypot(player.pos.x - ad.pos.x, player.pos.z - ad.pos.z);
  if (d > 4 || !onFoot) { ad.open = false; return; }

  if (!ad.open) {
    world.armsHint = 'Press <b>E</b> to talk to the ARMS DEALER — no questions, just cash';
    if (pressed['KeyE']) ad.open = true;
    return;
  }

  world.nearKiosk = true; // digits buy ammo here, not switch weapons
  const rep = world.rep || 0;
  const lines = DEALS.map((deal, i) => {
    if (deal.repNeed && rep < deal.repNeed) return `${i + 1}) ??? (needs ${deal.repNeed} rep)`;
    return `${i + 1}) ${deal.name} +${deal.ammo} — $${deal.cost}`;
  }).join(' · ');
  world.armsHint = `DEALER: ${lines} · <b>E</b> to leave`;

  for (let i = 0; i < DEALS.length; i++) {
    if (!pressed['Digit' + (i + 1)]) continue;
    const deal = DEALS[i];
    if (deal.repNeed && rep < deal.repNeed) { showToast('The dealer doesn\'t trust you with that yet'); continue; }
    if (world.money < deal.cost) { showToast('Not enough cash'); continue; }
    world.money -= deal.cost;
    ammo[deal.key] = (ammo[deal.key] || 0) + deal.ammo;
    sfxMissionPass();
    showToast(`BOUGHT ${deal.name} — +${deal.ammo} ammo`);
    showNews('a van in a back alley does brisk, quiet business');
    world.onSave?.();
  }
  if (pressed['KeyE']) ad.open = false;
}
