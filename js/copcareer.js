import * as THREE from 'three';
import { blockStart, N, pointBlocked } from './city.js';
import { createCharacter, animateWalk } from './characters.js';
import { showToast, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxMissionFail, sfxPickup } from './sound.js';

// UNDERCOVER SHIFT: clock in at the 2nd Precinct and play the other
// side. Three suspects per shift — run them down and press E to cuff.
// Shooting one still counts, at half pay. Your badge suppresses your
// own heat while the shift runs (world.onDuty, read by addCrime).
// Five ranks, each raising the payout.

const RANKS = ['CADET', 'OFFICER', 'DETECTIVE', 'SERGEANT', 'LIEUTENANT'];
const SHIFT_TIME = 180;

export function initCopcareer(scene, world, save) {
  // road edge — never inside a building
  let pos = new THREE.Vector3(blockStart(2) + 20, 0, blockStart(5) - 3.5);
  const probe = new THREE.Vector3(pos.x, 1, pos.z);
  if (pointBlocked(probe, world.city.colliders, 2.5)) pos = new THREE.Vector3(blockStart(2) + 44, 0, blockStart(5) - 3.5);

  const station = new THREE.Mesh(
    new THREE.BoxGeometry(4, 3, 3),
    new THREE.MeshStandardMaterial({ color: 0x3a5a8a, roughness: 0.6 })
  );
  station.position.copy(pos).setY(1.5);
  scene.add(station);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8), new THREE.MeshBasicMaterial({ color: 0x4a8af0 }));
  lamp.position.copy(pos).add(new THREE.Vector3(0, 3.3, 0));
  scene.add(lamp);

  world.copjob = {
    pos, lamp, on: false, t: 0, suspect: null, cuffed: 0,
    rank: Math.min(4, save?.copRank ?? 0), arrests: save?.copArrests ?? 0,
  };
}

function spawnSuspect(world) {
  const cj = world.copjob;
  const player = world.player;
  const a = Math.random() * Math.PI * 2;
  let x = player.pos.x + Math.cos(a) * 90;
  let z = player.pos.z + Math.sin(a) * 90;
  x = Math.max(blockStart(0), Math.min(blockStart(N - 1) + 50, x));
  z = Math.max(blockStart(0), Math.min(blockStart(N - 1) + 50, z));
  const ch = createCharacter({ shirt: '#c9c04a', pants: '#3a3a2a' });
  world.scene.add(ch.group);
  ch.group.position.set(x, 0, z);
  const s = { ch, pos: ch.group.position, animT: 0, hp: 40, downed: false };
  s.target = {
    pos: s.pos, aimY: 1.05, r: 1, webbable: true,
    get dead() { return s.downed; },
    hit() { s.hp -= 30; if (s.hp <= 0 && !s.downed) { s.downed = true; s.ch.group.rotation.z = Math.PI / 2; s.ch.group.position.y = 0.25; } },
    web() { s.webT = 3.5; },
  };
  world.targets.push(s.target);
  cj.suspect = s;
}

function clearSuspect(world) {
  const cj = world.copjob;
  if (!cj.suspect) return;
  world.scene.remove(cj.suspect.ch.group);
  const ti = world.targets.indexOf(cj.suspect.target);
  if (ti >= 0) world.targets.splice(ti, 1);
  cj.suspect = null;
}

export function endShift(world, quiet) {
  const cj = world.copjob;
  if (!cj?.on) return;
  cj.on = false;
  world.onDuty = false;
  clearSuspect(world);
  world.copBlip = null;
  if (!quiet) { sfxMissionFail(); showToast('SHIFT SCRUBBED — the badge goes back in the drawer'); }
}

export function updateCopcareer(world, dt, pressed) {
  const cj = world.copjob;
  if (!cj) return;
  const player = world.player;
  world.copHint = null;
  world.copBlip = null;
  cj.lamp.material.color.set(Math.floor(performance.now() * 0.003) % 2 ? 0x4a8af0 : 0xf04a4a);

  if (!cj.on) {
    const onFoot = !player.inCar && !player.inHeli && !player.inBoat;
    const d = Math.hypot(player.pos.x - cj.pos.x, player.pos.z - cj.pos.z);
    if (d < 4.5 && onFoot) {
      if (world.wanted > 0) { world.copHint = '2ND PRECINCT — come back when you\'re not, you know, wanted'; return; }
      world.copHint = `Press <b>E</b> — UNDERCOVER SHIFT as ${RANKS[cj.rank]} (3 collars, ${SHIFT_TIME}s)`;
      if (pressed['KeyE']) {
        cj.on = true;
        cj.t = SHIFT_TIME;
        cj.cuffed = 0;
        world.onDuty = true;
        spawnSuspect(world);
        sfxPickup();
        showMissionMsg('ON DUTY', `${RANKS[cj.rank]} — the scanner has three names for you`, '#4a8af0');
      }
    }
    return;
  }

  // live shift
  cj.t -= dt;
  if (cj.t <= 0) { endShift(world); return; }
  if (world.wanted > 0) { endShift(world); showToast('You committed crimes ON DUTY. Bold. Shift over.'); return; }

  const s = cj.suspect;
  if (!s) return;
  world.copBlip = { x: s.pos.x, z: s.pos.z };

  if (!s.downed) {
    // the suspect runs from you
    if (s.webT > 0) { s.webT -= dt; }
    else {
      const dx = s.pos.x - player.pos.x, dz = s.pos.z - player.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d < 45) {
        s.pos.x += (dx / d) * 6.5 * dt;
        s.pos.z += (dz / d) * 6.5 * dt;
        s.ch.group.rotation.y = Math.atan2(dx, dz);
        s.animT += 12 * dt;
        animateWalk(s.ch, s.animT, 0.9);
      }
    }
    const d = Math.hypot(s.pos.x - player.pos.x, s.pos.z - player.pos.z);
    world.copHint = `SUSPECT ${cj.cuffed + 1}/3 — run them down, <b>E</b> to cuff · ${Math.ceil(cj.t)}s`;
    if (d < 2.2 && !player.inCar && pressed['KeyE']) s.downed = true;
    else return;
  }

  // collar made (cuffed or shot)
  const clean = s.hp >= 40;
  cj.cuffed++;
  cj.arrests++;
  const pay = Math.round((200 + cj.rank * 100) * (clean ? 1 : 0.5) * (world.payMult || 1));
  world.money += pay;
  sfxPickup();
  showToast(clean ? `CUFFED — clean collar, +$${pay}` : `DOWNED — the paperwork hates you, +$${pay}`);
  clearSuspect(world);

  if (cj.cuffed >= 3) {
    const bonus = Math.round(500 * (world.payMult || 1));
    world.money += bonus;
    if (cj.rank < 4 && cj.arrests >= (cj.rank + 1) * 9) {
      cj.rank++;
      showMissionMsg('PROMOTED', `${RANKS[cj.rank]} — the pay gets better, the coffee doesn't`, '#4a8af0');
    } else {
      showMissionMsg('SHIFT COMPLETE', `+$${bonus} shift bonus`, '#4a8af0');
    }
    endShift(world, true);
    sfxMissionPass();
    world.onSave?.();
  } else {
    spawnSuspect(world);
  }
}
