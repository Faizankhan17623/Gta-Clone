import * as THREE from 'three';
import { blockStart, pointBlocked } from './city.js';
import { showToast } from './hud.js';
import { sfxPickup, sfxMissionPass } from './sound.js';

// THE TICKER: a terminal outside the bank. Five listings, prices roll
// once per game day — and they feel what you do to this city. Rob the
// bank and OCB Financial dives; raise chaos and Fortress Arms rallies.
// Buy with 1-5, sell with the same key. Long-term holds survive saves.

const LISTINGS = [
  { key: 'ocb', name: 'OCB FINANCIAL', base: 100 },
  { key: 'arms', name: 'FORTRESS ARMS', base: 60 },
  { key: 'cone', name: 'FROSTY CORP', base: 25 },
  { key: 'web', name: 'WEBWAY LOGISTICS', base: 80 },
  { key: 'zaza', name: 'ZAZA HOLDINGS', base: 40 },
];

export function initStocks(scene, world, save) {
  let pos = new THREE.Vector3(blockStart(8) + 12, 0, blockStart(5) + 12);
  const probe = new THREE.Vector3(pos.x, 1, pos.z);
  if (pointBlocked(probe, world.city.colliders, 1.6)) pos = new THREE.Vector3(blockStart(8) + 12, 0, blockStart(5) - 3);

  const term = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 2, 0.8),
    new THREE.MeshStandardMaterial({ color: 0x1a2a1a, metalness: 0.4, roughness: 0.5 })
  );
  term.position.copy(pos).setY(1);
  scene.add(term);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ color: 0x4af07c }));
  glow.position.copy(pos).add(new THREE.Vector3(0, 1.4, 0.41));
  scene.add(glow);

  const prices = {};
  for (const l of LISTINGS) prices[l.key] = save?.stockPrices?.[l.key] ?? l.base;
  world.stocks = {
    pos, prices, held: { ...(save?.stocks || {}) }, day: -1,
    prevHeist: 0, prevChaos: 0,
  };
}

export function updateStocks(world, dt, pressed, keys) {
  const sk = world.stocks;
  if (!sk) return;
  const player = world.player;
  world.stockHint = null;

  // daily price roll, nudged by what the player did to the city
  if (sk.day !== world.dailyDay) {
    const first = sk.day === -1;
    sk.day = world.dailyDay;
    if (!first) {
      const heists = (world.stats?.heists || 0) + (world.stats?.cheists || 0);
      const bankHit = heists > sk.prevHeist;
      const chaosUp = (world.chaosBest || 0) > sk.prevChaos;
      for (const l of LISTINGS) {
        let drift = 0.9 + Math.random() * 0.22; // -10%..+12%
        if (l.key === 'ocb' && bankHit) drift = 0.8;
        if (l.key === 'arms' && chaosUp) drift = 1.18;
        if (l.key === 'cone' && world.calendar?.today === 'BEACH DAY') drift = 1.15;
        sk.prices[l.key] = Math.max(5, Math.round(sk.prices[l.key] * drift));
      }
      sk.prevHeist = heists;
      sk.prevChaos = world.chaosBest || 0;
    }
  }

  const onFoot = !player.inCar && !player.inHeli && !player.inBoat;
  const d = Math.hypot(player.pos.x - sk.pos.x, player.pos.z - sk.pos.z);
  if (d > 3 || !onFoot) return;

  world.nearKiosk = true;
  const lines = LISTINGS.map((l, i) => {
    const held = sk.held[l.key] || 0;
    return `${i + 1}) ${l.name.split(' ')[0]} $${sk.prices[l.key]}${held ? ` (×${held})` : ''}`;
  }).join(' · ');
  world.stockHint = `THE TICKER — tap to buy, <b>hold Shift</b>+tap to sell: ${lines}`;

  for (let i = 0; i < LISTINGS.length; i++) {
    if (!pressed['Digit' + (i + 1)]) continue;
    const l = LISTINGS[i];
    const price = sk.prices[l.key];
    const selling = keys['ShiftLeft'] || keys['ShiftRight'];
    if (selling) {
      if (!(sk.held[l.key] > 0)) { showToast(`No ${l.name} to sell`); continue; }
      sk.held[l.key]--;
      world.money += price;
      sfxMissionPass();
      showToast(`SOLD 1 ${l.name} @ $${price}`);
    } else {
      if (world.money < price) { showToast('Not enough cash'); continue; }
      world.money -= price;
      sk.held[l.key] = (sk.held[l.key] || 0) + 1;
      sfxPickup();
      showToast(`BOUGHT 1 ${l.name} @ $${price}`);
    }
    world.onSave?.();
  }
}
