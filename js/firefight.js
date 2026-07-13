import * as THREE from 'three';
import { blockStart, BLOCK, HALF, pointBlocked } from './city.js';
import { makeVehicle } from './car.js';
import { showToast, showNews, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxCrash } from './sound.js';
import { addRep, addChaos } from './economy.js';
import { addSmoke, addFlash } from './effects.js';

// Firefighter: every so often the city catches fire — a dumpster, a stalled
// car, sometimes half a street. Engine 7 sits at the station with a working
// hose (hold F or the mouse from the cab). $400 a blaze, and the crowd
// remembers who showed up.

const FIRE_EVERY_MIN = 200;
const FIRE_EVERY_VAR = 200;
const FIRE_LIFE = 100;   // unattended fires burn out eventually
const DOUSE_PAY = 400;
const HOSE_RANGE = 16;

function makeFire(world, x, z) {
  const g = new THREE.Group();
  const cones = [];
  for (let i = 0; i < 3; i++) {
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.6 - i * 0.15, 1.6 + i * 0.5, 7),
      new THREE.MeshBasicMaterial({
        color: [0xff6a20, 0xffb020, 0xffe27a][i],
        transparent: true, opacity: 0.8 - i * 0.18,
      })
    );
    cone.position.y = 0.8 + i * 0.35;
    g.add(cone);
    cones.push(cone);
  }
  const light = new THREE.PointLight(0xff8030, 12, 14);
  light.position.y = 1.5;
  g.add(light);
  g.position.set(x, 0, z);
  world.scene.add(g);
  return { mesh: g, pos: g.position, cones, light, hp: 3, t: FIRE_LIFE, flick: Math.random() * 9 };
}

export function initFirefight(scene, world) {
  // Station 7: a red-doored garage on a probed corner, engine parked outside
  let sx = blockStart(4) + 3;
  let sz = blockStart(2) + 3;
  const probe = new THREE.Vector3(sx, 1, sz);
  if (pointBlocked(probe, world.city.colliders, 2)) { sx = blockStart(4) + 57; sz = blockStart(2) + 3; }
  const house = new THREE.Mesh(
    new THREE.BoxGeometry(6, 4, 5),
    new THREE.MeshLambertMaterial({ color: 0x8a2a22 })
  );
  house.position.set(sx, 2, sz);
  house.castShadow = true;
  scene.add(house);
  const c = document.createElement('canvas');
  c.width = 128; c.height = 40;
  const g = c.getContext('2d');
  g.fillStyle = '#5a1812'; g.fillRect(0, 0, 128, 40);
  g.fillStyle = '#ffd24a'; g.font = 'bold 18px Arial'; g.textAlign = 'center';
  g.fillText('STATION 7', 64, 26);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 1.2), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  sign.position.set(sx, 4.7, sz);
  scene.add(sign);

  world.firefight = {
    stationPos: new THREE.Vector3(sx, 0, sz),
    truck: spawnTruck(world, sx, sz),
    fires: [],
    eventT: 120 + Math.random() * FIRE_EVERY_VAR,
    respawnT: 0,
    doused: 0,
  };
}

function spawnTruck(world, sx, sz) {
  const truck = makeVehicle(world.scene, sx + 7, sz + 2, 0, '#c1121f', { health: 300, accel: 15, top: 34 });
  const tank = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 0.9, 3.2, 12),
    new THREE.MeshStandardMaterial({ color: 0xd8d8cc, metalness: 0.5, roughness: 0.4 })
  );
  tank.rotation.x = Math.PI / 2;
  tank.position.set(0, 1.6, -0.6);
  truck.mesh.add(tank);
  const ladder = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.14, 3.4),
    new THREE.MeshLambertMaterial({ color: 0xb8bec8 })
  );
  ladder.position.set(0, 2.25, -0.6);
  truck.mesh.add(ladder);
  truck.fireTruck = true;
  return truck;
}

export function forceFireEvent(world) {
  const ff = world.firefight;
  if (ff) ff.eventT = 0.1;
}

function igniteEvent(world) {
  const ff = world.firefight;
  const player = world.player;
  const big = Math.random() < 0.25;
  const count = big ? 6 : 2 + ((Math.random() * 2) | 0);
  // a cluster within reach of the player, on open ground
  const cx = Math.max(-HALF + 20, Math.min(HALF - 20, player.pos.x + (Math.random() - 0.5) * 160));
  const cz = Math.max(-HALF + 20, Math.min(HALF - 20, player.pos.z + (Math.random() - 0.5) * 160));
  const probe = new THREE.Vector3();
  let placed = 0;
  for (let i = 0; i < count * 14 && placed < count; i++) {
    // widen the search as attempts fail — a fire always finds fuel
    const spread = (big ? 40 : 16) + Math.floor(i / count) * 10;
    const x = Math.max(-HALF + 10, Math.min(HALF - 10, cx + (Math.random() - 0.5) * spread));
    const z = Math.max(-HALF + 10, Math.min(HALF - 10, cz + (Math.random() - 0.5) * spread));
    probe.set(x, 1, z);
    if (pointBlocked(probe, world.city.colliders, 0.8)) continue;
    ff.fires.push(makeFire(world, x, z));
    placed++;
  }
  if (!placed) return;
  addChaos(world, big ? 25 : 10);
  sfxCrash(10);
  if (big) {
    showMissionMsg('🔥 DOWNTOWN BLAZE', 'Half a street is burning. Engine 7 is at Station 7 — or improvise.', '#ff6a20');
    showNews('DOWNTOWN BLAZE — residents form a bucket line, optimistically');
  } else {
    showToast('🔥 FIRE REPORTED — check the map');
    showNews('smoke over the grid — the fire department is "en route", allegedly');
  }
}

const _fv = new THREE.Vector3();

export function updateFirefight(world, dt) {
  const ff = world.firefight;
  if (!ff) return;
  const player = world.player;
  world.fireHint = null;
  world.fireBlip = null;

  // truck respawn if wrecked
  if (ff.truck?.dead) {
    ff.respawnT += dt;
    if (ff.respawnT > 30) {
      ff.respawnT = 0;
      world.scene.remove(ff.truck.mesh);
      ff.truck = spawnTruck(world, ff.stationPos.x, ff.stationPos.z);
      showNews('Station 7 rolls out a replacement engine, dents included');
    }
  }

  // new fires now and then
  if (ff.fires.length === 0) {
    ff.eventT -= dt;
    if (ff.eventT <= 0) {
      ff.eventT = FIRE_EVERY_MIN + Math.random() * FIRE_EVERY_VAR;
      igniteEvent(world);
    }
  }

  if (!ff.fires.length) return;

  // hose: from the cab of the engine, hold F (or fire button)
  const inTruck = player.inCar === ff.truck && !ff.truck.dead;
  const spraying = inTruck && (world._hose || false);
  const heading = ff.truck?.heading ?? 0;
  _fv.set(Math.sin(heading), 0, Math.cos(heading));
  if (spraying) {
    for (let i = 0; i < 2; i++) {
      addSmoke(new THREE.Vector3(
        ff.truck.pos.x + _fv.x * (4 + i * 5) + (Math.random() - 0.5) * 2,
        1.5 + i * 0.5,
        ff.truck.pos.z + _fv.z * (4 + i * 5) + (Math.random() - 0.5) * 2
      ), 0.5);
    }
  }

  // nearest fire drives the blip
  let nearest = null;
  let nearestD = Infinity;
  const focus = player.inCar ? player.inCar.pos : player.pos;

  for (let i = ff.fires.length - 1; i >= 0; i--) {
    const f = ff.fires[i];
    f.t -= dt;
    f.flick += dt * 9;
    for (let k = 0; k < f.cones.length; k++) {
      f.cones[k].scale.setScalar(0.8 + Math.sin(f.flick + k * 2) * 0.25);
    }
    f.light.intensity = 10 + Math.sin(f.flick * 1.3) * 4;
    if (Math.random() < dt * 2) addSmoke(f.pos.clone().setY(2.2), 0.8);

    const d = Math.hypot(f.pos.x - focus.x, f.pos.z - focus.z);
    if (d < nearestD) { nearestD = d; nearest = f; }

    // it burns
    if (!player.inCar && !player.inHeli && player.pos.y < 3 &&
        Math.hypot(f.pos.x - player.pos.x, f.pos.z - player.pos.z) < 2.6) {
      player.health -= 12 * dt;
      world.damageFlash = Math.min(1, (world.damageFlash || 0) + dt * 2);
    }
    if (Math.random() < dt * 0.5) world.lastShot = { pos: f.pos.clone(), t: world.time }; // peds scatter

    // dousing: in the hose cone, or improvised splashing on foot right beside it
    let dousing = false;
    if (spraying) {
      const dx = f.pos.x - ff.truck.pos.x;
      const dz = f.pos.z - ff.truck.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < HOSE_RANGE && (dx * _fv.x + dz * _fv.z) / (dist || 1) > 0.55) dousing = true;
    }
    if (dousing) {
      f.hp -= dt;
      addSmoke(f.pos.clone().setY(1.2), 1.2); // steam
      if (f.hp <= 0) {
        world.scene.remove(f.mesh);
        ff.fires.splice(i, 1);
        ff.doused++;
        const pay = Math.round(DOUSE_PAY * (world.payMult || 1));
        world.money += pay;
        addRep(world, 100);
        if (world.stats) world.stats.firesOut = (world.stats.firesOut || 0) + 1;
        sfxMissionPass();
        showToast(`🧯 FIRE OUT +$${pay}${ff.fires.length ? ` — ${ff.fires.length} still burning` : ''}`);
        if (!ff.fires.length) showNews('Engine 7 rolls home; someone hoses the hero down with applause');
        world.onSave?.();
        continue;
      }
    }

    if (f.t <= 0) {
      world.scene.remove(f.mesh);
      ff.fires.splice(i, 1);
      addChaos(world, 8);
      showNews('another blaze burns itself out — the insurance industry sighs');
    }
  }

  if (nearest) {
    world.fireBlip = { x: nearest.pos.x, z: nearest.pos.z };
    if (inTruck) {
      world.fireHint = `🔥 ${ff.fires.length} fire${ff.fires.length > 1 ? 's' : ''} — hold <b>F</b> to run the hose`;
    } else if (nearestD < 60) {
      world.fireHint = `🔥 FIRE ${Math.round(nearestD)}m — Engine 7 is at STATION 7`;
    }
  }
}
