import * as THREE from 'three';
import { pointBlocked } from './city.js';
import { showToast, showMissionMsg } from './hud.js';
import { sfxMissionPass } from './sound.js';

// THE SHRINE OF SECOND LIVES: prestige finally spends. Every New Game+
// crown banked (world.prestige) grants one perk point at the shrine —
// permanent, stacking, saved across everything:
//   1) HUSTLER  +10% all payouts (raises world.payMult)
//   2) IRON LUNGS  +20 max health, permanently
//   3) SILVER TONGUE  bribes and fees cost 25% less (world.discount)

const PERKS = [
  { key: 'pay', name: 'HUSTLER', blurb: '+10% every payout' },
  { key: 'hp', name: 'IRON LUNGS', blurb: '+20 max health' },
  { key: 'talk', name: 'SILVER TONGUE', blurb: 'kiosk fees -25%' },
];

export function initPerks(scene, world, save) {
  let pos = world.city.spawn.clone().add(new THREE.Vector3(-26, 0, 30));
  const probe = new THREE.Vector3(pos.x, 1, pos.z);
  if (pointBlocked(probe, world.city.colliders, 1.4)) pos = world.city.spawn.clone().add(new THREE.Vector3(-30, 0, 26));

  const shrine = new THREE.Mesh(
    new THREE.ConeGeometry(0.8, 2.2, 5),
    new THREE.MeshStandardMaterial({ color: 0x8a7a2a, metalness: 0.8, roughness: 0.3 })
  );
  shrine.position.copy(pos).setY(1.1);
  scene.add(shrine);

  const bought = { pay: 0, hp: 0, talk: 0, ...(save?.perks || {}) };
  world.perkShop = { pos, shrine, bought };
  // apply on load
  world.payMult = (world.payMult || 1) + bought.pay * 0.1;
  world.maxHealth += bought.hp * 20;
  world.discount = 1 - Math.min(0.75, bought.talk * 0.25);
}

function spent(world) {
  const b = world.perkShop.bought;
  return b.pay + b.hp + b.talk;
}

export function updatePerks(world, dt, pressed) {
  const pk = world.perkShop;
  if (!pk) return;
  const player = world.player;
  world.perkHint = null;
  pk.shrine.rotation.y += dt * 0.6;

  const onFoot = !player.inCar && !player.inHeli && !player.inBoat;
  const d = Math.hypot(player.pos.x - pk.pos.x, player.pos.z - pk.pos.z);
  if (d > 3 || !onFoot) return;

  const points = (world.prestige || 0) - spent(world);
  if ((world.prestige || 0) === 0) {
    world.perkHint = 'THE SHRINE sleeps — it answers only to prestige (finish NG+)';
    return;
  }
  if (points <= 0) {
    world.perkHint = 'THE SHRINE — every crown spent. Prestige again for more.';
    return;
  }
  world.nearKiosk = true;
  const lines = PERKS.map((p, i) => `${i + 1}) ${p.name} ×${pk.bought[p.key]} — ${p.blurb}`).join(' · ');
  world.perkHint = `SHRINE — <b>${points}</b> perk point${points > 1 ? 's' : ''}: ${lines}`;

  for (let i = 0; i < PERKS.length; i++) {
    if (!pressed['Digit' + (i + 1)]) continue;
    const p = PERKS[i];
    pk.bought[p.key]++;
    if (p.key === 'pay') world.payMult = (world.payMult || 1) + 0.1;
    if (p.key === 'hp') { world.maxHealth += 20; player.health += 20; }
    if (p.key === 'talk') world.discount = 1 - Math.min(0.75, pk.bought.talk * 0.25);
    sfxMissionPass();
    showMissionMsg('PERK ETCHED', `${p.name} ×${pk.bought[p.key]} — ${p.blurb}`, '#c9a020');
    world.onSave?.();
    break;
  }
}
