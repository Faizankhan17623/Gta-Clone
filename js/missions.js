import * as THREE from 'three';
import { roadCenter, N, HALF } from './city.js';
import { showToast, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxMissionFail, sfxPickup } from './sound.js';
import { makeHeli } from './heli.js';

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
  let type = ['delivery', 'race', 'air', 'taxi', 'hit', 'boss'][mission.done % 6];

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
  mission.reward = { delivery: 500, race: 800, hit: 450, air: 1000, taxi: 700, boss: 2500 }[type] + mission.done * 150;
  startMarker.visible = false;

  if (type === 'air') {
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

  objMarker.visible = type !== 'hit' && type !== 'air' && type !== 'boss';
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
  objMarker.visible = false;
  targetArrow.visible = false;
  airRing.visible = false;
  placeStartMarker(world);
}

function passMission(world) {
  world.money += mission.reward;
  mission.done++;
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
      passMission(world);
      return;
    }
    mission.objectivePos.copy(b.pos); // minimap tracks him
  }
}
