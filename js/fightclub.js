import * as THREE from 'three';
import { HALF } from './city.js';
import { showToast, showNews, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxMissionFail } from './sound.js';
import { addRep, addChaos } from './economy.js';

// Fight club on the waterfront: after dark (9pm–5am), put $500 down and
// fight three bare-knuckle rounds against growing packs of brawlers.
// Fists and webs only — draw a gun and you forfeit the purse.

const BET = 500;
const PRIZE = 1500;
const RING = { x: HALF - 18, z: -52 };

function makeBrawler(world) {
  const a = Math.random() * Math.PI * 2;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.75, 1.8, 0.55),
    new THREE.MeshStandardMaterial({ color: 0x6a3a2a, metalness: 0.2, roughness: 0.8 })
  );
  mesh.position.set(RING.x + Math.sin(a) * 6, 0.9, RING.z + Math.cos(a) * 6);
  world.scene.add(mesh);
  const foe = { mesh, pos: mesh.position, hp: 60, dead: false };
  foe.target = {
    pos: foe.pos, aimY: 0.9, r: 1.0, webbable: true,
    get dead() { return foe.dead; },
    hit() {
      foe.hp -= 30;
      if (foe.hp <= 0 && !foe.dead) { foe.dead = true; foe.mesh.visible = false; }
    },
  };
  world.targets.push(foe.target);
  return foe;
}

function clearFoes(world) {
  const f = world.fight;
  for (const b of f.foes) {
    world.scene.remove(b.mesh);
    const ti = world.targets.indexOf(b.target);
    if (ti >= 0) world.targets.splice(ti, 1);
  }
  f.foes = [];
}

export function initFightClub(scene, world) {
  // the ring: a rope circle and four corner drums, lit by a hanging lamp
  const rope = new THREE.Mesh(
    new THREE.TorusGeometry(6, 0.12, 6, 28),
    new THREE.MeshBasicMaterial({ color: 0xd0a020 })
  );
  rope.rotation.x = Math.PI / 2;
  rope.position.set(RING.x, 1.0, RING.z);
  scene.add(rope);
  const drumMat = new THREE.MeshStandardMaterial({ color: 0x883322, metalness: 0.4, roughness: 0.6 });
  for (const [dx, dz] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) {
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.2, 10), drumMat);
    drum.position.set(RING.x + dx, 0.6, RING.z + dz);
    drum.castShadow = true;
    scene.add(drum);
  }
  world.fight = { active: false, round: 0, foes: [], startTime: 0, rope };
}

export function endFightClub(world, why) {
  const f = world.fight;
  if (!f || !f.active) return;
  f.active = false;
  world.fightHint = null;
  clearFoes(world);
  sfxMissionFail();
  showToast(`FIGHT OVER — ${why}. The purse stays with the house`);
}

export function updateFightClub(world, dt, pressed) {
  const f = world.fight;
  const player = world.player;
  world.fightHint = null;
  const open = world.clock >= 21 || world.clock < 5;
  f.rope.material.color.setHex(open ? 0xffd24a : 0x6a6a5a);

  const d = Math.hypot(player.pos.x - RING.x, player.pos.z - RING.z);

  if (!f.active) {
    if (d < 8 && !player.inCar && !player.inHeli && !player.inBoat) {
      if (!open) {
        world.fightHint = 'FIGHT CLUB — opens at 21:00. Come back after dark';
        return;
      }
      world.fightHint = `Press <b>E</b> to fight — $${BET} buy-in, win $${PRIZE}. FISTS AND WEBS ONLY`;
      if (pressed['KeyE']) {
        if (world.money < BET) { showToast('Not enough cash for the buy-in'); return; }
        world.money -= BET;
        f.active = true;
        f.round = 1;
        f.startTime = world.time;
        for (let i = 0; i < 3; i++) f.foes.push(makeBrawler(world));
        sfxMissionPass();
        showMissionMsg('ROUND 1', 'Three of them. No guns. Make it quick.', '#d0a020');
        showNews('bare-knuckle bets change hands down at the waterfront');
      }
    }
    return;
  }

  // rules: stay in the ring area, keep the guns holstered
  if (d > 30 || player.inCar || player.inHeli || player.inBoat) {
    endFightClub(world, 'you left the ring');
    return;
  }
  if (world.lastShot && world.lastShot.t > f.startTime) {
    endFightClub(world, 'someone drew a gun');
    return;
  }

  const alive = f.foes.filter((b) => !b.dead);
  world.fightHint = `ROUND ${f.round}/3 — <b>${alive.length}</b> standing`;

  for (const b of alive) {
    const dx = player.pos.x - b.pos.x;
    const dz = player.pos.z - b.pos.z;
    const bd = Math.hypot(dx, dz) || 1;
    if (bd > 1.7) {
      b.pos.x += (dx / bd) * 4.2 * dt;
      b.pos.z += (dz / bd) * 4.2 * dt;
      b.mesh.rotation.y = Math.atan2(dx, dz);
      // a little swaying menace
      b.mesh.rotation.z = Math.sin(world.time * 7 + b.pos.x) * 0.08;
    } else if (Math.random() < dt * 1.5) {
      player.health -= 6;
    }
  }

  if (alive.length === 0) {
    clearFoes(world);
    if (f.round >= 3) {
      f.active = false;
      world.fightHint = null;
      world.money += PRIZE;
      addRep(world, 250);
      addChaos(world, 20);
      if (world.stats) world.stats.brawlsWon = (world.stats.brawlsWon || 0) + 1;
      sfxMissionPass();
      showMissionMsg('CHAMPION', `+$${PRIZE} — nobody talks about it`, '#ffd24a');
      showNews('an unknown fighter cleans out the waterfront ring');
      world.onSave?.();
    } else {
      f.round++;
      const n = 2 + f.round;
      for (let i = 0; i < n; i++) f.foes.push(makeBrawler(world));
      sfxMissionPass();
      showMissionMsg(`ROUND ${f.round}`, `${n} more. They look upset.`, '#d0a020');
    }
  }
}
