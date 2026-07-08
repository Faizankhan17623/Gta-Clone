import * as THREE from 'three';
import { HALF } from './city.js';
import { showToast, showNews } from './hud.js';
import { sfxMissionPass, sfxPickup } from './sound.js';
import { addRep } from './economy.js';

// Harbor vehicle exports: a fixer at the dock wants three rides a day.
// Park the wanted kind inside the cyan ring, step out, hold E — the crane
// takes it and you get paid. Finish the day's list for a bonus.

const WANTS = [
  { label: 'ANY CLEAN CAR', pay: 500, test: (v) => !v.bike && !v.police && !v.tank && !v.monster },
  { label: 'A MOTORBIKE', pay: 900, test: (v) => v.bike },
  { label: 'A POLICE CRUISER', pay: 1400, test: (v) => v.police },
];
const BONUS = 1000;

export function initExport(scene, world, save) {
  const pos = new THREE.Vector3(HALF - 12, 0, 44); // shore road by the piers
  const ring = new THREE.Mesh(
    new THREE.CylinderGeometry(5.5, 5.5, 0.5, 22, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x3dd2ff, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.position.copy(pos).setY(0.4);
  scene.add(ring);
  // crane: a mast and a jib reaching over the water
  const mat = new THREE.MeshStandardMaterial({ color: 0xd0a020, metalness: 0.5, roughness: 0.5 });
  const mast = new THREE.Mesh(new THREE.BoxGeometry(1.2, 18, 1.2), mat);
  mast.position.set(pos.x + 7, 9, pos.z);
  mast.castShadow = true;
  scene.add(mast);
  const jib = new THREE.Mesh(new THREE.BoxGeometry(16, 0.8, 0.8), mat);
  jib.position.set(pos.x + 12, 17.5, pos.z);
  scene.add(jib);
  world.city.colliders.push({ x0: pos.x + 6.4, z0: pos.z - 0.6, x1: pos.x + 7.6, z1: pos.z + 0.6, h: 18 });

  world.exportJob = {
    pos, ring,
    day: save.expDay ?? -1,
    idx: save.expIdx | 0,
    holdT: 0,
  };
}

export function updateExport(world, dt) {
  const ex = world.exportJob;
  const player = world.player;
  world.expHint = null;
  ex.ring.rotation.y += dt;

  // new in-game day, fresh list
  if (ex.day !== world.dailyDay) {
    ex.day = world.dailyDay;
    ex.idx = 0;
  }
  if (ex.idx >= WANTS.length) { ex.ring.visible = false; return; }
  ex.ring.visible = true;

  const want = WANTS[ex.idx];
  const d = Math.hypot(player.pos.x - ex.pos.x, player.pos.z - ex.pos.z);
  if (d > 26) { ex.holdT = 0; return; }

  const onFoot = !player.inCar && !player.inHeli && !player.inBoat;
  // the delivery: a matching vehicle parked in the ring, you on foot beside it
  let goods = null;
  for (const v of world.parked) {
    if (v.dead || !want.test(v)) continue;
    if (Math.hypot(v.pos.x - ex.pos.x, v.pos.z - ex.pos.z) < 5.5) { goods = v; break; }
  }

  if (!goods) {
    ex.holdT = 0;
    world.expHint = `EXPORT DOCK ${ex.idx + 1}/3 — they want <b>${want.label}</b> ($${want.pay}) — park it in the ring`;
    return;
  }
  if (!onFoot || d > 12) {
    ex.holdT = 0;
    world.expHint = 'Step away from the wheel — the crane takes it from here';
    return;
  }

  // hands-free: the crane hooks on once you're out and clear of the keys
  // (an E-hold here would fight the enter-vehicle key on the same car)
  ex.holdT += dt;
  world.expHint = `CRANE HOOKING ON... ${Math.ceil((1.5 - ex.holdT) * 10) / 10}s`;
  if (ex.holdT >= 1.5) {
    ex.holdT = 0;
    world.scene.remove(goods.mesh);
    const pi = world.parked.indexOf(goods);
    if (pi >= 0) world.parked.splice(pi, 1);
    world.money += want.pay;
    ex.idx++;
    sfxPickup();
    showToast(`EXPORTED! +$${want.pay}`);
    if (ex.idx >= WANTS.length) {
      world.money += BONUS;
      addRep(world, 300);
      sfxMissionPass();
      showToast(`DAY LIST DONE +$${BONUS} BONUS`);
      showNews('a freighter leaves the harbor riding suspiciously low');
    }
    world.onSave?.();
  }
}
