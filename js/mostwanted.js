import * as THREE from 'three';
import { blockStart, pointBlocked } from './city.js';
import { createCharacter } from './characters.js';
import { showToast, showMissionMsg, showNews } from './hud.js';
import { sfxMissionPass, sfxShot } from './sound.js';
import { addTracer } from './effects.js';
import { addRep } from './economy.js';

// THE MOST WANTED WALL: five faces stapled outside the 2nd Precinct.
// Each fugitive holes up in a fixed lair with a gimmick — more health,
// harder hits, one hides at night only. Take them in order. The city
// remembers every name you cross off.

const MARKS = [
  { name: 'KNUCKLES KOWALSKI', hp: 120, dmg: 6, pay: 1500, at: [1, 2], blurb: 'bare-knuckle enforcer' },
  { name: 'MADAME GUILLOTINE', hp: 160, dmg: 8, pay: 2500, at: [7, 3], blurb: 'debt collector, permanent methods' },
  { name: 'THE ACCOUNTANT', hp: 140, dmg: 12, pay: 4000, at: [3, 8], blurb: 'shoots like he audits: thoroughly' },
  { name: 'SISTER MIDNIGHT', hp: 200, dmg: 10, pay: 6000, at: [8, 6], night: true, blurb: 'only surfaces after 21:00' },
  { name: 'CAPTAIN NEMO', hp: 280, dmg: 14, pay: 10000, at: [5, 8], blurb: 'ex-harbor patrol, nothing to lose' },
];

export function initMostwanted(scene, world, save) {
  const cj = world.copjob;
  const base = cj ? cj.pos : new THREE.Vector3(blockStart(2) + 10, 0, blockStart(5) + 10);
  let boardPos = base.clone().add(new THREE.Vector3(8, 0, 0));
  const probe = new THREE.Vector3(boardPos.x, 1, boardPos.z);
  if (pointBlocked(probe, world.city.colliders, 1.2)) boardPos = base.clone().add(new THREE.Vector3(0, 0, 8));

  const board = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 1.8, 0.15),
    new THREE.MeshStandardMaterial({ color: 0x6a5138, roughness: 0.9 })
  );
  board.position.copy(boardPos).setY(1.5);
  scene.add(board);

  world.mostwanted = { boardPos, idx: save?.mwIdx ?? 0, foe: null, shootT: 1 };
}

function spawnMark(world) {
  const mw = world.mostwanted;
  const def = MARKS[mw.idx];
  let pos = new THREE.Vector3(blockStart(def.at[0]) + 14, 0, blockStart(def.at[1]) + 14);
  const probe = new THREE.Vector3(pos.x, 1, pos.z);
  if (pointBlocked(probe, world.city.colliders, 1.2)) pos = new THREE.Vector3(blockStart(def.at[0]) + 20, 0, blockStart(def.at[1]) - 3); // curb outside the lair
  const ch = createCharacter({ shirt: '#8a2a3a', pants: '#22222a', hair: '#111' });
  world.scene.add(ch.group);
  ch.group.position.copy(pos);
  const foe = { def, ch, pos: ch.group.position, hp: def.hp, dead: false, webT: 0 };
  foe.target = {
    pos: foe.pos, aimY: 1.05, r: 1.1, webbable: true,
    get dead() { return foe.dead; },
    hit() {
      foe.hp -= 30;
      if (foe.hp <= 0 && !foe.dead) { foe.dead = true; foe.ch.group.rotation.z = Math.PI / 2; foe.ch.group.position.y = 0.25; }
    },
    web() { foe.webT = 3; },
  };
  world.targets.push(foe.target);
  mw.foe = foe;
}

function clearMark(world) {
  const mw = world.mostwanted;
  if (!mw.foe) return;
  world.scene.remove(mw.foe.ch.group);
  const ti = world.targets.indexOf(mw.foe.target);
  if (ti >= 0) world.targets.splice(ti, 1);
  mw.foe = null;
}

export function updateMostwanted(world, dt) {
  const mw = world.mostwanted;
  if (!mw) return;
  const player = world.player;
  world.mwHint = null;
  world.mwBlip = null;

  if (mw.idx >= MARKS.length) return; // wall is clean

  const def = MARKS[mw.idx];
  const night = world.clock >= 21 || world.clock <= 5;
  const available = !def.night || night;

  // reading the board
  const db = Math.hypot(player.pos.x - mw.boardPos.x, player.pos.z - mw.boardPos.z);
  if (db < 4 && !mw.foe) {
    world.mwHint = available
      ? `MOST WANTED #${mw.idx + 1}: <b>${def.name}</b> — ${def.blurb} · $${def.pay} · lair marked`
      : `MOST WANTED #${mw.idx + 1}: <b>${def.name}</b> — ${def.blurb} · only out after dark`;
  }

  if (!available) { if (mw.foe) clearMark(world); return; }
  if (!mw.foe) spawnMark(world);
  const foe = mw.foe;
  if (!foe) return;
  world.mwBlip = { x: foe.pos.x, z: foe.pos.z };

  if (foe.dead) {
    world.money += def.pay;
    addRep(world, 200);
    if (world.stats) world.stats.mostwanted = mw.idx + 1;
    sfxMissionPass();
    showMissionMsg('CROSSED OFF', `${def.name} · +$${def.pay}`, '#f04a4a');
    showNews(`${def.name.toLowerCase()} era ends abruptly; nobody sends flowers`);
    clearMark(world);
    mw.idx++;
    world.onSave?.();
    return;
  }

  // the mark fights back
  if (foe.webT > 0) { foe.webT -= dt; return; }
  const dx = player.pos.x - foe.pos.x, dz = player.pos.z - foe.pos.z;
  const d = Math.hypot(dx, dz) || 1;
  if (d < 34) {
    foe.ch.group.rotation.y = Math.atan2(dx, dz);
    mw.shootT -= dt;
    if (mw.shootT <= 0 && d < 26 && !player.inCar) {
      mw.shootT = 1.1 + Math.random() * 0.6;
      sfxShot('pistol');
      addTracer(foe.pos.clone().setY(1.4), player.pos.clone().setY(player.pos.y + 1.1));
      if (Math.random() < 0.35 && !(player.dodgeT > 0)) player.health -= def.dmg;
    }
    if (d < 30) world.mwHint = `${def.name} — <b>${Math.max(0, foe.hp)}</b> hp`;
  }
}
