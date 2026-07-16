import * as THREE from 'three';
import { HALF } from './city.js';
import { showToast, showNews, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxPickup } from './sound.js';
import { addRep } from './economy.js';

// DRONE COURIER: a charging pad near spawn rents out a delivery drone.
// Fly it FPV (the drone becomes the camera focus) from the pad to a
// blinking rooftop marker and back — the player's body stays put, hands on
// a controller. Pay per delivery, unlimited runs.

const PAY = 350;

export function initDrone(scene, world) {
  const padPos = world.city.spawn.clone().add(new THREE.Vector3(-14, 0, -30));
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 0.15, 16),
    new THREE.MeshStandardMaterial({ color: 0x2a3a4a, metalness: 0.5, roughness: 0.4 })
  );
  pad.position.copy(padPos).setY(0.08);
  scene.add(pad);

  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.5), new THREE.MeshStandardMaterial({ color: 0x1c2026, metalness: 0.6 }));
  g.add(body);
  const rotors = [];
  for (const [sx, sz] of [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), new THREE.MeshStandardMaterial({ color: 0x333 }));
    arm.rotation.z = Math.PI / 2;
    arm.position.set(sx * 0.6, 0, sz * 0.6);
    g.add(arm);
    const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 8), new THREE.MeshBasicMaterial({ color: 0x4ad2ff, transparent: true, opacity: 0.5 }));
    rotor.position.set(sx, 0.08, sz);
    g.add(rotor);
    rotors.push(rotor);
  }
  g.position.copy(padPos).setY(0.3);
  g.visible = false;
  scene.add(g);

  world.drone = { padPos, mesh: g, rotors, flying: false, pos: g.position, vel: new THREE.Vector3(), target: null, cooldownT: 0 };
}

function pickRoof(world) {
  const roofs = world.city.colliders.filter((c) => c.h > 8 && c.h < 40);
  const c = roofs[(Math.random() * roofs.length) | 0];
  return new THREE.Vector3((c.x0 + c.x1) / 2, c.h + 1.5, (c.z0 + c.z1) / 2);
}

export function updateDronePad(world, dt, pressed) {
  const dr = world.drone;
  if (!dr || dr.flying) return;
  const player = world.player;
  world.droneHint = null;
  dr.cooldownT = Math.max(0, dr.cooldownT - dt);
  const onFoot = !player.inCar && !player.inHeli && !player.inBoat;
  const d = Math.hypot(player.pos.x - dr.padPos.x, player.pos.z - dr.padPos.z);
  if (d < 3.4 && onFoot) {
    if (dr.cooldownT > 0) { world.droneHint = `DRONE PAD — recharging (${Math.ceil(dr.cooldownT)}s)`; return; }
    world.droneHint = `Press <b>E</b> to fly a DRONE DELIVERY — $${PAY} per run`;
    if (pressed['KeyE']) {
      dr.flying = true;
      dr.pos.copy(dr.padPos).setY(1.5);
      dr.vel.set(0, 0, 0);
      dr.mesh.visible = true;
      dr.target = pickRoof(world);
      dr.leg = 'out';
      showMissionMsg('DRONE DELIVERY', 'Fly it to the blinking rooftop marker', '#4ad2ff');
    }
  }
}

export function updateDrone(world, dt, keys, camYaw) {
  const dr = world.drone;
  if (!dr?.flying) return;
  for (const r of dr.rotors) r.rotation.y += dt * 40;

  const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
  let mx = 0, mz = 0;
  if (keys['KeyW']) { mx += fx; mz += fz; }
  if (keys['KeyS']) { mx -= fx; mz -= fz; }
  if (keys['KeyA']) { mx += fz; mz -= fx; }
  if (keys['KeyD']) { mx -= fz; mz += fx; }
  const m = Math.hypot(mx, mz);
  const tx = m ? (mx / m) * 20 : 0;
  const tz = m ? (mz / m) * 20 : 0;
  dr.vel.x += (tx - dr.vel.x) * Math.min(1, 3 * dt);
  dr.vel.z += (tz - dr.vel.z) * Math.min(1, 3 * dt);
  const targetVy = keys['Space'] ? 10 : keys['KeyC'] ? -10 : 0;
  dr.vel.y += (targetVy - dr.vel.y) * Math.min(1, 3 * dt);

  dr.pos.x = Math.max(-HALF + 2, Math.min(HALF - 2, dr.pos.x + dr.vel.x * dt));
  dr.pos.z = Math.max(-HALF + 2, Math.min(HALF - 2, dr.pos.z + dr.vel.z * dt));
  dr.pos.y = Math.max(1, Math.min(160, dr.pos.y + dr.vel.y * dt));
  dr.mesh.rotation.y = Math.atan2(dr.vel.x, dr.vel.z || 0.001);
  dr.mesh.rotation.z = -Math.max(-0.3, Math.min(0.3, dr.vel.x * 0.02));

  world.droneBlip = dr.target ? { x: dr.target.x, z: dr.target.z } : null;
  const leg = dr.leg === 'out' ? 'to drop-off' : 'back to base';
  world.droneHint = `DRONE — ${leg} · alt ${Math.round(dr.pos.y)}m`;

  const goal = dr.leg === 'out' ? dr.target : dr.padPos;
  const d = Math.hypot(dr.pos.x - goal.x, dr.pos.z - goal.z);
  const dy = Math.abs(dr.pos.y - (dr.leg === 'out' ? goal.y : 1.5));
  if (d < 3 && dy < 4) {
    if (dr.leg === 'out') {
      dr.leg = 'back';
      sfxPickup();
      showToast('PACKAGE DROPPED — fly it home');
    } else {
      dr.flying = false;
      dr.mesh.visible = false;
      dr.mesh.position.copy(dr.padPos);
      dr.cooldownT = 6;
      world.droneBlip = null;
      const pay = Math.round(PAY * (world.payMult || 1));
      world.money += pay;
      addRep(world, 40);
      if (world.stats) world.stats.droneRuns = (world.stats.droneRuns || 0) + 1;
      sfxMissionPass();
      showMissionMsg('DELIVERY COMPLETE', `+$${pay}`, '#4ad2ff');
      showNews('a small package lands on a rooftop nobody remembers ordering anything to');
      world.onSave?.();
    }
  }
}
