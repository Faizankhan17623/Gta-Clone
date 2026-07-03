import { makeVehicle, physStep, separateCars, darkenCar } from './car.js';
import { addExplosion } from './effects.js';
import { roadCenter, HALF, N } from './city.js';

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

export function updatePolice(world, dt) {
  const player = world.player;

  // wanted level decay
  if (world.wanted > 0) {
    world.wantedTimer += dt;
    if (world.wantedTimer > 24) {
      world.wanted--;
      world.wantedTimer = 0;
    }
  }

  // spawn / despawn
  const desired = world.wanted === 0 ? 0 : Math.min(6, world.wanted + 1);
  const alive = world.cops.filter((c) => !c.dead).length;
  if (alive < desired) spawnCop(world);
  if (world.wanted === 0) {
    for (const cop of world.cops) {
      if (!cop.dead) world.scene.remove(cop.mesh);
    }
    world.cops = world.cops.filter((c) => c.dead);
  }

  const targetPos = focusPos(world);
  const onFoot = !player.inCar && !player.inHeli;
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
    if (world.bustedT > 1.6) world.busted = true;
  } else {
    world.bustedT = Math.max(0, world.bustedT - dt * 2);
  }
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
