import * as THREE from 'three';
import { blockStart, BLOCK, N } from './city.js';
import { showToast, showNews } from './hud.js';
import { sfxMissionPass, sfxMissionFail, sfxPickup } from './sound.js';
import { addRep } from './economy.js';

// Paramedic work: every few minutes someone collapses on a sidewalk.
// Drive up, load them (E), and race the clock to CITY HOSPITAL.

const REWARD = 600;
const RESCUE_TIME = 100;

function sidewalkPoint() {
  const sx = blockStart((Math.random() * N) | 0);
  const sz = blockStart((Math.random() * N) | 0);
  const t = Math.random() * (BLOCK - 4) + 2;
  return (Math.random() < 0.5)
    ? new THREE.Vector3(sx + t, 0, sz + (Math.random() < 0.5 ? 2 : BLOCK - 2))
    : new THREE.Vector3(sx + (Math.random() < 0.5 ? 2 : BLOCK - 2), 0, sz + t);
}

export function initAmbulance(scene, world) {
  // CITY HOSPITAL: white box + red cross on a block corner
  const hx = blockStart(3) + 5;
  const hz = blockStart(3) + 5;
  const bldg = new THREE.Mesh(
    new THREE.BoxGeometry(6, 5, 6),
    new THREE.MeshStandardMaterial({ color: 0xe8e8e2, metalness: 0.05, roughness: 0.8 })
  );
  bldg.position.set(hx, 2.5, hz);
  bldg.castShadow = true;
  scene.add(bldg);
  const crossMat = new THREE.MeshBasicMaterial({ color: 0xe03030 });
  const barV = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2, 0.15), crossMat);
  barV.position.set(hx, 4, hz + 3.08);
  scene.add(barV);
  const barH = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 0.15), crossMat);
  barH.position.set(hx, 4, hz + 3.08);
  scene.add(barH);
  world.city.colliders.push({ x0: hx - 3, z0: hz - 3, x1: hx + 3, z1: hz + 3, h: 5.2 });

  const ring = new THREE.Mesh(
    new THREE.CylinderGeometry(4, 4, 0.5, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xff6a6a, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.position.set(hx, 0.4, hz + 8);
  scene.add(ring);

  // the patient: a poor soul lying flat, plus a beacon
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.32, 1.7),
    new THREE.MeshLambertMaterial({ color: 0x9a6a4a })
  );
  body.visible = false;
  scene.add(body);
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.9, 30, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xff8a8a, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })
  );
  beacon.visible = false;
  scene.add(beacon);

  world.medic = {
    hospital: new THREE.Vector3(hx, 0, hz + 8),
    ring, body, beacon,
    spawnT: 70 + Math.random() * 90,
    active: false, loaded: false, t: 0,
    pos: new THREE.Vector3(),
  };
}

export function updateAmbulance(world, dt, keys, pressed) {
  const md = world.medic;
  const player = world.player;
  world.medHint = null;
  md.ring.rotation.y += dt;

  if (!md.active) {
    md.spawnT -= dt;
    if (md.spawnT <= 0) {
      md.pos.copy(sidewalkPoint());
      md.body.position.copy(md.pos).setY(0.18);
      md.body.rotation.y = Math.random() * Math.PI;
      md.body.visible = true;
      md.beacon.position.copy(md.pos).setY(15);
      md.beacon.visible = true;
      md.active = true;
      md.loaded = false;
      md.t = RESCUE_TIME;
      showToast('🚑 Someone collapsed — get them to CITY HOSPITAL!');
      showNews('a pedestrian is down — bystanders call for any driver');
    }
    return;
  }

  md.t -= dt;
  if (md.t <= 0) {
    md.active = false;
    md.body.visible = false;
    md.beacon.visible = false;
    sfxMissionFail();
    showNews('the collapsed pedestrian did not make it');
    md.spawnT = 120 + Math.random() * 120;
    return;
  }

  if (!md.loaded) {
    world.medBlip = { x: md.pos.x, z: md.pos.z };
    const car = player.inCar;
    // pull up beside them and they're helped straight in — E would fight the
    // exit-vehicle key, so loading is on proximity
    if (car && !car.dead && Math.hypot(car.pos.x - md.pos.x, car.pos.z - md.pos.z) < 5) {
      md.loaded = true;
      md.body.visible = false;
      md.beacon.visible = false;
      sfxPickup();
      showToast('PATIENT ABOARD — to the hospital, gently!');
    }
    return;
  }

  world.medBlip = { x: md.hospital.x, z: md.hospital.z };
  world.medHint = `PATIENT ABOARD — hospital ring · <b>${Math.ceil(md.t)}s</b>`;
  const car = player.inCar;
  if (!car) { world.medHint = 'Get back in a car — the patient needs you!'; return; }
  if (car.dead) {
    md.active = false;
    world.medBlip = null;
    sfxMissionFail();
    showToast('The ride is wrecked — patient lost');
    md.spawnT = 120 + Math.random() * 120;
    return;
  }
  if (Math.hypot(car.pos.x - md.hospital.x, car.pos.z - md.hospital.z) < 6) {
    md.active = false;
    world.medBlip = null;
    world.money += REWARD;
    addRep(world, 150);
    if (world.stats) world.stats.rescues = (world.stats.rescues || 0) + 1;
    sfxMissionPass();
    showToast(`PATIENT DELIVERED +$${REWARD}`);
    showNews('a stranger drives a collapsed pedestrian to safety');
    md.spawnT = 130 + Math.random() * 140;
    world.onSave?.();
  }
}
