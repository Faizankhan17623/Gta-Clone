import * as THREE from 'three';
import { blockStart, N } from './city.js';
import { createCharacter } from './characters.js';
import { showToast, showNews, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxPickup } from './sound.js';
import { addRep } from './economy.js';

// TAXI GIG: flag a fare down from the curb (a waving figure that spawns
// near wherever you're driving), drive them to the marked drop-off before
// the meter runs out, get paid by the distance. Any car works — this
// isn't a licensed cab, just a very confident stranger getting in.

const BASE_FARE = 200;

function makeFare(world, x, z) {
  const ch = createCharacter({ shirt: '#d0a020', pants: '#2c3e66', skin: '#c98e63' });
  ch.group.position.set(x, 0, z);
  world.scene.add(ch.group);
  return { ch, pos: ch.group.position };
}

export function initTaxi(world) {
  world.taxi = { active: false, fare: null, dest: null, aboard: false, t: 0, cooldownT: 0 };
}

function spawnFare(world) {
  const player = world.player;
  const focus = player.inCar ? player.inCar.pos : player.pos;
  let x = focus.x + 20, z = focus.z + 20;
  for (let i = 0; i < 10; i++) {
    const bi = (Math.random() * N) | 0, bj = (Math.random() * N) | 0;
    const tx = blockStart(bi) + 4, tz = blockStart(bj) + 4;
    if (Math.hypot(tx - focus.x, tz - focus.z) < 70) { x = tx; z = tz; break; }
  }
  const bi = (Math.random() * N) | 0, bj = (Math.random() * N) | 0;
  const dest = new THREE.Vector3(blockStart(bi) + 30, 0, blockStart(bj) + 30);
  world.taxi.fare = makeFare(world, x, z);
  world.taxi.dest = dest;
  world.taxi.active = true;
  world.taxi.aboard = false;
  world.taxi.t = 90;
}

export function updateTaxi(world, dt, pressed) {
  const tx = world.taxi;
  if (!tx) return;
  const player = world.player;
  world.taxiHint = null;
  world.taxiBlip = null;
  tx.cooldownT = Math.max(0, tx.cooldownT - dt);

  if (!tx.active) {
    if (tx.cooldownT > 0 || !player.inCar) return;
    if (Math.random() < dt * 0.02) spawnFare(world); // a fare occasionally appears while cruising
    return;
  }

  tx.t -= dt;
  if (!tx.aboard) {
    world.taxiBlip = { x: tx.fare.pos.x, z: tx.fare.pos.z };
    world.taxiHint = `TAXI — pick up the fare · <b>${Math.ceil(tx.t)}s</b>`;
    if (player.inCar) {
      const d = Math.hypot(player.inCar.pos.x - tx.fare.pos.x, player.inCar.pos.z - tx.fare.pos.z);
      if (d < 4) {
        tx.aboard = true;
        world.scene.remove(tx.fare.ch.group);
        sfxPickup();
        showToast('FARE ABOARD — get them to the pin');
      }
    }
    if (tx.t <= 0) { endTaxi(world, false); return; }
    return;
  }

  world.taxiBlip = { x: tx.dest.x, z: tx.dest.z };
  world.taxiHint = `TAXI — drop them at the pin · <b>${Math.ceil(tx.t)}s</b>`;
  if (!player.inCar) { endTaxi(world, false); return; }
  const d = Math.hypot(player.inCar.pos.x - tx.dest.x, player.inCar.pos.z - tx.dest.z);
  if (d < 5) { endTaxi(world, true); return; }
  if (tx.t <= 0) endTaxi(world, false);
}

function endTaxi(world, success) {
  const tx = world.taxi;
  if (tx.fare?.ch?.group?.parent) world.scene.remove(tx.fare.ch.group);
  tx.active = false;
  tx.cooldownT = 30;
  if (success) {
    const pay = Math.round(BASE_FARE * (world.payMult || 1));
    world.money += pay;
    addRep(world, 30);
    if (world.stats) world.stats.taxiFares = (world.stats.taxiFares || 0) + 1;
    sfxMissionPass();
    showMissionMsg('FARE DELIVERED', `+$${pay}`, '#d0a020');
    showNews('a stranger gets exactly where they needed to be, faster than legally advisable');
    world.onSave?.();
  } else {
    showToast('Fare gave up and walked');
  }
}
