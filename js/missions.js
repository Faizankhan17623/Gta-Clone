import * as THREE from 'three';
import { roadCenter, N, HALF } from './city.js';
import { showToast, showMissionMsg, showNews } from './hud.js';
import { sfxMissionPass, sfxMissionFail, sfxPickup } from './sound.js';
import { makeHeli } from './heli.js';
import { makeVehicle, physStep, separateCars, darkenCar } from './car.js';
import { createCharacter } from './characters.js';
import { addSmoke, addFlash, addSparks, addExplosion } from './effects.js';

// Mission system: a yellow beam marks the mission start point. Walk or drive
// into it to begin. Six mission types rotate, each with a timer, a pink
// objective marker and a cash reward that grows as you complete more.

export const mission = {
  active: false,
  type: null,
  title: '',
  text: '',
  timeLeft: 0,
  reward: 0,
  done: 0,
  cpLeft: 0,
  target: null, // ped, for hit contracts
  boss: null,   // heli, for boss fights
  taxiStage: '',
  truck: null,     // firefighter
  burning: [],
  witness: null,   // escort
  attackers: [],
  roof: null,      // rooftop hit
  markerPos: new THREE.Vector3(),
  objectivePos: new THREE.Vector3(),
};

let startMarker = null;
let objMarker = null;
let targetArrow = null;
let airRing = null;

function makeMarker(color, radius) {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, 0.6, 26, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.position.y = 0.5;
  group.add(ring);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.3, radius * 0.5, 46, 12, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false })
  );
  beam.position.y = 23;
  group.add(beam);
  group.userData.ring = ring;
  return group;
}

function randomRoadPoint(from, minD, maxD) {
  const p = new THREE.Vector3();
  for (let i = 0; i < 60; i++) {
    const vertical = Math.random() < 0.5;
    const road = roadCenter((Math.random() * (N + 1)) | 0);
    const along = (Math.random() * 2 - 1) * (HALF - 25);
    if (vertical) p.set(road, 0, along);
    else p.set(along, 0, road);
    if (!from) return p;
    const d = Math.hypot(p.x - from.x, p.z - from.z);
    if (d >= minD && d <= maxD) return p;
  }
  return p;
}

function placeStartMarker(world, nearSpawn = false) {
  const p = nearSpawn
    ? world.city.spawn.clone().add(new THREE.Vector3(9, 0, 5))
    : randomRoadPoint(world.player.pos, 40, 220);
  mission.markerPos.copy(p);
  startMarker.position.copy(p);
  startMarker.visible = true;
}

export function initMissions(scene, world, doneCount = 0) {
  mission.done = doneCount | 0;
  startMarker = makeMarker(0xffd24a, 2.4);
  scene.add(startMarker);
  objMarker = makeMarker(0xff4ad2, 2.8);
  objMarker.visible = false;
  scene.add(objMarker);
  targetArrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.45, 0.9, 8),
    new THREE.MeshBasicMaterial({ color: 0xff3333 })
  );
  targetArrow.rotation.x = Math.PI;
  targetArrow.visible = false;
  scene.add(targetArrow);
  // floating checkpoint ring for the air swing-races
  airRing = new THREE.Mesh(
    new THREE.TorusGeometry(4, 0.4, 10, 28),
    new THREE.MeshBasicMaterial({ color: 0x4ad2ff, transparent: true, opacity: 0.85 })
  );
  airRing.visible = false;
  scene.add(airRing);
  placeStartMarker(world, true);
  world.mission = mission;
}

// A ring somewhere up in the canyon between the buildings.
function placeAirRing(world, from) {
  const p = randomRoadPoint(from, 70, 130);
  p.y = 13 + Math.random() * 14;
  mission.objectivePos.copy(p);
  airRing.position.copy(p);
  airRing.visible = true;
}

function startMission(world) {
  let type = ['delivery', 'race', 'air', 'taxi', 'fire', 'hit', 'roofhit', 'escort', 'boss'][mission.done % 9];

  if (type === 'hit') {
    // need a living ped a reasonable chase away
    let best = null;
    for (const p of world.peds) {
      if (p.dead) continue;
      const d = Math.hypot(p.pos.x - world.player.pos.x, p.pos.z - world.player.pos.z);
      if (d > 60 && d < 280) { best = p; break; }
    }
    if (best) mission.target = best;
    else type = 'delivery'; // fallback, should be rare
  }

  mission.active = true;
  mission.type = type;
  mission.reward = {
    delivery: 500, race: 800, hit: 450, air: 1000, taxi: 700, boss: 2500,
    fire: 900, roofhit: 850, escort: 1100,
  }[type] + mission.done * 150;
  startMarker.visible = false;

  if (type === 'fire') {
    const p = world.player.pos;
    const tp = randomRoadPoint(p, 15, 50);
    mission.truck = makeVehicle(world.scene, tp.x, tp.z, Math.random() * Math.PI * 2, '#a32222', { health: 300, accel: 12, top: 26, rad: 2.0 });
    const ladder = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.5, 3.6),
      new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 0.6, roughness: 0.4 })
    );
    ladder.position.set(0, 1.55, -0.5);
    mission.truck.mesh.add(ladder);
    world.parked.push(mission.truck);
    mission.burning = [];
    for (let i = 0; i < 3; i++) {
      const bp = randomRoadPoint(p, 90, 240);
      const wreck = makeVehicle(world.scene, bp.x, bp.z, Math.random() * Math.PI * 2, '#3a3a3e');
      wreck.dead = true; // inert scenery until doused
      mission.burning.push({ car: wreck, out: false, douseT: 0, fxT: 0 });
    }
    mission.timeLeft = 110;
    mission.title = 'FIREFIGHTER';
    mission.text = 'Take the fire truck (red) and pull up beside 3 burning cars';
    mission.objectivePos.copy(mission.burning[0].car.pos);
    showNews('car fires reported across the city');
  } else if (type === 'roofhit') {
    const tall = world.city.colliders.filter((c) => c.h >= 30);
    const c = tall[(Math.random() * tall.length) | 0];
    const ch = createCharacter({ shirt: '#d8d8d0', pants: '#26262c', skin: '#8d5a3a' });
    world.scene.add(ch.group);
    ch.group.position.set((c.x0 + c.x1) / 2, c.h - 0.3, (c.z0 + c.z1) / 2);
    const roof = { mesh: ch.group, pos: ch.group.position, dead: false };
    roof.target = {
      pos: roof.pos, aimY: 1.1, r: 1.1,
      get dead() { return roof.dead; },
      hit() { roof.dead = true; roof.mesh.rotation.z = Math.PI / 2; },
    };
    world.targets.push(roof.target);
    mission.roof = roof;
    mission.timeLeft = 90;
    mission.title = 'ROOFTOP HIT';
    mission.text = 'The target hides on a rooftop — webs or a chopper';
    mission.objectivePos.copy(roof.pos);
    targetArrow.visible = true;
  } else if (type === 'escort') {
    const p = world.player.pos;
    const wp = randomRoadPoint(p, 12, 40);
    mission.witness = makeVehicle(world.scene, wp.x, wp.z, 0, '#e8e8e8', { health: 150 });
    world.traffic.push(mission.witness); // shootable/rammable like any car
    mission.attackers = [];
    for (let i = 0; i < 2; i++) {
      const ap = randomRoadPoint(p, 90, 150);
      const a = makeVehicle(world.scene, ap.x, ap.z, 0, '#8a1a1a');
      world.traffic.push(a);
      mission.attackers.push(a);
    }
    mission.objectivePos.copy(randomRoadPoint(p, 250, 420));
    mission.timeLeft = 40 + mission.objectivePos.distanceTo(p) * 0.28;
    mission.title = 'ESCORT';
    mission.text = 'Lead the witness (white car) to the marker — keep them alive';
  } else if (type === 'air') {
    mission.cpLeft = 5;
    mission.timeLeft = 35;
    mission.title = 'SWING RACE';
    mission.text = 'Fly through 5 sky rings — webs only, no vehicles';
    placeAirRing(world, world.player.pos);
  } else if (type === 'taxi') {
    mission.taxiStage = 'pick';
    mission.cpLeft = 2; // two fares
    mission.timeLeft = 45;
    mission.title = 'TAXI SHIFT';
    mission.text = 'Get a car and pick up the fare (pink marker)';
    mission.objectivePos.copy(randomRoadPoint(world.player.pos, 80, 200));
  } else if (type === 'boss') {
    const p = world.player.pos;
    const ang = Math.random() * Math.PI * 2;
    const h = makeHeli(world.scene, p.x + Math.sin(ang) * 130, 55, p.z + Math.cos(ang) * 130, ang + Math.PI, true);
    h.boss = true;
    h.health = 220;
    world.policeHelis.push(h);
    mission.boss = h;
    mission.timeLeft = 100;
    mission.title = 'BOSS: RIVAL CHOPPER';
    mission.text = 'Shoot down the crime boss before he escapes';
    mission.objectivePos.copy(h.pos);
  } else if (type === 'delivery') {
    mission.objectivePos.copy(randomRoadPoint(world.player.pos, 160, 420));
    const d = Math.hypot(mission.objectivePos.x - world.player.pos.x, mission.objectivePos.z - world.player.pos.z);
    mission.timeLeft = 20 + d * 0.25;
    mission.title = 'DELIVERY';
    mission.text = 'Get a car and reach the pink marker';
  } else if (type === 'race') {
    mission.cpLeft = 5;
    mission.objectivePos.copy(randomRoadPoint(world.player.pos, 80, 200));
    mission.timeLeft = 40;
    mission.title = 'STREET RACE';
    mission.text = 'Checkpoints left: 5 — you need a car';
  } else {
    mission.timeLeft = 75;
    mission.title = 'HIT CONTRACT';
    mission.text = 'Eliminate the marked target';
    mission.objectivePos.copy(mission.target.pos);
    targetArrow.visible = true;
  }

  objMarker.visible = type !== 'hit' && type !== 'air' && type !== 'boss' && type !== 'roofhit';
  objMarker.position.copy(mission.objectivePos);
  showMissionMsg(mission.title, mission.text, '#ffd24a');
  showToast('REWARD: $' + mission.reward);
}

function endMission(world) {
  mission.active = false;
  mission.target = null;
  if (mission.boss && !mission.boss.dead) {
    mission.boss.boss = false; // hand him back to the normal despawn logic
    mission.boss.leaving = true;
  }
  mission.boss = null;
  // firefighter cleanup: burning wrecks vanish; the truck stays if you're in it
  for (const b of mission.burning) world.scene.remove(b.car.mesh);
  mission.burning = [];
  if (mission.truck && world.player.inCar !== mission.truck) {
    world.scene.remove(mission.truck.mesh);
    const ti = world.parked.indexOf(mission.truck);
    if (ti >= 0) world.parked.splice(ti, 1);
  }
  mission.truck = null;
  // escort cleanup: attackers leave, the witness car stays parked in the world
  for (const a of mission.attackers) {
    world.scene.remove(a.mesh);
    const ti = world.traffic.indexOf(a);
    if (ti >= 0) world.traffic.splice(ti, 1);
  }
  mission.attackers = [];
  mission.witness = null;
  // rooftop hit cleanup
  if (mission.roof) {
    world.scene.remove(mission.roof.mesh);
    const ti = world.targets.indexOf(mission.roof.target);
    if (ti >= 0) world.targets.splice(ti, 1);
    mission.roof = null;
  }
  objMarker.visible = false;
  targetArrow.visible = false;
  airRing.visible = false;
  placeStartMarker(world);
}

function passMission(world) {
  world.money += mission.reward;
  mission.done++;
  if (world.stats) world.stats.missions++;
  world.addXP?.(200);
  sfxMissionPass();
  showMissionMsg('MISSION PASSED!', '+$' + mission.reward, '#7cf78c');
  endMission(world);
  world.onSave?.();
}

export function failMission(world, reason) {
  if (!mission.active) return;
  sfxMissionFail();
  showMissionMsg('MISSION FAILED', reason, '#ff6b5a');
  endMission(world);
}

export function updateMissions(world, dt) {
  const t = world.time;

  if (!mission.active) {
    // idle marker animation + start trigger
    startMarker.rotation.y += dt * 0.8;
    const pulse = 1 + Math.sin(t * 3) * 0.08;
    startMarker.userData.ring.scale.set(pulse, 1, pulse);
    const focus = world.player.inCar ? world.player.inCar.pos : world.player.pos;
    if (!world.player.inHeli &&
        Math.hypot(focus.x - mission.markerPos.x, focus.z - mission.markerPos.z) < 3.2) {
      startMission(world);
    }
    return;
  }

  mission.timeLeft -= dt;
  if (mission.timeLeft <= 0) {
    failMission(world, 'Out of time');
    return;
  }

  objMarker.rotation.y -= dt * 1.2;
  const pulse = 1 + Math.sin(t * 4) * 0.1;
  objMarker.userData.ring.scale.set(pulse, 1, pulse);

  const car = world.player.inCar;

  if (mission.type === 'delivery') {
    if (car && !car.dead &&
        Math.hypot(car.pos.x - mission.objectivePos.x, car.pos.z - mission.objectivePos.z) < 5.5) {
      passMission(world);
    }
  } else if (mission.type === 'race') {
    if (car && !car.dead &&
        Math.hypot(car.pos.x - mission.objectivePos.x, car.pos.z - mission.objectivePos.z) < 6.5) {
      mission.cpLeft--;
      if (mission.cpLeft <= 0) {
        passMission(world);
      } else {
        sfxPickup();
        mission.timeLeft += 20;
        mission.text = `Checkpoints left: ${mission.cpLeft}`;
        showToast('CHECKPOINT +20s');
        mission.objectivePos.copy(randomRoadPoint(mission.objectivePos, 90, 220));
        objMarker.position.copy(mission.objectivePos);
      }
    }
  } else if (mission.type === 'hit') {
    const tp = mission.target;
    mission.objectivePos.copy(tp.pos);
    targetArrow.position.set(tp.pos.x, 2.7 + Math.sin(t * 5) * 0.25, tp.pos.z);
    targetArrow.rotation.y += dt * 3;
    if (tp.dead) passMission(world);
  } else if (mission.type === 'air') {
    airRing.rotation.y += dt * 1.4;
    const pulse = 1 + Math.sin(t * 4) * 0.06;
    airRing.scale.setScalar(pulse);
    const p = world.player;
    if (!car && !p.inHeli &&
        p.pos.distanceTo(mission.objectivePos) < 5.5) {
      mission.cpLeft--;
      if (mission.cpLeft <= 0) {
        passMission(world);
      } else {
        sfxPickup();
        mission.timeLeft += 18;
        mission.text = `Sky rings left: ${mission.cpLeft}`;
        showToast('RING! +18s');
        placeAirRing(world, mission.objectivePos);
      }
    }
  } else if (mission.type === 'taxi') {
    if (car && !car.dead && car.vel.length() < 4 &&
        Math.hypot(car.pos.x - mission.objectivePos.x, car.pos.z - mission.objectivePos.z) < 5.5) {
      if (mission.taxiStage === 'pick') {
        mission.taxiStage = 'drop';
        mission.timeLeft += 25;
        mission.text = 'Fare aboard — take them to the marker';
        showToast('FARE PICKED UP +25s');
        sfxPickup();
      } else {
        mission.cpLeft--;
        if (mission.cpLeft <= 0) {
          passMission(world);
          return;
        }
        mission.taxiStage = 'pick';
        mission.timeLeft += 25;
        if (world.stats) world.stats.fares++;
        mission.text = 'Fare dropped! Next pickup is marked';
        showToast('FARE DROPPED +25s');
        sfxPickup();
      }
      mission.objectivePos.copy(randomRoadPoint(mission.objectivePos, 90, 220));
      objMarker.position.copy(mission.objectivePos);
    }
  } else if (mission.type === 'boss') {
    const b = mission.boss;
    if (!b || b.dead) {
      showNews('rival crime boss shot out of the sky');
      passMission(world);
      return;
    }
    mission.objectivePos.copy(b.pos); // minimap tracks him
  } else if (mission.type === 'fire') {
    let next = null;
    let left = 0;
    for (const b of mission.burning) {
      if (b.out) continue;
      left++;
      if (!next) next = b;
      // flames + smoke while it burns
      b.fxT -= dt;
      if (b.fxT <= 0) {
        b.fxT = 0.18;
        addFlash(b.car.pos.clone().setY(1.1), 0xff7a28, 0.7);
        addSmoke(b.car.pos.clone().setY(1.6), 1.1);
      }
      // douse by idling the truck alongside
      if (car === mission.truck && !car.dead &&
          Math.hypot(car.pos.x - b.car.pos.x, car.pos.z - b.car.pos.z) < 9) {
        b.douseT += dt;
        if (b.fxT < 0.09) addSparks(b.car.pos.clone().setY(1.4), 6, 0xcfe8ff); // water spray
        if (b.douseT > 1.4) {
          b.out = true;
          darkenCar(b.car);
          sfxPickup();
          showToast('FIRE OUT!');
        }
      } else {
        b.douseT = Math.max(0, b.douseT - dt);
      }
    }
    if (left === 0) {
      showNews('hero firefighter saves the block');
      passMission(world);
      return;
    }
    mission.text = car === mission.truck
      ? `Fires left: ${left} — pull alongside and hold position`
      : `Get in the fire truck! Fires left: ${left}`;
    mission.objectivePos.copy(next.car.pos);
    objMarker.position.copy(mission.objectivePos);
  } else if (mission.type === 'roofhit') {
    const r = mission.roof;
    targetArrow.position.set(r.pos.x, r.pos.y + 2.7 + Math.sin(t * 5) * 0.25, r.pos.z);
    targetArrow.rotation.y += dt * 3;
    if (r.dead) {
      showNews('shooting reported on a downtown rooftop');
      passMission(world);
    }
  } else if (mission.type === 'escort') {
    const w = mission.witness;
    if (w.dead) {
      failMission(world, 'The witness was killed');
      return;
    }
    const focus = car ? car.pos : world.player.pos;
    // the witness tails you
    const dw = Math.hypot(focus.x - w.pos.x, focus.z - w.pos.z);
    let err = Math.atan2(focus.x - w.pos.x, focus.z - w.pos.z) - w.heading;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;
    physStep(w, {
      steer: Math.max(-1, Math.min(1, err * 2.2)),
      throttle: dw > 14 ? 1 : dw > 8 ? 0.4 : -0.5,
      handbrake: false,
    }, dt, world.city.colliders);
    // the Vipers ram the witness
    for (const a of mission.attackers) {
      if (a.dead) continue;
      let ae = Math.atan2(w.pos.x - a.pos.x, w.pos.z - a.pos.z) - a.heading;
      while (ae > Math.PI) ae -= Math.PI * 2;
      while (ae < -Math.PI) ae += Math.PI * 2;
      physStep(a, { steer: Math.max(-1, Math.min(1, ae * 2.4)), throttle: 1, handbrake: false }, dt, world.city.colliders);
      const imp = separateCars(a, w, false);
      if (imp > 3) {
        w.health -= imp * 1.6;
        a.health -= imp * 0.8;
      }
      if (a.health <= 0 && !a.dead) {
        a.dead = true;
        a.vel.set(0, 0, 0);
        addExplosion(a.pos);
        darkenCar(a);
      }
      if (w.health <= 0 && !w.dead) {
        w.dead = true;
        addExplosion(w.pos);
        darkenCar(w);
      }
    }
    // arrived?
    if (Math.hypot(w.pos.x - mission.objectivePos.x, w.pos.z - mission.objectivePos.z) < 11) {
      showNews('protected witness reaches the safehouse');
      passMission(world);
      return;
    }
    mission.text = `Witness HP ${Math.max(0, Math.round(w.health))} — lead them to the marker`;
  }
}
