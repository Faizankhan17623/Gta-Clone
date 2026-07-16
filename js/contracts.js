import * as THREE from 'three';
import { blockStart, N } from './city.js';
import { showToast, showNews, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxMissionFail } from './sound.js';
import { addRep, addChaos } from './economy.js';

// THE CONTRACTS BOARD: a kiosk that pays for named "most wanted" takedowns,
// one rank at a time. Unlike the WANTED board (bounty.js — grab-any, flat
// reward, no clock) this escalates a five-rank ladder with rising payouts,
// tougher marks and an actual getaway clock: find them and finish it before
// the window closes or the contract is burned for the day.

const NAMES = [
  'FAST EDDIE', 'THE ACCOUNTANT', 'DOLLY MALONE', 'TWO-TONE TERRY', 'SISTER CHROME',
];
const RANKS = [
  { name: 'RANK E — SMALL TIME', hp: 60, window: 90, pay: 900 },
  { name: 'RANK D — KNOWN ASSOCIATE', hp: 90, window: 80, pay: 1500 },
  { name: 'RANK C — MID-LEVEL', hp: 130, window: 70, pay: 2400 },
  { name: 'RANK B — HIGH VALUE', hp: 170, window: 60, pay: 3600 },
  { name: 'RANK A — GHOST', hp: 220, window: 55, pay: 5500 },
];

function makeMark(world, x, z, hp) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 1.8, 0.5),
    new THREE.MeshStandardMaterial({ color: 0xc9445a, metalness: 0.3, roughness: 0.6, emissive: 0x300008 })
  );
  mesh.position.set(x, 0.9, z);
  world.scene.add(mesh);
  const foe = { mesh, pos: mesh.position, hp, maxHp: hp, dead: false };
  foe.target = {
    pos: foe.pos, aimY: 0.9, r: 1.0, webbable: true,
    get dead() { return foe.dead; },
    hit() {
      foe.hp -= 28;
      if (foe.hp <= 0 && !foe.dead) { foe.dead = true; foe.mesh.visible = false; }
    },
  };
  world.targets.push(foe.target);
  return foe;
}

export function initContracts(scene, world, save) {
  const kioskPos = world.city.spawn.clone().add(new THREE.Vector3(-30, 0, 18));
  const kiosk = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 1.6, 1.3),
    new THREE.MeshStandardMaterial({ color: 0x1a1a22, metalness: 0.5, roughness: 0.4 })
  );
  kiosk.position.copy(kioskPos).setY(0.8);
  scene.add(kiosk);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 0.6),
    new THREE.MeshBasicMaterial({ color: 0xc9445a })
  );
  screen.position.copy(kioskPos).add(new THREE.Vector3(0, 1.05, 0.66));
  scene.add(screen);

  world.contracts = {
    kioskPos, screen,
    rank: Math.min(RANKS.length, save?.contractRank | 0),
    active: false, mark: null, t: 0, name: '',
  };
}

function clearMark(world) {
  const c = world.contracts;
  if (!c.mark) return;
  world.scene.remove(c.mark.mesh);
  const ti = world.targets.indexOf(c.mark.target);
  if (ti >= 0) world.targets.splice(ti, 1);
  c.mark = null;
}

export function endContract(world) {
  const c = world.contracts;
  if (!c?.active) return;
  c.active = false;
  clearMark(world);
}

export function updateContracts(world, dt, pressed) {
  const c = world.contracts;
  if (!c) return;
  const player = world.player;
  world.contractHint = null;
  world.contractBlip = null;
  c.screen.material.color.setHex(Math.floor(world.time * 2) % 2 === 0 ? 0xc9445a : 0x701020);

  if (!c.active) {
    if (c.rank >= RANKS.length) return; // board's clean, you cleared every rank
    const d = Math.hypot(player.pos.x - c.kioskPos.x, player.pos.z - c.kioskPos.z);
    if (d < 3.4 && !player.inCar && !player.inHeli) {
      const rung = RANKS[c.rank];
      world.contractHint = `Press <b>E</b> for a CONTRACT — ${rung.name}, $${rung.pay}, ${rung.window}s to close it`;
      if (pressed['KeyE']) {
        let x = 0, z = 0;
        for (let i = 0; i < 20; i++) {
          x = blockStart((Math.random() * N) | 0) + 6;
          z = blockStart((Math.random() * N) | 0) + 6;
          if (Math.hypot(x - player.pos.x, z - player.pos.z) > 120) break;
        }
        c.mark = makeMark(world, x, z, rung.hp);
        c.name = NAMES[c.rank % NAMES.length];
        c.active = true;
        c.t = rung.window;
        sfxMissionPass();
        showMissionMsg('CONTRACT ACCEPTED', `${c.name} — ${rung.name}. ${rung.window}s on the clock.`, '#c9445a');
        showNews(`a name goes up on the contracts kiosk: ${c.name.toLowerCase()}`);
      }
    }
    return;
  }

  const rung = RANKS[c.rank];
  c.t -= dt;
  world.contractBlip = { x: c.mark.pos.x, z: c.mark.pos.z };
  world.contractHint = c.mark.dead
    ? 'Contract closed — reporting in'
    : `${c.name} — <b>${Math.max(0, Math.ceil(c.t))}s</b> · ${Math.max(0, Math.round((c.mark.hp / c.mark.maxHp) * 100))}%`;

  // the mark runs once you're close, and isn't shy about it
  if (!c.mark.dead) {
    const dx = c.mark.pos.x - player.pos.x;
    const dz = c.mark.pos.z - player.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    if (d < 30) {
      c.mark.pos.x += (dx / d) * 4.2 * dt;
      c.mark.pos.z += (dz / d) * 4.2 * dt;
      c.mark.mesh.rotation.y = Math.atan2(dx, dz);
    }
  }

  if (c.mark.dead) {
    c.active = false;
    clearMark(world);
    const pay = Math.round(rung.pay * (world.payMult || 1));
    world.money += pay;
    addRep(world, 150 + c.rank * 40);
    addChaos(world, 15);
    c.rank++;
    if (world.stats) world.stats.contracts = (world.stats.contracts || 0) + 1;
    sfxMissionPass();
    showMissionMsg('CONTRACT CLOSED', `+$${pay} — ${c.name} is off the board`, '#ffd24a');
    showNews(`${c.name.toLowerCase()} stops being a problem for anyone`);
    world.onSave?.();
    return;
  }

  if (c.t <= 0) {
    c.active = false;
    clearMark(world);
    sfxMissionFail();
    showMissionMsg('CONTRACT BURNED', 'The window closed — same rank, try again', '#ff5a4a');
  }
}
