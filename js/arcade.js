import * as THREE from 'three';
import { blockStart, pointBlocked } from './city.js';
import { showToast, showMissionMsg } from './hud.js';
import { sfxPickup, sfxMissionPass, sfxMissionFail } from './sound.js';

// PIXEL PALACE: two cabinets under a neon awning. HI-STRIKER is pure
// timing — a marker sweeps a meter in the hint bar, E locks it, center
// pays tickets. CLAW MACHINE is nerve — the claw drifts, E drops it,
// most drops come up empty because claw machines are a scam everywhere.
// 50 tickets trade for $2000 at the counter.

export function initArcade(scene, world, save) {
  let pos = new THREE.Vector3(blockStart(7) + 12, 0, blockStart(8) + 12);
  const probe = new THREE.Vector3(pos.x, 1, pos.z);
  if (pointBlocked(probe, world.city.colliders, 2.4)) pos = new THREE.Vector3(blockStart(7) + 40, 0, blockStart(8) - 3);

  const mats = [0xf05a9a, 0x4ad2ff];
  const cabs = [];
  for (let i = 0; i < 2; i++) {
    const cab = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 2, 1),
      new THREE.MeshStandardMaterial({ color: 0x2a2a34, roughness: 0.5 })
    );
    cab.position.copy(pos).add(new THREE.Vector3(i * 2.2 - 1.1, 1, 0));
    scene.add(cab);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.6), new THREE.MeshBasicMaterial({ color: mats[i] }));
    screen.position.copy(cab.position).add(new THREE.Vector3(0, 0.45, 0.51));
    scene.add(screen);
    cabs.push({ pos: cab.position });
  }

  world.arcade = {
    pos, cabs, tickets: save?.tickets ?? 0,
    game: null, t: 0, dir: 1, val: 0,
  };
}

export function updateArcade(world, dt, pressed) {
  const ar = world.arcade;
  if (!ar) return;
  const player = world.player;
  world.arcadeHint = null;
  const onFoot = !player.inCar && !player.inHeli && !player.inBoat;
  const d = Math.hypot(player.pos.x - ar.pos.x, player.pos.z - ar.pos.z);
  if (d > 4 || !onFoot) { ar.game = null; return; }

  // a game in progress
  if (ar.game === 'striker') {
    ar.val += ar.dir * dt * 1.8;
    if (ar.val > 1) { ar.val = 1; ar.dir = -1; }
    if (ar.val < 0) { ar.val = 0; ar.dir = 1; }
    const n = Math.round(ar.val * 20);
    world.arcadeHint = `HI-STRIKER: [${'='.repeat(n)}◆${'='.repeat(20 - n)}] — <b>E</b> to slam`;
    if (pressed['KeyE']) {
      const off = Math.abs(ar.val - 0.5);
      const win = off < 0.06 ? 5 : off < 0.16 ? 2 : 0;
      ar.game = null;
      if (win) { ar.tickets += win; sfxMissionPass(); showToast(`DING! ${win} ticket${win > 1 ? 's' : ''} (${ar.tickets} total)`); }
      else { sfxMissionFail(); showToast('The puck sulks halfway up. No tickets.'); }
      world.onSave?.();
    }
    return;
  }
  if (ar.game === 'claw') {
    ar.t += dt;
    const x = Math.sin(ar.t * 2.2) * 0.5 + 0.5;
    const n = Math.round(x * 20);
    world.arcadeHint = `CLAW MACHINE: [${' '.repeat(n)}🜃${' '.repeat(20 - n)}] prize at center — <b>E</b> drops`;
    if (pressed['KeyE']) {
      const off = Math.abs(x - 0.5);
      ar.game = null;
      if (off < 0.08 && Math.random() < 0.7) { ar.tickets += 8; sfxMissionPass(); showToast(`THE CLAW HOLDS ON — 8 tickets (${ar.tickets} total)`); }
      else { sfxMissionFail(); showToast('The claw opens over the chute out of pure spite.'); }
      world.onSave?.();
    }
    return;
  }

  // menu
  world.nearKiosk = true;
  world.arcadeHint = `PIXEL PALACE — ${ar.tickets} tickets · 1) HI-STRIKER $20 · 2) CLAW $30 · 3) redeem 50 tickets → $2000`;
  if (pressed['Digit1']) {
    if (world.money < 20) { showToast('Not enough quarters'); return; }
    world.money -= 20;
    ar.game = 'striker';
    ar.val = 0; ar.dir = 1;
    sfxPickup();
  } else if (pressed['Digit2']) {
    if (world.money < 30) { showToast('Not enough quarters'); return; }
    world.money -= 30;
    ar.game = 'claw';
    ar.t = 0;
    sfxPickup();
  } else if (pressed['Digit3']) {
    if (ar.tickets < 50) { showToast(`${ar.tickets}/50 tickets — the prize counter is unmoved`); return; }
    ar.tickets -= 50;
    world.money += 2000;
    sfxMissionPass();
    showMissionMsg('PRIZE COUNTER', '50 tickets → $2000. The economy of fun.', '#f05a9a');
    world.onSave?.();
  }
}
