import * as THREE from 'three';
import { showToast } from './hud.js';
import { sfxPickup } from './sound.js';

// EXPRESS ELEVATORS: the three tallest towers in the city get a glowing
// service lift at street level. E rides to the roof; E again rides back
// down. Observation decks for people who'd rather not web-crawl.

export function initElevators(scene, world) {
  // find the three tallest building colliders, spaced apart
  const sorted = [...world.city.colliders].sort((a, b) => b.h - a.h);
  const picks = [];
  for (const c of sorted) {
    if (picks.length >= 3) break;
    if (c.h < 20) break;
    const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2;
    if (picks.some((p) => Math.hypot(p.cx - cx, p.cz - cz) < 120)) continue;
    picks.push({ c, cx, cz });
  }

  const lifts = [];
  for (const p of picks) {
    const pos = new THREE.Vector3(p.c.x0 - 1.6, 0, p.cz); // west face, street level
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.1, 0.18, 12),
      new THREE.MeshBasicMaterial({ color: 0xf0d24a, transparent: true, opacity: 0.65 })
    );
    pad.position.copy(pos).setY(0.1);
    scene.add(pad);
    const roofPad = pad.clone();
    roofPad.position.set(p.cx, p.c.h + 0.1, p.cz);
    scene.add(roofPad);
    lifts.push({ pos, roof: new THREE.Vector3(p.cx, p.c.h, p.cz), h: p.c.h });
  }
  world.elevators = { lifts, cd: 0 };
}

export function updateElevators(world, dt, pressed) {
  const el = world.elevators;
  if (!el) return;
  const player = world.player;
  world.liftHint = null;
  el.cd = Math.max(0, el.cd - dt);
  const onFoot = !player.inCar && !player.inHeli && !player.inBoat;
  if (!onFoot || el.cd > 0) return;

  for (const lift of el.lifts) {
    // street pad → roof
    if (player.pos.y < 3 && Math.hypot(player.pos.x - lift.pos.x, player.pos.z - lift.pos.z) < 2) {
      world.liftHint = `Press <b>E</b> — EXPRESS LIFT to the roof (${Math.round(lift.h)}m)`;
      if (pressed['KeyE']) {
        el.cd = 1;
        player.pos.set(lift.roof.x, lift.h + 0.2, lift.roof.z);
        player.vy = 0;
        sfxPickup();
        showToast('OBSERVATION DECK — the city holds still for you');
      }
      return;
    }
    // roof pad → street
    if (Math.abs(player.pos.y - lift.h) < 2 && Math.hypot(player.pos.x - lift.roof.x, player.pos.z - lift.roof.z) < 2) {
      world.liftHint = 'Press <b>E</b> — EXPRESS LIFT back to the street';
      if (pressed['KeyE']) {
        el.cd = 1;
        player.pos.set(lift.pos.x, 0.2, lift.pos.z);
        player.vy = 0;
        sfxPickup();
      }
      return;
    }
  }
}
