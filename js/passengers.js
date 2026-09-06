import * as THREE from 'three';
import { blockStart, N } from './city.js';
import { createCharacter } from './characters.js';
import { showToast, showNews } from './hud.js';
import { sfxPickup, sfxMissionPass } from './sound.js';

// RIDE-HAIL: press H in any car to flip on a "FOR HIRE" light. People flag
// you from the curb; pick them up, drive to their pin, get a fare plus a
// tip. Smooth driving and short routes keep your rating up; crashes and
// scenic detours drag it down. It's free-roam — no mission, toggle it any
// time. (H is also the arena key on foot; this only binds it while driving.)

const FARE_PER_M = 0.9;
const CRASH_PENALTY = 0.4;

function rider(world) {
  const ch = createCharacter({
    shirt: ['#3a7a5a', '#7a4a3a', '#3a4a7a', '#6a6a4a'][(Math.random() * 4) | 0],
    pants: '#2a2a30', skin: '#c98e63',
  });
  world.scene.add(ch.group);
  return { ch, pos: ch.group.position, wave: Math.random() * 6 };
}

export function initPassengers(world, save) {
  world.rideHail = {
    on: false,
    rider: null,
    dest: null,
    aboard: false,
    lightMesh: null,
    rating: save?.rideRating ?? 5,
    trips: save?.rideTrips ?? 0,
    fareStart: null,
    crashedThisTrip: false,
    spawnCd: 3,
  };
}

export function rideHailSave(world) {
  const r = world.rideHail;
  return r ? { rideRating: Math.round(r.rating * 10) / 10, rideTrips: r.trips } : {};
}

function attachLight(world) {
  const r = world.rideHail;
  const car = world.player.inCar;
  if (!car || r.lightMesh) return;
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.28, 0.3),
    new THREE.MeshStandardMaterial({ color: 0xffd24a, emissive: 0xffb020, emissiveIntensity: 1 })
  );
  m.position.set(0, 1.5, 0.2);
  car.mesh.add(m);
  r.lightMesh = m;
}

function detachLight(world) {
  const r = world.rideHail;
  if (r.lightMesh) { r.lightMesh.parent?.remove(r.lightMesh); r.lightMesh = null; }
}

function spawnRider(world) {
  const r = world.rideHail;
  const car = world.player.inCar;
  const focus = car ? car.pos : world.player.pos;
  let x = focus.x + 24, z = focus.z + 24;
  for (let i = 0; i < 12; i++) {
    const bi = (Math.random() * N) | 0, bj = (Math.random() * N) | 0;
    const cx = blockStart(bi) + 4 + Math.random() * 52;
    const cz = blockStart(bj) + 4;
    if (Math.hypot(cx - focus.x, cz - focus.z) < 80 && Math.hypot(cx - focus.x, cz - focus.z) > 20) { x = cx; z = cz; break; }
  }
  r.rider = rider(world);
  r.rider.pos.set(x, 0, z);
  const bi = (Math.random() * N) | 0, bj = (Math.random() * N) | 0;
  r.dest = new THREE.Vector3(blockStart(bi) + 30, 0, blockStart(bj) + 30);
  r.aboard = false;
}

// Called from updateDriving with the H press.
export function toggleForHire(world) {
  const r = world.rideHail;
  if (!r || !world.player.inCar) return;
  r.on = !r.on;
  if (r.on) {
    attachLight(world);
    showToast(`FOR HIRE — ON · rating ${r.rating.toFixed(1)}★`);
  } else {
    detachLight(world);
    if (r.rider?.ch?.group) world.scene.remove(r.rider.ch.group);
    r.rider = null; r.aboard = false;
    showToast('FOR HIRE — OFF');
  }
}

// Called when the player car takes a hit.
export function rideHailCrash(world) {
  const r = world.rideHail;
  if (r?.aboard) r.crashedThisTrip = true;
}

export function updatePassengers(world, dt) {
  const r = world.rideHail;
  if (!r) return;
  world.rideHint = null;
  world.rideBlip = null;

  const car = world.player.inCar;
  if (!car) {
    // stepped out — end the shift quietly
    if (r.on) { r.on = false; detachLight(world); if (r.rider?.ch?.group) world.scene.remove(r.rider.ch.group); r.rider = null; r.aboard = false; }
    return;
  }
  if (!r.on) return;
  if (!r.lightMesh) attachLight(world);

  // find a rider
  if (!r.rider) {
    r.spawnCd -= dt;
    if (r.spawnCd <= 0) { r.spawnCd = 6 + Math.random() * 8; spawnRider(world); }
    return;
  }

  if (!r.aboard) {
    r.rider.wave += dt * 6;
    r.rider.ch.group.children[0].rotation.z = Math.sin(r.rider.wave) * 0.5;
    world.rideBlip = { x: r.rider.pos.x, z: r.rider.pos.z };
    world.rideHint = 'FOR HIRE — pull up to the passenger';
    const d = Math.hypot(car.pos.x - r.rider.pos.x, car.pos.z - r.rider.pos.z);
    if (d < 4 && car.vel.length() < 6) {
      r.aboard = true;
      r.crashedThisTrip = false;
      r.fareStart = new THREE.Vector3(car.pos.x, 0, car.pos.z);
      world.scene.remove(r.rider.ch.group);
      sfxPickup();
      showToast('PASSENGER IN — take them to the pin');
    }
    return;
  }

  // driving them there
  world.rideBlip = { x: r.dest.x, z: r.dest.z };
  const dd = Math.hypot(car.pos.x - r.dest.x, car.pos.z - r.dest.z);
  world.rideHint = `FOR HIRE — drop at the pin (${Math.round(dd)}m)`;
  if (dd < 5 && car.vel.length() < 7) {
    const dist = r.fareStart ? r.fareStart.distanceTo(car.pos) : 200;
    let fare = Math.round(60 + dist * FARE_PER_M);
    // rating: crash hurts, a clean trip nudges it up
    const delta = r.crashedThisTrip ? -CRASH_PENALTY : 0.12;
    r.rating = Math.max(1, Math.min(5, r.rating + delta));
    const tip = r.crashedThisTrip ? 0 : Math.round(fare * (r.rating - 4) * 0.25);
    fare += Math.max(0, tip);
    world.money += fare;
    r.trips++;
    r.aboard = false;
    r.rider = null;
    r.spawnCd = 4 + Math.random() * 6;
    sfxMissionPass();
    showToast(`DROPPED OFF +$${fare}${tip > 0 ? ` (tip $${tip})` : ''} · ${r.rating.toFixed(1)}★`);
    if (r.trips % 10 === 0) showNews(`a ride-hail driver clears ${r.trips} trips`);
    world.onSave?.();
  }
}
