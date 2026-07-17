import * as THREE from 'three';
import { showToast } from './hud.js';
import { sfxWeb } from './sound.js';
import { addTracer } from './effects.js';

// WEB-PULL: press I to fire a heavy strand at the nearest car (or live
// target) in front of you and YANK it toward you. Cars slide, thugs
// stumble. Physics says you should move — the web disagrees.

const _dir = new THREE.Vector3();

export function initWebpull(world) {
  world.webpull = { cd: 0 };
}

export function updateWebpull(world, dt, pressed, camera) {
  const wp = world.webpull;
  if (!wp) return;
  wp.cd = Math.max(0, wp.cd - dt);
  const player = world.player;
  if (player.inCar || player.inHeli || player.inBoat) return;
  if (!pressed['KeyI'] || wp.cd > 0) return;

  camera.getWorldDirection(_dir);
  let best = null, bestScore = 0.5, bestKind = null;

  const consider = (pos, kind, obj) => {
    const dx = pos.x - player.pos.x, dz = pos.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 3 || d > 26) return;
    const dot = (dx / d) * _dir.x + (dz / d) * _dir.z; // roughly in front
    const score = dot - d * 0.015;
    if (dot > 0.6 && score > bestScore) { best = obj; bestScore = score; bestKind = kind; }
  };
  for (const group of [world.traffic, world.parked]) {
    for (const v of group) { if (!v.dead) consider(v.pos, 'car', v); }
  }
  for (const tg of world.targets) {
    if (!tg.dead && !tg.passive) consider(tg.pos, 'target', tg);
  }

  if (!best) { showToast('WEB-PULL: nothing in front to grab'); wp.cd = 0.4; return; }
  wp.cd = 2.2;
  sfxWeb();
  const pos = bestKind === 'car' ? best.pos : best.pos;
  addTracer(player.pos.clone().setY(player.pos.y + 1.6), pos.clone().setY(pos.y + 0.8));
  const dx = player.pos.x - pos.x, dz = player.pos.z - pos.z;
  const d = Math.hypot(dx, dz) || 1;
  if (bestKind === 'car') {
    best.vel.x += (dx / d) * 16;
    best.vel.z += (dz / d) * 16;
    showToast('WEB-PULL — the car comes to you');
  } else {
    best.web?.(); // stumbles anything webbable
    best.pos.x += (dx / d) * Math.min(6, d - 2);
    best.pos.z += (dz / d) * Math.min(6, d - 2);
    showToast('WEB-PULL — get over here');
  }
}
