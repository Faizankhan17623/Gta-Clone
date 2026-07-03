import * as THREE from 'three';
import { createCharacter, animateWalk, randomOutfit } from './characters.js';
import { makeVehicle, randomCarColor } from './car.js';
import { resolveCircle, roadCenter, blockStart, HALF, ROAD, BLOCK, N } from './city.js';
import { addCrime } from './police.js';
import { addSparks, addSmoke } from './effects.js';
import { sfxCrash } from './sound.js';
import { showNews } from './hud.js';

const _v = new THREE.Vector3();

function rectCorners(r) {
  return [
    new THREE.Vector3(r.x0, 0, r.z0),
    new THREE.Vector3(r.x1, 0, r.z0),
    new THREE.Vector3(r.x1, 0, r.z1),
    new THREE.Vector3(r.x0, 0, r.z1),
  ];
}

// ---------------- Pedestrians ----------------

export function spawnPeds(scene, city, count) {
  const peds = [];
  for (let i = 0; i < count; i++) {
    const ch = createCharacter(randomOutfit());
    scene.add(ch.group);
    const p = {
      ch,
      mesh: ch.group,
      pos: ch.group.position,
      heading: Math.random() * Math.PI * 2,
      animT: Math.random() * 6,
      dead: false,
      deadT: 0,
      corners: null,
      target: 0,
      cw: Math.random() < 0.5 ? 1 : -1,
    };
    placePedOnBlock(p, city);
    peds.push(p);
  }
  return peds;
}

function placePedOnBlock(p, city) {
  const rect = city.pedRects[(Math.random() * city.pedRects.length) | 0];
  p.corners = rectCorners(rect);
  p.target = (Math.random() * 4) | 0;
  const a = p.corners[p.target];
  const b = p.corners[(p.target + 1) % 4];
  p.pos.set(
    a.x + (b.x - a.x) * Math.random(),
    0,
    a.z + (b.z - a.z) * Math.random()
  );
}

export function updatePeds(world, dt) {
  const { peds, player, city } = world;
  const pcar = player.inCar;

  // fewer people out at night
  const night = world.clock >= 22 || world.clock < 6;

  for (const p of peds) {
    if (p.dead) {
      p.deadT += dt;
      if (p.deadT > (night ? 55 : 20)) {
        // respawn somewhere else as a fresh citizen
        p.dead = false;
        p.deadT = 0;
        p.webT = 0;
        if (p.webWrap) p.webWrap.visible = false;
        p.mesh.rotation.z = 0;
        p.mesh.position.y = 0;
        placePedOnBlock(p, city);
      }
      continue;
    }

    // wrapped in webbing: stuck in place until it wears off
    if (p.webT > 0) {
      p.webT -= dt;
      if (p.webT <= 0 && p.webWrap) p.webWrap.visible = false;
      continue;
    }

    // threat: fast player car nearby, or recent gunfire
    let threat = null;
    if (pcar && pcar.vel.lengthSq() > 30 && p.pos.distanceTo(pcar.pos) < 11) threat = pcar.pos;
    if (!threat && world.lastShot && world.time - world.lastShot.t < 4 && p.pos.distanceTo(world.lastShot.pos) < 26) {
      threat = world.lastShot.pos;
    }

    let speed;
    if (threat) {
      speed = 5.4;
      _v.subVectors(p.pos, threat);
      _v.y = 0;
      if (_v.lengthSq() < 0.01) _v.set(1, 0, 0);
      _v.normalize();
      p.heading = Math.atan2(_v.x, _v.z);
      p.pos.addScaledVector(_v, speed * dt);
      resolveCircle(p.pos, 0.4, city.colliders);
      const B = HALF - 2;
      p.pos.x = Math.max(-B, Math.min(B, p.pos.x));
      p.pos.z = Math.max(-B, Math.min(B, p.pos.z));
    } else {
      // stroll around the block sidewalk loop
      speed = 1.7;
      const tgt = p.corners[p.target];
      _v.subVectors(tgt, p.pos);
      _v.y = 0;
      const d = _v.length();
      if (d < 0.8) {
        p.target = (p.target + p.cw + 4) % 4;
      } else {
        _v.normalize();
        p.heading = Math.atan2(_v.x, _v.z);
        p.pos.addScaledVector(_v, speed * dt);
        resolveCircle(p.pos, 0.4, city.colliders);
      }
    }

    p.animT += speed * dt * 2.3;
    animateWalk(p.ch, p.animT, threat ? 0.95 : 0.55);
    p.mesh.rotation.y = p.heading;

    // run over by the player's car or a cop car
    if (pcar && !pcar.dead && pcar.vel.lengthSq() > 25 && p.pos.distanceTo(pcar.pos) < 1.9) {
      killPed(world, p, true);
      continue;
    }
    for (const cop of world.cops) {
      if (!cop.dead && cop.vel.lengthSq() > 25 && p.pos.distanceTo(cop.pos) < 1.9) {
        killPed(world, p, false);
        break;
      }
    }
  }
}

export function killPed(world, p, byPlayer) {
  if (p.dead) return;
  p.dead = true;
  p.deadT = 0;
  p.mesh.rotation.z = Math.PI / 2;
  p.mesh.position.y = 0.25;
  if (byPlayer) addCrime(world, 1);
}

// ---------------- Traffic ----------------

export function spawnTraffic(scene, city, count) {
  const traffic = [];
  for (let i = 0; i < count; i++) {
    const vertical = Math.random() < 0.5;
    const road = roadCenter((Math.random() * (N + 1)) | 0);
    const sign = Math.random() < 0.5 ? 1 : -1;
    let x, z, fx, fz;
    if (vertical) {
      fx = 0; fz = sign;
      x = road + sign * 4; // right-hand lane
      z = (Math.random() * 2 - 1) * (HALF - 20);
    } else {
      fx = sign; fz = 0;
      z = road - sign * 4;
      x = (Math.random() * 2 - 1) * (HALF - 20);
    }
    const heading = Math.atan2(fx, fz);
    const v = makeVehicle(scene, x, z, heading, randomCarColor());
    v.ai = { fx, fz, speed: 0, cruise: 8 + Math.random() * 5 };
    traffic.push(v);
  }
  return traffic;
}

export function updateTraffic(world, dt) {
  const { traffic, player } = world;
  const pcar = player.inCar;

  // every now and then two cars pile into each other on their own
  world.accidentT = (world.accidentT ?? 40) - dt;
  if (world.accidentT <= 0) {
    world.accidentT = 45 + Math.random() * 45;
    const focus = pcar ? pcar.pos : player.pos;
    outer:
    for (const a of traffic) {
      if (a.dead || !a.ai || a.pos.distanceTo(focus) > 90) continue;
      for (const b of traffic) {
        if (b === a || b.dead || !b.ai) continue;
        if (a.pos.distanceTo(b.pos) < 12) {
          disableTraffic(a);
          disableTraffic(b);
          a.health -= 30;
          b.health -= 30;
          const mid = a.pos.clone().lerp(b.pos, 0.5).setY(0.7);
          addSparks(mid, 14);
          addSmoke(mid.clone().setY(1), 1);
          sfxCrash(12);
          world.lastShot = { pos: mid, t: world.time }; // bystanders scatter
          showNews('two-car pile-up snarls traffic');
          break outer;
        }
      }
    }
  }

  // rush hours crawl, late night flows fast
  const hour = world.clock ?? 12;
  const flow = (hour >= 8 && hour < 10) || (hour >= 17 && hour < 19) ? 0.65
    : hour >= 22 || hour < 5 ? 1.35 : 1;

  for (const t of traffic) {
    if (t.dead || !t.ai) continue;
    if (t.webT > 0) { // webbed to the road
      t.webT -= dt;
      t.vel.set(0, 0, 0);
      continue;
    }
    const ai = t.ai;

    // brake if something is ahead
    const px = t.pos.x + ai.fx * 8;
    const pz = t.pos.z + ai.fz * 8;
    let blocked = false;
    const near = (o) => {
      const dx = o.pos.x - px;
      const dz = o.pos.z - pz;
      return dx * dx + dz * dz < 22;
    };
    if (pcar && near(pcar)) blocked = true;
    if (!blocked && !pcar && near(player)) blocked = true;
    if (!blocked) {
      for (const o of traffic) {
        if (o === t) continue;
        if (near(o)) { blocked = true; break; }
      }
    }
    if (!blocked) {
      for (const o of world.parked) if (near(o)) { blocked = true; break; }
    }
    if (!blocked) {
      for (const o of world.cops) if (!o.dead && near(o)) { blocked = true; break; }
    }

    const target = blocked ? 0 : ai.cruise * flow;
    ai.speed += Math.max(-14 * dt, Math.min(8 * dt, target - ai.speed));
    if (ai.speed < 0.05 && blocked) ai.speed = 0;

    t.pos.x += ai.fx * ai.speed * dt;
    t.pos.z += ai.fz * ai.speed * dt;
    t.vel.set(ai.fx * ai.speed, 0, ai.fz * ai.speed);

    // wrap around the city
    const W = HALF - 8;
    if (ai.fz !== 0 && Math.abs(t.pos.z) > W) t.pos.z = -Math.sign(t.pos.z) * W;
    if (ai.fx !== 0 && Math.abs(t.pos.x) > W) t.pos.x = -Math.sign(t.pos.x) * W;

    const spin = (ai.speed * dt) / 0.36;
    for (const w of t.wheels) w.rotation.x += spin;
  }
}

// Disable a traffic car after a heavy hit: it stops driving and becomes an obstacle.
export function disableTraffic(t) {
  t.ai = null;
  t.vel.set(0, 0, 0);
}

// ---------------- Parked cars ----------------

export function spawnParked(scene, count) {
  const parked = [];
  for (let i = 0; i < count; i++) {
    const vertical = Math.random() < 0.5;
    const road = roadCenter((Math.random() * (N + 1)) | 0);
    const block = (Math.random() * N) | 0;
    const along = blockStart(block) + 6 + Math.random() * (BLOCK - 12);
    const side = Math.random() < 0.5 ? 1 : -1;
    const off = road + side * (ROAD / 2 - 2.4);
    let x, z, heading;
    if (vertical) {
      x = off; z = along;
      heading = side > 0 ? 0 : Math.PI;
    } else {
      x = along; z = off;
      heading = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    // every fourth parked vehicle is a motorbike — quick and nimble
    const bike = i % 4 === 3;
    parked.push(makeVehicle(scene, x, z, heading, bike ? '#23262d' : randomCarColor(), bike ? { bike: true } : {}));
  }
  return parked;
}
