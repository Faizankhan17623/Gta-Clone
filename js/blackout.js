import * as THREE from 'three';
import { blockStart, N } from './city.js';
import { showToast, showNews, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxMissionFail } from './sound.js';
import { addChaos } from './economy.js';

// CITYWIDE BLACKOUT: a rotating event like the outbreak or the kaiju. The
// grid drops for ~3 minutes — every lit window and streetlight goes dark,
// crime spawns faster, cops are slower off the mark, and stores pay a
// looting bonus. Reach the substation and hold E to bring the power back
// for a reward. It ends on its own if you don't.

const DURATION = 180;
const CALM_MIN = 480;
const CALM_VAR = 420;
const REWARD = 3500;

export function initBlackout(scene, world) {
  const pos = new THREE.Vector3(blockStart(1) + 6, 0, blockStart(8) + 30);
  const hut = new THREE.Mesh(
    new THREE.BoxGeometry(5, 3.4, 4),
    new THREE.MeshStandardMaterial({ color: 0x394450, metalness: 0.4, roughness: 0.7 })
  );
  hut.position.copy(pos).setY(1.7);
  scene.add(hut);
  for (const s of [-1, 1]) {
    const pylon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.16, 6, 6),
      new THREE.MeshStandardMaterial({ color: 0x6a7076, metalness: 0.6 })
    );
    pylon.position.copy(pos).add(new THREE.Vector3(s * 3.2, 3, -1));
    scene.add(pylon);
  }
  const ring = new THREE.Mesh(
    new THREE.CylinderGeometry(2.4, 2.4, 0.5, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.position.copy(pos).setY(0.4);
  scene.add(ring);

  world.blackout = {
    substation: pos, ring,
    on: false, left: 0, t: CALM_MIN + Math.random() * CALM_VAR,
    prevWanted: 0, level: 0,
  };
}

export function forceBlackout(world) {
  const bo = world.blackout;
  if (bo && !bo.on) bo.t = 0;
}

function begin(world) {
  const bo = world.blackout;
  bo.on = true;
  bo.left = DURATION;
  bo.level = 0;
  sfxMissionFail();
  addChaos(world, 15);
  showMissionMsg('⚡ BLACKOUT', 'The grid is down. Get to the substation.', '#ffd24a');
  showNews('a cascading failure knocks out power across the city');
  if (world.stats) world.stats.blackouts = (world.stats.blackouts || 0) + 1;
}

function end(world, restored) {
  const bo = world.blackout;
  bo.on = false;
  bo.level = 0;
  bo.t = CALM_MIN + Math.random() * CALM_VAR;
  world.blackoutBlip = null;
  world.blackoutLoot = 0;
  if (restored) {
    world.money += REWARD;
    sfxMissionPass();
    showMissionMsg('POWER RESTORED', `+$${REWARD}`, '#7cf78c');
    showNews('power is restored to the grid');
    world.onSave?.();
  } else {
    showToast('The utility crews get the grid back online');
  }
}

export function updateBlackout(world, dt, pressed) {
  const bo = world.blackout;
  if (!bo) return;
  world.blackoutHint = null;

  if (!bo.on) {
    // make sure the modifiers other systems read are neutral between events
    world.blackoutLoot = 1;
    world.copSlowMul = 1;
    world.blackoutBlip = null;
    bo.t -= dt;
    if (bo.t <= 0) begin(world);
    return;
  }

  bo.left -= dt;
  // ramp the darkness in/out over 3s
  bo.level = Math.min(1, bo.level + dt / 3);
  if (bo.left < 3) bo.level = Math.max(0, bo.left / 3);

  // dim every night light source
  const city = world.city;
  const k = 1 - bo.level * 0.96;
  for (const m of city.windowMats) m.emissiveIntensity *= k;
  if (city.lampGlowMat) city.lampGlowMat.opacity *= k;
  if (city.bulbMat) city.bulbMat.emissiveIntensity *= k;
  if (city.district?.stats && bo.level > 0.5) {
    // district detail windows share windowMats already
  }

  // crime runs hotter, response is slower
  world.blackoutLoot = 1.5;      // storerob / shops can read this for a bonus
  world.copSlowMul = 0.6 + 0.4 * (1 - bo.level);

  const p = world.player.pos;
  const d = Math.hypot(p.x - bo.substation.x, p.z - bo.substation.z);
  world.blackoutBlip = { x: bo.substation.x, z: bo.substation.z };
  bo.ring.rotation.y += dt * 2;
  bo.ring.material.opacity = 0.25 + Math.sin(world.time * 5) * 0.12;

  const onFoot = !world.player.inCar && !world.player.inHeli && p.y < 3;
  if (onFoot && d < 3) {
    world.blackoutHint = 'SUBSTATION — hold <b>E</b> to restore power';
    if (pressed['KeyE']) end(world, true);
  } else {
    world.blackoutHint = `BLACKOUT — reach the substation · ${Math.ceil(bo.left)}s`;
  }

  if (bo.left <= 0) end(world, false);
}

// Cleared each frame if there is no blackout, so other systems can rely on it.
export function blackoutActive(world) {
  return !!world.blackout?.on;
}
