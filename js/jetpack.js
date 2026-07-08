import * as THREE from 'three';
import { resolveCircle, groundHeight } from './city.js';
import { showToast, showNews } from './hud.js';
import { sfxMissionPass } from './sound.js';
import { addSmoke } from './effects.js';
import { animateIdle } from './characters.js';

// The jetpack: sold from a little pad near spawn. J toggles it on foot —
// Space climbs, Shift drops, WASD strafes at speed. The third way to fly.

const COST = 5000;

export function initJetpack(scene, world, save) {
  const padPos = world.city.spawn.clone().add(new THREE.Vector3(30, 0, 10));
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 0.3, 14),
    new THREE.MeshStandardMaterial({ color: 0x2a3a55, metalness: 0.6, roughness: 0.4 })
  );
  pad.position.copy(padPos).setY(0.15);
  scene.add(pad);
  // the pack itself on a stand
  const tank = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.35, 0.8, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0xd07020, metalness: 0.7, roughness: 0.3 })
  );
  tank.position.copy(padPos).setY(1.2);
  scene.add(tank);
  world.jetpack = { owned: !!save.jet, on: false, padPos, tank, smokeT: 0 };
}

// kiosk + toggle — runs every frame from the main update loop
export function updateJetpackPad(world, dt, pressed) {
  const jp = world.jetpack;
  const player = world.player;
  world.jetHint = null;
  jp.tank.rotation.y += dt;

  const onFoot = !player.inCar && !player.inHeli && !player.inBoat;
  if (!jp.owned) {
    const d = Math.hypot(player.pos.x - jp.padPos.x, player.pos.z - jp.padPos.z);
    if (d < 3.4 && onFoot) {
      world.jetHint = `Press <b>E</b> to buy the JETPACK — $${COST} (J to fly, anywhere)`;
      if (pressed['KeyE']) {
        if (world.money < COST) { showToast('Not enough cash'); return; }
        world.money -= COST;
        jp.owned = true;
        jp.tank.visible = false;
        sfxMissionPass();
        showToast('JETPACK YOURS! Press J to fly');
        showNews('someone bought a military-surplus jetpack, entirely legally');
        world.onSave?.();
      }
    }
    return;
  }

  // J toggles flight while on foot — the ONLY place the switch flips,
  // so the flight update and this one can never fight over the same press
  if (pressed['KeyJ'] && onFoot) {
    jp.on = !jp.on;
    if (jp.on) {
      player.onGround = false;
      player.glide = false;
      player.vy = 3;
    }
  }
}

// flight physics — main calls this INSTEAD of updateOnFoot while jp.on
export function updateJetpack(world, dt, keys, pressed, camYaw) {
  const jp = world.jetpack;
  const player = world.player;

  const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
  let mx = 0, mz = 0;
  if (keys['KeyW']) { mx += fx; mz += fz; }
  if (keys['KeyS']) { mx -= fx; mz -= fz; }
  if (keys['KeyA']) { mx += fz; mz -= fx; }
  if (keys['KeyD']) { mx -= fz; mz += fx; }
  const m = Math.hypot(mx, mz);
  const spd = keys['ShiftLeft'] || keys['ShiftRight'] ? 30 : 22;
  const tx = m ? (mx / m) * spd : 0;
  const tz = m ? (mz / m) * spd : 0;
  player.vel.x += (tx - player.vel.x) * Math.min(1, 3.5 * dt);
  player.vel.z += (tz - player.vel.z) * Math.min(1, 3.5 * dt);

  // Space climbs, C drops fast; otherwise hover
  const targetVy = keys['Space'] ? 13 : keys['KeyC'] ? -13 : 0;
  player.vy += (targetVy - player.vy) * Math.min(1, 4 * dt);

  player.pos.x += player.vel.x * dt;
  player.pos.z += player.vel.z * dt;
  player.pos.y = Math.min(190, player.pos.y + player.vy * dt);
  resolveCircle(player.pos, 0.5, world.city.colliders, player.pos.y + 0.5);

  if (m) player.heading = Math.atan2(player.vel.x, player.vel.z);
  player.mesh.rotation.y = player.heading;
  player.mesh.rotation.x = -Math.min(0.5, Math.hypot(player.vel.x, player.vel.z) * 0.018);
  // animateIdle bobs the whole character group's y for its breathing sway —
  // at altitude that reads as teleporting to the ground, so pin y around it
  const flightY = player.pos.y;
  animateIdle(player.ch);
  player.pos.y = flightY;

  // exhaust
  jp.smokeT -= dt;
  if (jp.smokeT <= 0) {
    jp.smokeT = 0.06;
    addSmoke(player.pos.clone().add(new THREE.Vector3(0, 0.3, 0)), 0.35);
  }

  // touch down
  const g = groundHeight(player.pos, world.city.colliders, 0.3, player.pos.y);
  if (player.pos.y <= g + 0.05 && player.vy <= 0) {
    player.pos.y = g;
    player.vy = 0;
    player.onGround = true;
    player.mesh.rotation.x = 0;
    jp.on = false;
  }
}
