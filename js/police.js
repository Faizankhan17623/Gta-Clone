import * as THREE from 'three';
import { makeVehicle, physStep, separateCars, darkenCar } from './car.js';
import { addExplosion, addTracer, addFlash, addSparks, addSmoke } from './effects.js';
import { roadCenter, HALF, N, resolveCircle } from './city.js';
import { createCharacter, animateWalk } from './characters.js';
import { showNews } from './hud.js';

export function addCrime(world, n) {
  world.wanted = Math.min(5, world.wanted + n);
  world.wantedTimer = 0;
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function focusPos(world) {
  const p = world.player;
  return p.inCar ? p.inCar.pos : p.inHeli ? p.inHeli.pos : p.pos;
}

function spawnCop(world) {
  const target = focusPos(world);
  // pick a point on a random road, 60-110 units away from the player
  let x = 0;
  let z = 0;
  for (let tries = 0; tries < 12; tries++) {
    const road = roadCenter((Math.random() * (N + 1)) | 0);
    const along = (Math.random() * 2 - 1) * (HALF - 14);
    if (Math.random() < 0.5) { x = road; z = along; } else { x = along; z = road; }
    const d = Math.hypot(x - target.x, z - target.z);
    if (d > 55 && d < 130) break;
  }
  const heading = Math.atan2(target.x - x, target.z - z);
  const cop = makeVehicle(world.scene, x, z, heading, '#f2f2f2', { police: true });
  cop.stuckT = 0;
  cop.reverseT = 0;
  cop.flashT = 0;
  cop.deadT = 0;
  world.cops.push(cop);
}

// SWAT van: an armored cop that unloads a fire team when it corners you.
function spawnSwatVan(world) {
  const target = focusPos(world);
  let x = 0;
  let z = 0;
  for (let tries = 0; tries < 12; tries++) {
    const road = roadCenter((Math.random() * (N + 1)) | 0);
    const along = (Math.random() * 2 - 1) * (HALF - 14);
    if (Math.random() < 0.5) { x = road; z = along; } else { x = along; z = road; }
    const d = Math.hypot(x - target.x, z - target.z);
    if (d > 60 && d < 140) break;
  }
  const van = makeVehicle(world.scene, x, z, Math.atan2(target.x - x, target.z - z), '#1a2438', { police: true, health: 250 });
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(2.1, 1.1, 3.6),
    new THREE.MeshStandardMaterial({ color: 0x1a2438, metalness: 0.5, roughness: 0.5 })
  );
  top.position.set(0, 1.6, -0.4);
  van.mesh.add(top);
  van.van = true;
  van.unloaded = false;
  van.stuckT = 0;
  van.reverseT = 0;
  van.flashT = 0;
  van.deadT = 0;
  world.cops.push(van);
  showNews('SWAT unit dispatched downtown');
}

function unloadSwat(world, van) {
  van.unloaded = true;
  for (let i = 0; i < 4; i++) {
    const ch = createCharacter({ shirt: '#20293d', pants: '#141a28', skin: '#c98e63' });
    world.scene.add(ch.group);
    const a = (i / 4) * Math.PI * 2;
    ch.group.position.set(van.pos.x + Math.sin(a) * 3, 0, van.pos.z + Math.cos(a) * 3);
    const officer = {
      ch,
      mesh: ch.group,
      pos: ch.group.position,
      heading: 0,
      animT: Math.random() * 5,
      dead: false,
      deadT: 0,
      shootT: 1 + Math.random(),
    };
    officer.target = {
      pos: officer.pos, aimY: 1.1, r: 0.9,
      get dead() { return officer.dead; },
      hit(w) { killSwat(w, officer); },
    };
    world.targets.push(officer.target);
    world.swat.push(officer);
  }
}

function killSwat(world, o) {
  if (o.dead) return;
  o.dead = true;
  o.deadT = 0;
  o.mesh.rotation.z = Math.PI / 2;
  o.mesh.position.y = 0.25;
  addCrime(world, 1);
}

function removeSwat(world, i) {
  const o = world.swat[i];
  world.scene.remove(o.mesh);
  const ti = world.targets.indexOf(o.target);
  if (ti >= 0) world.targets.splice(ti, 1);
  world.swat.splice(i, 1);
}

const _sv = new THREE.Vector3();

function updateSwat(world, dt) {
  const player = world.player;
  const focus = focusPos(world);
  const onFoot = !player.inCar && !player.inHeli;

  for (let i = world.swat.length - 1; i >= 0; i--) {
    const o = world.swat[i];
    if (o.dead) {
      o.deadT += dt;
      if (o.deadT > 14) removeSwat(world, i);
      continue;
    }
    if (world.wanted < 4) { // heat's off — they pack up
      removeSwat(world, i);
      continue;
    }
    const d = Math.hypot(focus.x - o.pos.x, focus.z - o.pos.z);
    o.heading = Math.atan2(focus.x - o.pos.x, focus.z - o.pos.z);
    o.mesh.rotation.y = o.heading;
    if (d > 9) { // advance
      _sv.set(Math.sin(o.heading), 0, Math.cos(o.heading));
      o.pos.addScaledVector(_sv, 3.2 * dt);
      resolveCircle(o.pos, 0.4, world.city.colliders);
      o.animT += dt * 6;
      animateWalk(o.ch, o.animT, 0.7);
    }
    o.ch.rArm.rotation.x = -Math.PI / 2; // rifle up
    o.shootT -= dt;
    if (o.shootT <= 0 && d < 32 && onFoot && player.pos.y < 10) {
      o.shootT = 1.6 + Math.random() * 0.6;
      const from = o.pos.clone();
      from.y = 1.4;
      const aim = player.pos.clone();
      aim.y += 1.1 + (Math.random() - 0.5) * 0.6;
      addTracer(from, aim);
      addFlash(aim, 0xffd080, 0.25);
      if (Math.random() < 0.55 && !(player.dodgeT > 0)) player.health -= 6;
    }
  }
}

// ---------------- attack drones (2+ stars) ----------------

function spawnDrone(world) {
  const focus = focusPos(world);
  const mesh = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.55),
    new THREE.MeshStandardMaterial({ color: 0x181c24, metalness: 0.7, roughness: 0.3 })
  );
  mesh.add(body);
  const eye = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0xff3030, emissive: 0xcc1010 })
  );
  eye.position.y = -0.2;
  mesh.add(eye);
  const ang = Math.random() * Math.PI * 2;
  mesh.position.set(focus.x + Math.sin(ang) * 40, 22, focus.z + Math.cos(ang) * 40);
  world.scene.add(mesh);
  const drone = {
    mesh,
    pos: mesh.position,
    vel: new THREE.Vector3(),
    dead: false,
    falling: false,
    orbitA: Math.random() * Math.PI * 2,
    shootT: 2,
  };
  drone.target = {
    pos: drone.pos, aimY: 0, r: 1.0, webbable: true,
    get dead() { return drone.dead; },
    hit(w) { killDrone(w, drone); },
    web() { drone.falling = true; }, // webbed rotors: it drops
  };
  world.targets.push(drone.target);
  world.drones.push(drone);
}

function killDrone(world, drone) {
  if (drone.dead) return;
  drone.dead = true;
  addFlash(drone.pos.clone(), 0xffaa50, 1.2);
  addSparks(drone.pos.clone(), 14);
  addSmoke(drone.pos.clone(), 1);
}

function removeDrone(world, i) {
  const d = world.drones[i];
  world.scene.remove(d.mesh);
  const ti = world.targets.indexOf(d.target);
  if (ti >= 0) world.targets.splice(ti, 1);
  world.drones.splice(i, 1);
}

function updateDrones(world, dt) {
  const player = world.player;
  const focus = focusPos(world);
  const desired = world.wanted >= 2 ? Math.min(2, world.wanted - 1) : 0;
  const alive = world.drones.filter((d) => !d.dead && !d.falling).length;
  if (alive < desired) spawnDrone(world);

  for (let i = world.drones.length - 1; i >= 0; i--) {
    const d = world.drones[i];
    if (d.dead) { removeDrone(world, i); continue; }

    if (d.falling) { // webbed out of the sky
      d.vel.y -= 22 * dt;
      d.pos.addScaledVector(d.vel, dt);
      d.mesh.rotation.x += 6 * dt;
      if (d.pos.y <= 0.4) killDrone(world, d);
      continue;
    }
    if (world.wanted < 2) { removeDrone(world, i); continue; }

    d.orbitA += dt * 0.7;
    _sv.set(
      focus.x + Math.sin(d.orbitA) * 11 - d.pos.x,
      focus.y + 9 - d.pos.y,
      focus.z + Math.cos(d.orbitA) * 11 - d.pos.z
    );
    const dist = _sv.length();
    _sv.normalize();
    d.vel.lerp(_sv.multiplyScalar(Math.min(16, dist * 1.4)), Math.min(1, 2.2 * dt));
    d.pos.addScaledVector(d.vel, dt);
    d.mesh.rotation.y += 4 * dt;

    d.shootT -= dt;
    const dp = d.pos.distanceTo(focus);
    if (d.shootT <= 0 && dp < 26) {
      d.shootT = 2.3;
      const aim = focus.clone();
      aim.y += 1;
      aim.x += (Math.random() - 0.5) * 2.5;
      aim.z += (Math.random() - 0.5) * 2.5;
      addTracer(d.pos.clone(), aim);
      addFlash(aim, 0xff6a50, 0.2);
      if (Math.random() < 0.45) {
        if (player.inCar) player.inCar.health -= 4;
        else if (!player.inHeli && !(player.dodgeT > 0)) player.health -= 5;
      }
    }
  }
}

export function updatePolice(world, dt) {
  const player = world.player;

  // wanted level decay — the mayor's police stance stretches or shrinks it,
  // and MARTIAL adds bodies; prestige stars make the whole force meaner
  const stance = [
    { heat: 0.5, extra: 0 }, { heat: 1, extra: 0 }, { heat: 1.8, extra: 1 },
  ][world.policy?.police ?? 1];
  if (world.wanted > 0) {
    world.wantedTimer += dt;
    if (world.wantedTimer > (world.perks?.decay ?? 24) * stance.heat) {
      world.wanted--;
      world.wantedTimer = 0;
    }
  }

  // spawn / despawn
  const desired = world.wanted === 0 ? 0
    : Math.min(8, world.wanted + 1 + stance.extra + (world.prestige | 0));
  const alive = world.cops.filter((c) => !c.dead && !c.van).length;
  if (alive < desired) spawnCop(world);

  // SWAT joins at 4 stars
  const vanDesired = world.wanted >= 5 ? 2 : world.wanted >= 4 ? 1 : 0;
  const vansAlive = world.cops.filter((c) => !c.dead && c.van).length;
  if (vansAlive < vanDesired) spawnSwatVan(world);
  if (world.wanted === 0) {
    for (const cop of world.cops) {
      if (!cop.dead) world.scene.remove(cop.mesh);
    }
    world.cops = world.cops.filter((c) => c.dead);
  }

  const targetPos = focusPos(world);
  const onFoot = !player.inCar && !player.inHeli && !player.inPlane;
  let copNearOnFoot = false;

  for (let i = world.cops.length - 1; i >= 0; i--) {
    const cop = world.cops[i];

    if (cop.dead) {
      cop.deadT += dt;
      if (cop.deadT > 9) {
        world.scene.remove(cop.mesh);
        world.cops.splice(i, 1);
      }
      continue;
    }

    // webbed to the road: no driving, no arrests
    if (cop.webT > 0) {
      cop.webT -= dt;
      cop.vel.set(0, 0, 0);
      continue;
    }

    // flashing lightbar
    cop.flashT += dt;
    if (cop.lightbar) {
      const phase = Math.floor(cop.flashT * 6) % 2 === 0;
      cop.lightbar.red.visible = phase;
      cop.lightbar.blue.visible = !phase;
    }

    const dx = targetPos.x - cop.pos.x;
    const dz = targetPos.z - cop.pos.z;
    const dist = Math.hypot(dx, dz);
    const err = wrapAngle(Math.atan2(dx, dz) - cop.heading);

    const ctl = {
      steer: Math.max(-1, Math.min(1, err * 2.5)),
      throttle: 1,
      handbrake: false,
    };
    if (onFoot && dist < 12) ctl.throttle = dist < 7 ? -1 : 0.35;

    // unstick: reverse for a moment when wedged against a wall
    const sp = cop.vel.length();
    if (cop.reverseT > 0) {
      cop.reverseT -= dt;
      ctl.throttle = -1;
      ctl.steer = -ctl.steer;
    } else if (sp < 1.2 && dist > 8) {
      cop.stuckT += dt;
      if (cop.stuckT > 1.4) {
        cop.reverseT = 1.1;
        cop.stuckT = 0;
      }
    } else {
      cop.stuckT = 0;
    }

    physStep(cop, ctl, dt, world.city.colliders);

    // SWAT van deploys its fire team once it corners you
    if (cop.van && !cop.unloaded && dist < 24 && sp < 4) unloadSwat(world, cop);

    // smash through traffic and parked cars
    for (const o of world.traffic) if (!o.dead) separateCars(cop, o, false);
    for (const o of world.parked) separateCars(cop, o, false);

    if (cop.health <= 0) {
      copDie(world, cop);
      continue;
    }

    if (player.inCar && !player.inCar.dead) {
      // ramming the player's car
      const imp = separateCars(cop, player.inCar, false);
      if (imp > 4) {
        player.inCar.health -= imp * 1.6;
        cop.health -= imp * 1.1;
        if (cop.health <= 0) copDie(world, cop);
      }
    } else if (onFoot) {
      // running the player over
      if (dist < 2.3 && sp > 7) {
        player.health -= 35;
        player.vel.x += cop.vel.x * 0.6;
        player.vel.z += cop.vel.z * 0.6;
      }
      // arrest: cop stopped right next to the player
      if (world.wanted > 0 && dist < 6 && sp < 3) copNearOnFoot = true;
    }
  }

  // busted timer
  if (copNearOnFoot) {
    world.bustedT += dt;
    if (world.bustedT > (world.perks?.busted ?? 1.6)) world.busted = true;
  } else {
    world.bustedT = Math.max(0, world.bustedT - dt * 2);
  }

  updateSwat(world, dt);
  updateDrones(world, dt);
}

export function copDie(world, cop) {
  if (cop.dead) return;
  cop.dead = true;
  cop.deadT = 0;
  cop.vel.set(0, 0, 0);
  addExplosion(cop.pos);
  darkenCar(cop);
  addCrime(world, 1);
}

export function clearCops(world) {
  for (const cop of world.cops) world.scene.remove(cop.mesh);
  world.cops = [];
}
