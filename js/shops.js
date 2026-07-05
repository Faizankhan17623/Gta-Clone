import * as THREE from 'three';
import { blockStart, BLOCK, N } from './city.js';
import { showToast, showNews } from './hud.js';
import { addCrime } from './police.js';
import { sfxPickup, sfxMissionPass, sfxMissionFail } from './sound.js';
import { webCfg } from './web.js';
import { makeVehicle } from './car.js';
import { applySuit } from './characters.js';

// Robbable corner stores (hold E: cash + heat) and the upgrade den where
// swing money buys permanent buffs.

const ROB_TIME = 1.6;
const ROB_COOLDOWN = 90;

function kiosk(scene, pos, color, signColor, label) {
  const group = new THREE.Group();
  const hut = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 2.4, 2.6),
    new THREE.MeshLambertMaterial({ color })
  );
  hut.position.y = 1.2;
  hut.castShadow = true;
  group.add(hut);

  const c = document.createElement('canvas');
  c.width = 128; c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#0a0a10';
  g.fillRect(0, 0, 128, 32);
  g.fillStyle = signColor;
  g.font = 'bold 18px Arial';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, 64, 17);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 0.65),
    new THREE.MeshBasicMaterial({ map: tex })
  );
  sign.position.set(0, 2.75, 0);
  group.add(sign);
  group.userData.sign = sign;

  const ring = new THREE.Mesh(
    new THREE.CylinderGeometry(2.3, 2.3, 0.4, 22, 1, true),
    new THREE.MeshBasicMaterial({ color: signColor, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.position.y = 0.4;
  group.add(ring);
  group.userData.ring = ring;

  group.position.copy(pos);
  scene.add(group);
  return group;
}

export function initShops(scene, world, savedUpgrades) {
  const shops = [];
  // one store on a corner of six different blocks, spread over the city
  const picks = [[0, 0], [3, 1], [6, 2], [1, 5], [4, 6], [7, 7]];
  for (const [bi, bj] of picks) {
    const pos = new THREE.Vector3(blockStart(bi) + 2.5, 0, blockStart(bj) + 2.5);
    const mesh = kiosk(scene, pos, '#3a2f28', '#5fe07a', 'CORNER $HOP');
    shops.push({ pos, mesh, cd: 0, robT: 0 });
  }

  // upgrade den near spawn — purple neon
  const denPos = world.city.spawn.clone().add(new THREE.Vector3(14, 0, -10));
  const den = kiosk(scene, denPos, '#241a30', '#c95aff', 'WEB DEN');

  // wardrobe — pink, beside the den
  const wardrobePos = world.city.spawn.clone().add(new THREE.Vector3(14, 0, 12));
  kiosk(scene, wardrobePos, '#301a2a', '#ff6ab0', 'WARDROBE');

  // casino — gold, a block over
  const casinoPos = world.city.spawn.clone().add(new THREE.Vector3(-16, 0, 12));
  kiosk(scene, casinoPos, '#2e2410', '#ffd24a', 'LUCKY 7 CASINO');

  // dealership — cyan
  const dealerPos = world.city.spawn.clone().add(new THREE.Vector3(-16, 0, -12));
  kiosk(scene, dealerPos, '#102a2e', '#3dd2ff', 'AUTO PALACE');

  // garage pad — park any vehicle here and it's yours forever
  const garagePos = world.city.spawn.clone().add(new THREE.Vector3(16, 0, 14));
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(4.2, 4.2, 0.22, 24),
    new THREE.MeshLambertMaterial({ color: 0x1a2a45 })
  );
  pad.position.copy(garagePos).setY(0.3);
  scene.add(pad);
  const padRing = new THREE.Mesh(
    new THREE.CylinderGeometry(4.2, 4.2, 0.5, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x4a8cff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })
  );
  padRing.position.copy(garagePos).setY(0.5);
  scene.add(padRing);

  world.upgrades = { range: false, winch: false, armor: false, ...(savedUpgrades || {}) };
  world.shops = shops;
  world.shopHint = null;
  world.nearDen = false;
  world.nearKiosk = false;
  applyUpgrades(world);

  // suits restore from the save
  world.suitsOwned = { street: true, ...(world.suitsOwnedSaved || {}) };
  wearSuit(world, world.suitSaved || 'street', true);

  const state = { shops, den, denPos, casinoPos, dealerPos, garagePos, wardrobePos, casinoCd: 0, garageVeh: null };
  return state;
}

// Rebuild the saved garage vehicle on the pad (called at load + respawn).
export function ensureGarageVehicle(state, world) {
  const kind = world.garageKind;
  if (!kind) return;
  if (state.garageVeh && !state.garageVeh.dead) return;
  const g = state.garagePos;
  const opts = kind === 'bike' ? { bike: true } : {};
  const v = makeVehicle(world.scene, g.x, g.z, 0, kind === 'bike' ? '#23262d' : '#3d6b8f', opts);
  state.garageVeh = v;
  world.parked.push(v);
}

// Exiting a vehicle on the pad stores it as your garage ride.
export function garageCheck(state, world, car) {
  if (car.tank) return; // the army wants that back
  if (Math.hypot(car.pos.x - state.garagePos.x, car.pos.z - state.garagePos.z) > 4.5) return;
  world.garageKind = car.bike ? 'bike' : 'car';
  state.garageVeh = car;
  showToast('VEHICLE GARAGED — it respawns here if lost');
  world.onSave?.();
}

export function applyUpgrades(world) {
  if (world.upgrades.range) webCfg.range = 150;
  if (world.upgrades.winch) webCfg.reel = 17;
  world.maxHealth = world.upgrades.armor ? 150 : 100;
}

export const SUITS = [
  { key: 'street', cost: 0, name: 'STREET CLOTHES', colors: { shirt: '#cfcfc6', pants: '#27406b', skin: '#c98e63' }, perks: {} },
  { key: 'classic', cost: 600, name: 'CLASSIC RED-BLUE (+50% style)', colors: { shirt: '#c1121f', pants: '#1f3fa8', skin: '#c98e63' }, perks: { style: 1.5 } },
  { key: 'symbiote', cost: 1200, name: 'SYMBIOTE (2x melee, 10s webs)', colors: { shirt: '#101014', pants: '#101014', skin: '#25252c', hair: '#101014' }, perks: { melee: 2, webDur: 10 } },
  { key: 'stealth', cost: 900, name: 'STEALTH (heat fades 2x faster)', colors: { shirt: '#c9c9d2', pants: '#8f8f9c', skin: '#c98e63' }, perks: { decay: 12, busted: 3.2 } },
];

export function wearSuit(world, key, quiet = false) {
  const suit = SUITS.find((x) => x.key === key) || SUITS[0];
  world.suit = suit.key;
  world.perks = { style: 1, melee: 1, webDur: 6, decay: 24, busted: 1.6, ...suit.perks };
  applySuit(world.player.ch, suit.colors);
  if (!quiet) showToast(`SUIT: ${suit.name}`);
}

const UPG = [
  { key: 'range', cost: 800, name: 'LONG WEBS (150m range)' },
  { key: 'winch', cost: 600, name: 'FAST WINCH' },
  { key: 'armor', cost: 1000, name: 'BODY ARMOR (150 HP)' },
];

export function updateShops(state, world, dt, keys, pressed) {
  const player = world.player;
  world.shopHint = null;
  world.nearDen = false;
  world.nearKiosk = false;
  state.casinoCd = Math.max(0, state.casinoCd - dt);
  const onFoot = !player.inCar && !player.inHeli && player.pos.y < 2;

  for (const s of state.shops) {
    s.cd = Math.max(0, s.cd - dt);
    s.mesh.userData.ring.visible = s.cd <= 0;
    s.mesh.userData.ring.rotation.y += dt;

    const d = Math.hypot(s.pos.x - player.pos.x, s.pos.z - player.pos.z);
    if (!onFoot || d > 3.4) { s.robT = 0; continue; }

    if (s.cd > 0) {
      world.shopHint = 'Store already hit — come back later';
      continue;
    }
    if (keys['KeyE']) {
      s.robT += dt;
      world.shopHint = `ROBBING... ${Math.ceil((ROB_TIME - s.robT) * 10) / 10}s`;
      if (s.robT >= ROB_TIME) {
        s.robT = 0;
        s.cd = ROB_COOLDOWN;
        const take = 250 + ((Math.random() * 200) | 0);
        world.money += take;
        addCrime(world, 2);
        sfxPickup();
        showToast(`STORE ROBBED +$${take}`);
        world.onSave?.();
      }
    } else {
      s.robT = Math.max(0, s.robT - dt * 2);
      world.shopHint = 'Hold <b>E</b> to rob the store';
    }
  }

  // casino: 1/2/3 = bet $100 / $500 / $1000
  const cd = Math.hypot(state.casinoPos.x - player.pos.x, state.casinoPos.z - player.pos.z);
  if (onFoot && cd < 3.6) {
    world.nearKiosk = true;
    world.shopHint = 'LUCKY 7 — bet <b>1</b> $100 · <b>2</b> $500 · <b>3</b> $1000';
    const bets = [100, 500, 1000];
    for (let i = 0; i < 3; i++) {
      if (!pressed['Digit' + (i + 1)] || state.casinoCd > 0) continue;
      state.casinoCd = 1.2;
      const bet = bets[i];
      if (world.money < bet) { showToast('Not enough cash'); continue; }
      world.money -= bet;
      const roll = Math.random();
      if (roll < 0.05) {
        world.money += bet * 5;
        if (world.stats) world.stats.jackpots++;
        sfxMissionPass();
        showToast(`JACKPOT!!! +$${bet * 5}`);
        showNews('massive jackpot hit at the Lucky 7');
      } else if (roll < 0.5) {
        world.money += bet * 2;
        sfxPickup();
        showToast(`WINNER +$${bet * 2}`);
      } else {
        sfxMissionFail();
        showToast('House wins...');
      }
      world.onSave?.();
    }
  }

  // dealership: 1 = supercar, 2 = superbike
  const dl = Math.hypot(state.dealerPos.x - player.pos.x, state.dealerPos.z - player.pos.z);
  if (onFoot && dl < 3.6) {
    world.nearKiosk = true;
    world.shopHint = 'AUTO PALACE — <b>1</b> Supercar $2500 · <b>2</b> Superbike $1500';
    const deals = [
      { cost: 2500, name: 'SUPERCAR', opts: { accel: 26, top: 58 }, color: '#c1121f' },
      { cost: 1500, name: 'SUPERBIKE', opts: { bike: true, accel: 32, top: 66 }, color: '#f5a800' },
      { cost: 4000, name: 'MONSTER TRUCK', opts: { accel: 20, top: 44, rad: 2.2, health: 260, monster: true }, color: '#3a6b2a' },
    ];
    world.shopHint = 'AUTO PALACE — <b>1</b> Supercar $2500 · <b>2</b> Superbike $1500 · <b>3</b> Monster Truck $4000';
    for (let i = 0; i < deals.length; i++) {
      if (!pressed['Digit' + (i + 1)]) continue;
      const deal = deals[i];
      if (world.money < deal.cost) { showToast('Not enough cash'); continue; }
      world.money -= deal.cost;
      const v = makeVehicle(world.scene, state.dealerPos.x + 7, state.dealerPos.z, 0, deal.color, deal.opts);
      world.parked.push(v);
      sfxMissionPass();
      showToast(`${deal.name} DELIVERED — it's outside`);
      world.onSave?.();
    }
  }

  // garage pad hint
  if (onFoot && Math.hypot(state.garagePos.x - player.pos.x, state.garagePos.z - player.pos.z) < 5) {
    world.shopHint = world.garageKind
      ? 'GARAGE — your ride respawns here'
      : 'GARAGE — exit any vehicle on the pad to keep it forever';
  }

  // wardrobe: 1-4 buy/wear suits
  const wd = Math.hypot(state.wardrobePos.x - player.pos.x, state.wardrobePos.z - player.pos.z);
  if (onFoot && wd < 3.6) {
    world.nearKiosk = true;
    world.shopHint = 'WARDROBE — ' + SUITS.map((u, i) =>
      world.suitsOwned[u.key]
        ? `${i + 1}) ${u.name}${world.suit === u.key ? ' ✔' : ''}`
        : `${i + 1}) ${u.name} $${u.cost}`
    ).join(' · ');
    for (let i = 0; i < SUITS.length; i++) {
      if (!pressed['Digit' + (i + 1)]) continue;
      const u = SUITS[i];
      if (world.suitsOwned[u.key]) {
        wearSuit(world, u.key);
      } else if (world.money < u.cost) {
        showToast('Not enough cash');
      } else {
        world.money -= u.cost;
        world.suitsOwned[u.key] = true;
        wearSuit(world, u.key);
        sfxMissionPass();
      }
      world.onSave?.();
    }
  }

  // upgrade den
  const dd = Math.hypot(state.denPos.x - player.pos.x, state.denPos.z - player.pos.z);
  if (onFoot && dd < 3.6) {
    world.nearDen = true;
    world.nearKiosk = true;
    const lines = UPG.map((u, i) =>
      world.upgrades[u.key] ? `${i + 1}) ${u.name} ✔` : `${i + 1}) ${u.name} $${u.cost}`
    );
    world.shopHint = `WEB DEN — press ${lines.join(' · ')}`;
    for (let i = 0; i < UPG.length; i++) {
      if (!pressed['Digit' + (i + 1)]) continue;
      const u = UPG[i];
      if (world.upgrades[u.key]) showToast('Already owned');
      else if (world.money < u.cost) showToast('Not enough cash');
      else {
        world.money -= u.cost;
        world.upgrades[u.key] = true;
        applyUpgrades(world);
        if (u.key === 'armor') player.health = world.maxHealth;
        sfxMissionPass();
        showToast(`BOUGHT: ${u.name}`);
        world.onSave?.();
      }
    }
  }
}
