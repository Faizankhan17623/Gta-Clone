import * as THREE from 'three';
import { blockStart, BLOCK, N } from './city.js';
import { showToast } from './hud.js';
import { addCrime } from './police.js';
import { sfxPickup, sfxMissionPass } from './sound.js';
import { webCfg } from './web.js';

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

  world.upgrades = { range: false, winch: false, armor: false, ...(savedUpgrades || {}) };
  world.shops = shops;
  world.shopHint = null;
  world.nearDen = false;
  applyUpgrades(world);
  return { shops, den, denPos };
}

export function applyUpgrades(world) {
  if (world.upgrades.range) webCfg.range = 150;
  if (world.upgrades.winch) webCfg.reel = 17;
  world.maxHealth = world.upgrades.armor ? 150 : 100;
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

  // upgrade den
  const dd = Math.hypot(state.denPos.x - player.pos.x, state.denPos.z - player.pos.z);
  if (onFoot && dd < 3.6) {
    world.nearDen = true;
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
