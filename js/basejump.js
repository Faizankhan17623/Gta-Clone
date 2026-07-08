import * as THREE from 'three';
import { blockStart, BLOCK } from './city.js';
import { showToast, showNews } from './hud.js';
import { sfxMissionPass, sfxPickup, sfxMissionFail } from './sound.js';
import { addRep } from './economy.js';

// BASE trial: a glowing ring floats over the Spire's tip. Touch it, leap,
// and thread the five rings on the way down. $200 a ring, big bonus for all
// five. Getting up there is your problem — webs, heli or jetpack.

export function initBaseJump(scene, world) {
  const bx = blockStart(2) + BLOCK / 2;
  const bz = blockStart(7) + BLOCK / 2;

  const ringGeo = new THREE.TorusGeometry(4, 0.35, 8, 24);
  const startMat = new THREE.MeshBasicMaterial({ color: 0x7cf78c });
  const start = new THREE.Mesh(ringGeo, startMat);
  start.rotation.x = Math.PI / 2;
  start.position.set(bx, 153, bz);
  scene.add(start);

  // an arc of rings falling away from the tower toward the street
  const drops = [
    [14, 122, 6], [30, 92, 14], [48, 62, 24], [66, 34, 34], [84, 10, 44],
  ];
  const rings = drops.map(([dx, y, dz], i) => {
    const m = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color: 0x4ad2ff, transparent: true, opacity: 0.85 })
    );
    m.rotation.x = Math.PI / 2;
    m.position.set(bx + dx, y, bz + dz);
    scene.add(m);
    return m;
  });

  world.baseJump = { start, rings, active: false, idx: 0, got: 0, best: 0 };
}

function reset(world) {
  const bj = world.baseJump;
  bj.active = false;
  bj.idx = 0;
  bj.got = 0;
  for (const r of bj.rings) r.material.color.setHex(0x4ad2ff);
}

export function updateBaseJump(world, dt) {
  const bj = world.baseJump;
  const player = world.player;
  const p = player.pos;
  bj.start.rotation.z += dt;

  if (!bj.active) {
    // touch the green ring at the very top, on foot, to arm the trial
    if (!player.inCar && !player.inHeli && !player.inBoat &&
        Math.abs(p.y - bj.start.position.y) < 4 &&
        Math.hypot(p.x - bj.start.position.x, p.z - bj.start.position.z) < 5) {
      bj.active = true;
      bj.idx = 0;
      bj.got = 0;
      sfxMissionPass();
      showToast('BASE TRIAL! Thread the blue rings on the way down');
      showNews('a figure steps off the spire on purpose');
    }
    return;
  }

  // vehicles void the trial — this is a body-and-webs event
  if (player.inHeli || player.inCar || player.inBoat) { reset(world); return; }

  const next = bj.rings[bj.idx];
  if (next) {
    next.rotation.z += dt * 3;
    const s = 1 + Math.sin(world.time * 6) * 0.08;
    next.scale.setScalar(s);
    if (Math.abs(p.y - next.position.y) < 4 &&
        Math.hypot(p.x - next.position.x, p.z - next.position.z) < 5) {
      next.material.color.setHex(0x7cf78c);
      next.scale.setScalar(1);
      bj.idx++;
      bj.got++;
      world.money += 200;
      sfxPickup();
      showToast(`RING ${bj.got}/5 +$200`);
    }
  }

  // trial ends when you're back on the ground (or in the drink)
  if (player.onGround || player.swim || p.y < 1.5) {
    if (bj.got === 5) {
      world.money += 2000;
      addRep(world, 300);
      sfxMissionPass();
      showToast('PERFECT LINE! +$2000 BONUS');
      showNews('all five rings threaded in a single jump from the spire');
      world.onSave?.();
    } else if (bj.got > 0) {
      showToast(`Trial over — ${bj.got}/5 rings`);
    } else {
      sfxMissionFail();
      showToast('Trial over — not a single ring, ouch');
    }
    if (bj.got > bj.best) bj.best = bj.got;
    reset(world);
  }
}
