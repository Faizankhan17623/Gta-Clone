import * as THREE from 'three';
import { blockStart, BLOCK, HALF, groundHeight } from './city.js';
import { showToast, showNews, showMissionMsg, setHint } from './hud.js';
import { sfxMissionPass, sfxMissionFail, sfxPickup } from './sound.js';
import { addRep } from './economy.js';
import { addSmoke } from './effects.js';
import { animateIdle } from './characters.js';

// Skydiving: a jump beacon on the Spire's lower deck (the BASE ring owns the
// tip, this owns the rail one tier down) arms freefall. Fall, pull the chute
// with SPACE, then steer onto one of three rotating drop-zone rings around
// town. Land outside all of them and it still counts, just no bonus.

const TERMINAL_VY = -32;
const CHUTE_VY = -6;

function ringMesh(color) {
  return new THREE.Mesh(
    new THREE.TorusGeometry(5, 0.4, 8, 26),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 })
  );
}

export function initSkydive(scene, world) {
  const bx = blockStart(2) + BLOCK / 2;
  const bz = blockStart(7) + BLOCK / 2;

  // launch pad: the mid tier of the Spire, opposite side from the BASE ring
  const padPos = new THREE.Vector3(bx, 130, bz - 6);
  const pad = new THREE.Mesh(
    new THREE.TorusGeometry(3.4, 0.3, 8, 20),
    new THREE.MeshBasicMaterial({ color: 0xffa030 })
  );
  pad.rotation.x = Math.PI / 2;
  pad.position.copy(padPos);
  scene.add(pad);

  // three drop zones scattered around the city, well clear of buildings
  const zoneDefs = [
    [-HALF + 60, -HALF + 60, 0xff5a4a],
    [HALF - 70, -HALF + 90, 0x4ad2ff],
    [-HALF + 90, HALF - 60, 0x7cf78c],
  ];
  const zones = zoneDefs.map(([x, z, color]) => {
    const ring = ringMesh(color);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, 1, z);
    scene.add(ring);
    return { pos: new THREE.Vector3(x, 0, z), ring, color, pay: 800 };
  });

  world.skydive = {
    padPos, pad, zones,
    on: false, chute: false, best: 0,
  };
}

export function updateSkydivePad(world, dt, pressed) {
  const sd = world.skydive;
  const player = world.player;
  world.skydiveHint = null;
  sd.pad.rotation.z += dt;
  for (const z of sd.zones) z.ring.rotation.z += dt * 0.6;

  if (sd.on) return; // mid-jump, the flight update owns the frame

  const onFoot = !player.inCar && !player.inHeli && !player.inBoat;
  const d = Math.hypot(player.pos.x - sd.padPos.x, player.pos.z - sd.padPos.z);
  const dy = Math.abs(player.pos.y - sd.padPos.y);
  if (onFoot && d < 4.5 && dy < 5) {
    world.skydiveHint = 'Press <b>E</b> to JUMP — freefall, then <b>SPACE</b> to pull the chute';
    if (pressed['KeyE']) startJump(world);
  }
}

// also callable while airborne in the plane — bailing out mid-flight
export function bailFromPlane(world) {
  const player = world.player;
  const plane = world.plane;
  if (!plane || player.pos.y < 20) return false;
  player.pos.copy(plane.pos);
  player.inPlane = null;
  player.mesh.visible = true;
  startJump(world, plane.vel?.clone());
  return true;
}

function startJump(world, initVel) {
  const player = world.player;
  const sd = world.skydive;
  sd.on = true;
  sd.chute = false;
  player.onGround = false;
  player.glide = false;
  player.vy = -2;
  if (initVel) player.vel.copy(initVel).multiplyScalar(0.6);
  else player.vel.set(0, 0, 0);
  sfxMissionPass();
  showToast('FREEFALL! SPACE to pull the chute');
  showNews('a tiny figure peels off the spire and starts falling with real conviction');
}

export function updateSkydive(world, dt, keys, pressed, camYaw) {
  const sd = world.skydive;
  const player = world.player;

  if (pressed['Space'] && !sd.chute) {
    sd.chute = true;
    sfxPickup();
    showToast('CHUTE OPEN');
  }

  const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
  let mx = 0, mz = 0;
  if (keys['KeyW']) { mx += fx; mz += fz; }
  if (keys['KeyS']) { mx -= fx; mz -= fz; }
  if (keys['KeyA']) { mx += fz; mz -= fx; }
  if (keys['KeyD']) { mx -= fz; mz += fx; }
  const m = Math.hypot(mx, mz);
  const steerSpd = sd.chute ? 9 : 5;
  const tx = m ? (mx / m) * steerSpd : 0;
  const tz = m ? (mz / m) * steerSpd : 0;
  player.vel.x += (tx - player.vel.x) * Math.min(1, 2.2 * dt);
  player.vel.z += (tz - player.vel.z) * Math.min(1, 2.2 * dt);

  const targetVy = sd.chute ? CHUTE_VY : TERMINAL_VY;
  player.vy += (targetVy - player.vy) * Math.min(1, (sd.chute ? 2.5 : 1.2) * dt);

  player.pos.x = Math.max(-HALF + 2, Math.min(HALF - 2, player.pos.x + player.vel.x * dt));
  player.pos.z = Math.max(-HALF + 2, Math.min(HALF - 2, player.pos.z + player.vel.z * dt));
  player.pos.y += player.vy * dt;

  if (m) player.heading = Math.atan2(player.vel.x, player.vel.z);
  player.mesh.rotation.y = player.heading;
  player.mesh.rotation.x = sd.chute ? 0 : -0.9;
  const flightY = player.pos.y;
  animateIdle(player.ch);
  player.pos.y = flightY;

  world.skydiveHint = sd.chute
    ? `CHUTE — steer onto a coloured ring · alt ${Math.round(player.pos.y)}m`
    : `FREEFALL — ${Math.round(player.pos.y)}m · <b>SPACE</b> to pull the chute`;

  // trailing smoke puffs read as speed even without a particle chute mesh
  if (Math.random() < dt * 6) addSmoke(player.pos.clone(), sd.chute ? 0.5 : 0.25);

  const g = groundHeight(player.pos, world.city.colliders, 0.3, player.pos.y);
  if (player.pos.y <= g + 0.1) {
    player.pos.y = g;
    player.vy = 0;
    player.onGround = true;
    player.mesh.rotation.x = 0;
    sd.on = false;
    world.skydiveHint = null;

    if (!sd.chute) {
      sfxMissionFail();
      showMissionMsg('SPLAT', 'Should have pulled the chute.', '#ff5a4a');
      player.health -= 40;
      return;
    }

    let landed = null;
    for (const z of sd.zones) {
      if (Math.hypot(player.pos.x - z.pos.x, player.pos.z - z.pos.z) < 5.5) { landed = z; break; }
    }
    if (landed) {
      world.money += landed.pay;
      addRep(world, 120);
      sd.best++;
      sfxMissionPass();
      showMissionMsg('BULLSEYE LANDING', `+$${landed.pay} — dead centre on the ring`, '#ffd24a');
      showNews('a parachute folds itself up on a painted ring like it planned the whole thing');
      world.onSave?.();
    } else {
      world.money += 150;
      showToast('Landed clear — +$150 (no ring bonus)');
    }
  }
}
