import * as THREE from 'three';
import { blockStart, pointBlocked } from './city.js';
import { showToast, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxMissionFail, sfxPickup } from './sound.js';

// PAYPHONES: five booths still standing in a city that forgot them. Every
// so often one rings — answer it and a voice offers quick courier work,
// with a streak bonus for every delivery you don't blow.

const SPOTS = [[1, 1], [1, 7], [7, 1], [7, 7], [4, 4]];

export function initPayphones(scene, world, save) {
  const booths = [];
  for (const [bi, bj] of SPOTS) {
    let pos = new THREE.Vector3(blockStart(bi) + 12, 0, blockStart(bj) - 2.5);
    const probe = new THREE.Vector3(pos.x, 1, pos.z);
    if (pointBlocked(probe, world.city.colliders, 1.2)) pos = new THREE.Vector3(blockStart(bi) + 22, 0, blockStart(bj) - 2.5);

    const booth = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 2.4, 1.1),
      new THREE.MeshStandardMaterial({ color: 0x35528a, metalness: 0.3, roughness: 0.55, transparent: true, opacity: 0.92 })
    );
    booth.position.copy(pos).setY(1.2);
    scene.add(booth);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.25, 1.2), new THREE.MeshBasicMaterial({ color: 0x223355 }));
    lamp.position.copy(pos).setY(2.5);
    scene.add(lamp);
    booths.push({ pos, lamp });
  }
  world.payphone = {
    booths, ringT: 0, nextRing: 25 + Math.random() * 40, ringing: -1,
    job: null, streak: save?.phoneStreak ?? 0,
  };
}

export function endPhoneJob(world) {
  const pp = world.payphone;
  if (!pp?.job) return;
  pp.job = null;
  pp.streak = 0;
  world.phoneHint = null;
  world.phoneBlip = null;
}

export function updatePayphones(world, dt, pressed) {
  const pp = world.payphone;
  if (!pp) return;
  const player = world.player;
  world.phoneHint = null;
  world.phoneBlip = null;

  // live delivery run
  if (pp.job) {
    const j = pp.job;
    j.t -= dt;
    const dest = pp.booths[j.dest];
    world.phoneBlip = { x: dest.pos.x, z: dest.pos.z };
    if (j.t <= 0) {
      sfxMissionFail();
      showToast('COURIER JOB BLOWN — the voice hangs up on your streak');
      pp.job = null;
      pp.streak = 0;
      world.onSave?.();
      return;
    }
    const d = Math.hypot(player.pos.x - dest.pos.x, player.pos.z - dest.pos.z);
    world.phoneHint = `COURIER: drop the envelope at the marked booth — <b>${Math.ceil(j.t)}s</b>`;
    if (d < 3 && !player.inCar) {
      world.phoneHint = 'Press <b>E</b> to drop the envelope';
      if (pressed['KeyE']) {
        const pay = 250 + pp.streak * 150;
        world.money += pay;
        pp.streak = Math.min(6, pp.streak + 1);
        sfxMissionPass();
        showMissionMsg('DELIVERED', `+$${pay} · streak x${pp.streak}`, '#7cd0f7');
        pp.job = null;
        world.onSave?.();
      }
    }
    return;
  }

  // the city dials at random
  if (pp.ringing < 0) {
    pp.nextRing -= dt;
    if (pp.nextRing <= 0) {
      pp.ringing = Math.floor(Math.random() * pp.booths.length);
      pp.ringT = 35;
    }
  } else {
    pp.ringT -= dt;
    const booth = pp.booths[pp.ringing];
    booth.lamp.material.color.set(Math.floor(performance.now() * 0.004) % 2 ? 0x7cd0f7 : 0x223355);
    if (pp.ringT <= 0) {
      booth.lamp.material.color.set(0x223355);
      pp.ringing = -1;
      pp.nextRing = 40 + Math.random() * 50;
      return;
    }
    world.phoneBlip = { x: booth.pos.x, z: booth.pos.z };
    const d = Math.hypot(player.pos.x - booth.pos.x, player.pos.z - booth.pos.z);
    if (d < 60) world.phoneHint = 'A PAYPHONE is ringing nearby…';
    if (d < 3 && !player.inCar) {
      world.phoneHint = 'Press <b>E</b> to answer the payphone';
      if (pressed['KeyE']) {
        booth.lamp.material.color.set(0x223355);
        let dest = Math.floor(Math.random() * pp.booths.length);
        if (dest === pp.ringing) dest = (dest + 1) % pp.booths.length;
        pp.job = { dest, t: 65 };
        pp.ringing = -1;
        pp.nextRing = 50 + Math.random() * 50;
        sfxPickup();
        showMissionMsg('THE VOICE', 'No names. Envelope under the shelf. Marked booth. Go.', '#7cd0f7');
      }
    }
  }
}
