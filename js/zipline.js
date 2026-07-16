import * as THREE from 'three';
import { HALF } from './city.js';
import { showToast, showNews } from './hud.js';
import { sfxPickup, sfxMissionPass } from './sound.js';
import { addSmoke } from './effects.js';

// ZIPLINES: three rooftop-to-rooftop cables strung across the taller blocks.
// Walk up to the anchor, press E, and ride the wire down at speed — a quick
// alternative to web-swinging when you just want to cross the gap.

const LEN_MIN = 40;

function pickTall(colliders, usedKeys) {
  const tall = colliders.filter((c) => c.h > 24 && c.h < 60 && (c.x1 - c.x0) > 6 && !usedKeys.has(c));
  return tall[(Math.random() * tall.length) | 0];
}

export function initZipline(scene, world) {
  const colliders = world.city.colliders;
  const used = new Set();
  const lines = [];
  for (let i = 0; i < 3; i++) {
    const a = pickTall(colliders, used);
    if (!a) break;
    used.add(a);
    let best = null, bestD = 999;
    for (const b of colliders) {
      if (b === a || b.h < 12 || used.has(b)) continue;
      const ax = (a.x0 + a.x1) / 2, az = (a.z0 + a.z1) / 2;
      const bx = (b.x0 + b.x1) / 2, bz = (b.z0 + b.z1) / 2;
      const d = Math.hypot(ax - bx, az - bz);
      if (d > LEN_MIN && d < bestD) { bestD = d; best = b; }
    }
    if (!best) continue;
    used.add(best);
    const ax = (a.x0 + a.x1) / 2, az = (a.z0 + a.z1) / 2;
    const bx = (best.x0 + best.x1) / 2, bz = (best.z0 + best.z1) / 2;
    const top = new THREE.Vector3(ax, a.h + 0.3, az);
    const bottom = new THREE.Vector3(bx, best.h + 0.3, bz);
    if (top.y < bottom.y) { const tmp = top.clone(); top.copy(bottom); bottom.copy(tmp); }

    const geo = new THREE.BufferGeometry().setFromPoints([top, bottom]);
    const cable = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xc9c9d2 }));
    scene.add(cable);
    const anchor = new THREE.Mesh(
      new THREE.SphereGeometry(0.6, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffd24a })
    );
    anchor.position.copy(top);
    scene.add(anchor);

    lines.push({ top, bottom, cable, anchor, len: top.distanceTo(bottom) });
  }
  world.ziplines = { lines, riding: null };
}

export function updateZipline(world, dt, pressed) {
  const zl = world.ziplines;
  if (!zl) return;
  const player = world.player;
  world.ziplineHint = null;

  if (zl.riding) {
    const r = zl.riding;
    r.t = Math.min(1, r.t + dt * (r.speed / r.line.len));
    player.pos.lerpVectors(r.line.top, r.line.bottom, r.t);
    player.vy = 0;
    player.onGround = false;
    player.mesh.rotation.y = Math.atan2(r.line.bottom.x - r.line.top.x, r.line.bottom.z - r.line.top.z);
    if (Math.random() < dt * 8) addSmoke(player.pos.clone(), 0.2);
    world.ziplineHint = 'ZIPLINE — riding the wire';
    if (r.t >= 1) {
      zl.riding = null;
      player.onGround = false;
      player.vy = -2;
      sfxMissionPass();
      showToast('ZIPLINE — off the wire, watch the landing');
    }
    return;
  }

  const onFoot = !player.inCar && !player.inHeli && !player.inBoat;
  if (!onFoot) return;
  for (const line of zl.lines) {
    const d = Math.hypot(player.pos.x - line.top.x, player.pos.z - line.top.z);
    if (d < 4 && Math.abs(player.pos.y - line.top.y) < 5) {
      world.ziplineHint = 'Press <b>E</b> to grab the ZIPLINE';
      if (pressed['KeyE']) {
        zl.riding = { line, t: 0, speed: 26 };
        sfxPickup();
        showNews('a figure clips onto a rooftop cable and just... goes');
      }
      return;
    }
  }
}
