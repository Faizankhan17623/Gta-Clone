import * as THREE from 'three';
import { HALF, pointBlocked, groundHeight } from './city.js';
import { WATER_X0, WATER_X1, WATER_Z, WATER_Y, inWater } from './water.js';
import { showToast, showNews, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxCrash } from './sound.js';
import { engine, setEngine } from './sound.js';
import { addRep, addChaos } from './economy.js';
import { addExplosion, addSmoke, addFlash } from './effects.js';

// The seaplane: a battered old floatplane tied up at the piers. W/S throttle,
// A/D bank, SPACE climbs once you have airspeed, SHIFT dives. Land on water
// only — the city is made of things that disagree with propellers. The
// hangar shack pays for night-and-day smuggling runs out past the shipping
// lane.

const MAX_SPEED = 46;
const TAKEOFF_SPEED = 16;
const SMUGGLE_PAY = 2000;
const DOCK = new THREE.Vector3(WATER_X0 + 26, WATER_Y + 0.55, 12);

function makePlaneMesh() {
  const g = new THREE.Group();
  const mat = (c, m = 0.4) => new THREE.MeshStandardMaterial({ color: c, metalness: m, roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.5, 6.4, 10), mat('#c9b458'));
  body.rotation.x = Math.PI / 2;
  body.position.y = 1.5;
  g.add(body);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.16, 1.7), mat('#b23434'));
  wing.position.set(0, 2.2, 0.4);
  g.add(wing);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.14, 1), mat('#b23434'));
  tail.position.set(0, 1.9, -3);
  g.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.2, 1), mat('#b23434'));
  fin.position.set(0, 2.3, -3.1);
  g.add(fin);
  const prop = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.22, 0.08), mat('#23262d', 0.7));
  prop.position.set(0, 1.5, 3.3);
  g.add(prop);
  for (const s of [-1, 1]) {
    const float = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 4.6, 8), mat('#d8d8cc', 0.2));
    float.rotation.x = Math.PI / 2;
    float.position.set(s * 1.15, 0.3, 0.4);
    g.add(float);
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1, 0.1), mat('#23262d'));
    strut.position.set(s * 1.0, 0.9, 0.4);
    g.add(strut);
  }
  return { group: g, prop };
}

function spawnPlane(world) {
  const { group, prop } = makePlaneMesh();
  group.position.copy(DOCK);
  world.scene.add(group);
  const plane = {
    mesh: group, prop,
    pos: group.position,
    vel: new THREE.Vector3(),
    heading: Math.PI / 2, // nose out to sea
    speed: 0,
    vy: 0,
    health: 100,
    dead: false,
  };
  group.rotation.y = plane.heading;
  return plane;
}

export function initPlane(scene, world) {
  world.plane = spawnPlane(world);
  world.planeRespawnT = 0;

  // hangar shack on the shore by the dock
  const shack = new THREE.Mesh(
    new THREE.BoxGeometry(4, 3, 3),
    new THREE.MeshLambertMaterial({ color: 0x4a5058 })
  );
  const shackPos = new THREE.Vector3(WATER_X0 - 4, 1.5, 12);
  shack.position.copy(shackPos);
  shack.castShadow = true;
  scene.add(shack);
  const c = document.createElement('canvas');
  c.width = 160; c.height = 48;
  const g = c.getContext('2d');
  g.fillStyle = '#101820'; g.fillRect(0, 0, 160, 48);
  g.fillStyle = '#c9b458'; g.font = 'bold 18px Arial'; g.textAlign = 'center';
  g.fillText('GULL AIR', 80, 20);
  g.font = 'bold 11px Arial'; g.fillStyle = '#8fd0ff';
  g.fillText('"freight, no manifests"', 80, 38);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.95), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  sign.position.copy(shackPos).setY(3.4);
  sign.rotation.y = Math.PI / 2;
  scene.add(sign);

  // the drop point: a smoke pillar out past the shipping lane
  const markerPos = new THREE.Vector3(WATER_X0 + 185, 0, -220);
  world.smuggle = { active: false, dropped: false, cooldownT: 0, markerPos, shackPos, smokeT: 0 };
}

// board from the water, a boat alongside, or a long jump off the pier
export function tryBoardPlane(world, pressed) {
  const p = world.plane;
  const player = world.player;
  if (!p || p.dead || player.inPlane || player.inCar || player.inHeli) return false;
  const d = Math.hypot(p.pos.x - player.pos.x, p.pos.z - player.pos.z);
  if (d > 6 || Math.abs(player.pos.y - p.pos.y) > 4) return false;
  world.planeHintNear = true;
  if (!pressed['KeyE']) return false;
  if (player.inBoat) { player.inBoat.vel.set(0, 0, 0); player.inBoat = null; }
  player.swim = false;
  player.inPlane = p;
  player.mesh.visible = false;
  engine.start();
  showToast('SEAPLANE — W throttle · SPACE climb (needs speed) · water landings only');
  return true;
}

function crash(world, why) {
  const p = world.plane;
  p.dead = true;
  addExplosion(p.pos.clone());
  addExplosion(p.pos.clone().add(new THREE.Vector3(2, 1, -1)));
  world.shake = 0.5;
  sfxCrash(18);
  const player = world.player;
  if (player.inPlane === p) {
    player.inPlane = null;
    player.mesh.visible = true;
    player.pos.set(p.pos.x + 3, Math.max(2, p.pos.y), p.pos.z + 3);
    player.vel.set(0, 0, 0);
    player.vy = -1;
    player.glide = true; // instinct deploys the web-chute
    player.health -= 35;
    engine.stop();
  }
  world.scene.remove(p.mesh);
  world.planeRespawnT = 25;
  showNews(why);
  if (world.smuggle.active) {
    world.smuggle.active = false;
    world.smuggle.cooldownT = 30;
  }
}

const _pv = new THREE.Vector3();

export function updatePlaneFlight(world, dt, keys, pressed) {
  const p = world.plane;
  const player = world.player;

  // throttle & steering
  if (keys['KeyW']) p.speed = Math.min(MAX_SPEED, p.speed + 11 * dt);
  if (keys['KeyS']) p.speed = Math.max(0, p.speed - 15 * dt);
  const turn = (keys['KeyA'] ? 1 : 0) - (keys['KeyD'] ? 1 : 0);
  p.heading += turn * 1.15 * Math.min(1, p.speed / 16) * dt;

  // climb wants airspeed; without it the old girl sinks politely
  const floating = p.pos.y <= WATER_Y + 0.6;
  let targetVy = p.speed > 20 ? 0 : -4;
  if (keys['Space'] && p.speed > TAKEOFF_SPEED) targetVy = 9.5;
  else if (keys['ShiftLeft'] || keys['ShiftRight']) targetVy = -9;
  p.vy += (targetVy - p.vy) * Math.min(1, 2.4 * dt);
  if (floating && p.vy < 0) p.vy = 0;
  if (floating && p.speed > 1) p.speed *= 1 - 0.12 * dt; // water drag

  _pv.set(Math.sin(p.heading), 0, Math.cos(p.heading));
  p.pos.addScaledVector(_pv, p.speed * dt);
  p.pos.y += p.vy * dt;
  p.vel.set(_pv.x * p.speed, p.vy, _pv.z * p.speed);

  // flight envelope: the whole map plus the open water
  p.pos.x = Math.max(-HALF + 8, Math.min(WATER_X1 - 6, p.pos.x));
  p.pos.z = Math.max(-WATER_Z + 6, Math.min(WATER_Z - 6, p.pos.z));
  p.pos.y = Math.min(120, p.pos.y);

  player.pos.copy(p.pos); // keep systems that read the on-foot position honest

  const overWater = inWater(p.pos.x, p.pos.z);
  if (p.pos.y <= WATER_Y + 0.55) {
    if (!overWater) { crash(world, 'a seaplane discovers the shoreline the hard way'); return; }
    if (p.vy < -7) { p.health -= 25; sfxCrash(12); world.shake = 0.3; showToast('HARD SPLASHDOWN'); }
    p.pos.y = WATER_Y + 0.55;
    p.vy = 0;
  } else if (!overWater) {
    // over the city: respect the skyline
    const g = groundHeight(p.pos, world.city.colliders, 0.4, p.pos.y + 2);
    if (p.pos.y < g + 1.2 || pointBlocked(_pv.copy(p.pos).setY(p.pos.y + 0.6), world.city.colliders, 0.4)) {
      crash(world, 'a low-flying seaplane clips a rooftop downtown');
      return;
    }
    if (p.pos.y < 1.2) { crash(world, 'a seaplane attempts a street landing; the street wins'); return; }
  }
  if (p.health <= 0) { crash(world, 'a smoking seaplane drops out of the sky'); return; }

  // attitude + prop
  p.mesh.rotation.y = p.heading;
  p.mesh.rotation.x = Math.max(-0.4, Math.min(0.4, -p.vy * 0.04));
  p.mesh.rotation.z = turn * 0.35;
  p.prop.rotation.z += (2 + p.speed * 0.6) * dt * 10;
  setEngine(p.speed);
  if (p.health < 45) { addSmoke(p.pos.clone().add(new THREE.Vector3(0, 1.6, -2)), 0.7); }

  // smuggling: fly THROUGH the smoke column, low and slow enough to drop
  const sm = world.smuggle;
  if (sm.active && !sm.dropped) {
    const d = Math.hypot(p.pos.x - sm.markerPos.x, p.pos.z - sm.markerPos.z);
    world.planeHint = `SMUGGLE RUN — fly through the smoke, below 14m (${Math.round(d)}m out)`;
    if (d < 22 && p.pos.y < 14) {
      sm.dropped = true;
      addFlash(p.pos.clone().setY(2), 0xc9b458, 1);
      showToast('📦 PACKAGE AWAY — now get back to the dock');
      showNews('a crab boat reports "cargo from heaven", refuses to elaborate');
    }
  } else if (sm.active && sm.dropped) {
    const d = Math.hypot(p.pos.x - sm.shackPos.x, p.pos.z - sm.shackPos.z);
    world.planeHint = `SMUGGLE RUN — return to the GULL AIR dock (${Math.round(d)}m)`;
    if (d < 45 && floating && p.speed < 4) {
      sm.active = false;
      sm.cooldownT = 90;
      const pay = Math.round(SMUGGLE_PAY * (world.payMult || 1));
      world.money += pay;
      addRep(world, 250);
      addChaos(world, 10);
      if (world.stats) world.stats.smuggles = (world.stats.smuggles || 0) + 1;
      sfxMissionPass();
      showMissionMsg('DELIVERY COMPLETE', `+$${pay} — no manifests, no questions`, '#c9b458');
      world.onSave?.();
    }
  }

  // exit: only on the water, at taxi speed
  if (pressed['KeyE']) {
    if (floating && p.speed < 3) {
      player.inPlane = null;
      player.mesh.visible = true;
      player.pos.set(p.pos.x + 3, WATER_Y - 0.5, p.pos.z);
      player.vel.set(0, 0, 0);
      player.vy = 0;
      engine.stop();
    } else {
      showToast(floating ? 'Slow down to climb out!' : 'Not at altitude! Land on the water first');
    }
  }
}

export function updatePlaneDock(world, dt, pressed) {
  const player = world.player;
  world.planeHint = null;
  world.planeHintNear = false;

  // wreck cleanup / fresh plane at the dock
  if (world.plane?.dead) {
    world.planeRespawnT -= dt;
    if (world.planeRespawnT <= 0) {
      world.plane = spawnPlane(world);
      showNews('GULL AIR wheels out another "certified pre-owned" floatplane');
    }
  }

  const p = world.plane;
  if (p && !p.dead && player.inPlane !== p) {
    // idle bob at anchor
    p.pos.y = WATER_Y + 0.55 + Math.sin(world.time * 1.3) * 0.05;
    p.prop.rotation.z += dt * 0.6;
    tryBoardPlane(world, pressed);
    if (world.planeHintNear) world.planeHint = 'Press <b>E</b> to take the SEAPLANE';
  }

  // the smoke pillar burns while a run is live
  const sm = world.smuggle;
  if (!sm) return;
  sm.cooldownT = Math.max(0, sm.cooldownT - dt);
  if (sm.active && !sm.dropped) {
    sm.smokeT -= dt;
    if (sm.smokeT <= 0) {
      sm.smokeT = 0.25;
      addSmoke(sm.markerPos.clone().setY(2 + Math.random() * 10), 1.4);
    }
    world.smuggleBlip = { x: sm.markerPos.x, z: sm.markerPos.z };
  } else {
    world.smuggleBlip = null;
  }

  // hangar shack: take the contract
  if (!sm.active && !player.inPlane && !player.inCar && !player.inHeli) {
    const d = Math.hypot(player.pos.x - sm.shackPos.x, player.pos.z - sm.shackPos.z);
    if (d < 4.5) {
      if (sm.cooldownT > 0) {
        world.planeHint = `GULL AIR — next run in ${Math.ceil(sm.cooldownT)}s`;
      } else if (p && !p.dead) {
        world.planeHint = `Press <b>E</b> for a SMUGGLE RUN — $${SMUGGLE_PAY}, drop past the shipping lane`;
        if (pressed['KeyE']) {
          sm.active = true;
          sm.dropped = false;
          showMissionMsg('SMUGGLE RUN', 'Take the plane. Find the smoke. Fly through it LOW.', '#c9b458');
          showNews('GULL AIR files a flight plan consisting of a winking emoji');
        }
      } else {
        world.planeHint = 'GULL AIR — the plane is... between airframes. Come back soon.';
      }
    }
  }
}
