import * as THREE from 'three';
import { blockStart, pointBlocked } from './city.js';
import { showToast, showNews } from './hud.js';
import { sfxPickup, sfxMissionPass } from './sound.js';
import { addCrime } from './police.js';
import { addSparks } from './effects.js';

// CITY BANK ATMs: six machines around town. Park your cash and it earns
// 2% a day — or put two rounds through a machine and take what sprays
// out, once per machine per day, if you don't mind the heat.

const SPOTS = [[2, 3], [7, 2], [3, 7], [6, 6], [4, 1], [8, 7]];
const RATE = 0.02;

export function initAtms(scene, world, save) {
  const machines = [];
  for (let i = 0; i < SPOTS.length; i++) {
    const [bi, bj] = SPOTS[i];
    let pos = new THREE.Vector3(blockStart(bi) + 6, 0, blockStart(bj) - 2.2);
    const probe = new THREE.Vector3(pos.x, 1, pos.z);
    if (pointBlocked(probe, world.city.colliders, 1.2)) pos = new THREE.Vector3(blockStart(bi) + 14, 0, blockStart(bj) - 2.2);

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 1.7, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x2a3a52, metalness: 0.6, roughness: 0.4 })
    );
    body.position.copy(pos).setY(0.85);
    scene.add(body);
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.35),
      new THREE.MeshBasicMaterial({ color: 0x7cf0c8 })
    );
    screen.position.copy(pos).add(new THREE.Vector3(0, 1.25, 0.31));
    scene.add(screen);

    const m = { pos, body, screen, hp: 60, dead: false, robDay: -99 };
    m.target = {
      pos: m.pos, aimY: 0.9, r: 0.9, passive: true,
      get dead() { return m.dead; },
      hit() {
        m.hp -= 30;
        if (m.hp <= 0 && !m.dead) { m.dead = true; m.screen.material.color.set(0x181818); }
      },
    };
    world.targets.push(m.target);
    machines.push(m);
  }
  world.bank = { machines, balance: save?.bank ?? 0, day: -1, open: false };
}

export function updateAtms(world, dt, pressed) {
  const bk = world.bank;
  if (!bk) return;
  const player = world.player;
  world.atmHint = null;

  // savings tick over at midnight
  if (bk.day !== world.dailyDay) {
    if (bk.day >= 0 && bk.balance > 0) {
      const gain = Math.round(bk.balance * RATE);
      bk.balance += gain;
      if (gain > 0) showToast(`BANK INTEREST: +$${gain} (balance $${bk.balance})`);
    }
    bk.day = world.dailyDay;
    for (const m of bk.machines) { // overnight repairs
      if (m.dead) { m.dead = false; m.hp = 60; m.screen.material.color.set(0x7cf0c8); }
    }
  }

  const onFoot = !player.inCar && !player.inHeli && !player.inBoat;
  bk.open = false;
  if (!onFoot) return;

  for (const m of bk.machines) {
    const d = Math.hypot(player.pos.x - m.pos.x, player.pos.z - m.pos.z);
    if (d > 2.5) continue;

    // a freshly smashed machine pays out — loud, unearned, once a day
    if (m.dead) {
      if (m.robDay !== world.dailyDay) {
        m.robDay = world.dailyDay;
        const loot = 250 + Math.floor(Math.random() * 300);
        world.money += loot;
        addCrime(world, 2);
        addSparks(m.pos.clone().setY(1.2), 12);
        sfxPickup();
        showToast(`ATM SMASHED — grabbed $${loot}`);
        showNews('another cash machine gutted; the bank raises fees to cope');
        world.onSave?.();
      } else {
        world.atmHint = 'OUT OF ORDER — someone got here first today';
      }
      break;
    }

    bk.open = true;
    world.nearKiosk = true; // digits bank here, not switch weapons
    world.atmHint = `CITY BANK — balance <b>$${bk.balance}</b> · 1) deposit $500 · 2) withdraw $500 · 3) deposit all — 2%/day interest`;
    if (pressed['Digit1']) {
      if (world.money < 500) showToast('Not enough cash on you');
      else { world.money -= 500; bk.balance += 500; sfxPickup(); showToast(`Deposited $500 — balance $${bk.balance}`); world.onSave?.(); }
    }
    if (pressed['Digit2']) {
      if (bk.balance < 500) showToast('Balance too low');
      else { bk.balance -= 500; world.money += 500; sfxPickup(); showToast(`Withdrew $500 — balance $${bk.balance}`); world.onSave?.(); }
    }
    if (pressed['Digit3']) {
      if (world.money <= 0) showToast('Pockets are empty');
      else {
        bk.balance += world.money;
        showToast(`Deposited $${world.money} — balance $${bk.balance}`);
        world.money = 0;
        sfxMissionPass();
        world.onSave?.();
      }
    }
    break;
  }
}
