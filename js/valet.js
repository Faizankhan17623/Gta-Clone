import * as THREE from 'three';
import { pointBlocked } from './city.js';
import { makeVehicle, randomCarColor } from './car.js';
import { showToast, showNews, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxPickup } from './sound.js';
import { addRep } from './economy.js';

// VALET GIG: a stand near the casino. Take a ticket, a customer car spawns
// on the curb, park it in the marked slot before the timer runs out —
// scrapes cost you part of the tip.

const PAY = 180;

export function initValet(scene, world) {
  const standPos = world.city.spawn.clone().add(new THREE.Vector3(-20, 0, 20));
  const probe = new THREE.Vector3(standPos.x, 1, standPos.z);
  if (pointBlocked(probe, world.city.colliders, 1.4)) standPos.add(new THREE.Vector3(4, 0, -4));
  const stand = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 1.4, 0.8),
    new THREE.MeshStandardMaterial({ color: 0x1c2026, metalness: 0.4, roughness: 0.5 })
  );
  stand.position.copy(standPos).setY(0.7);
  scene.add(stand);

  const slotPos = standPos.clone().add(new THREE.Vector3(10, 0, 4));
  const slot = new THREE.Mesh(
    new THREE.RingGeometry(2, 2.3, 20),
    new THREE.MeshBasicMaterial({ color: 0x7cf78c, side: THREE.DoubleSide })
  );
  slot.rotation.x = -Math.PI / 2;
  slot.position.copy(slotPos).setY(0.05);
  scene.add(slot);

  world.valet = { standPos, slotPos, slot, active: false, car: null, t: 0, startHealth: 0, cooldownT: 0 };
}

export function updateValet(world, dt, pressed) {
  const v = world.valet;
  if (!v) return;
  const player = world.player;
  world.valetHint = null;
  v.slot.rotation.z += dt;
  v.cooldownT = Math.max(0, v.cooldownT - dt);

  if (!v.active) {
    const onFoot = !player.inCar && !player.inHeli && !player.inBoat;
    const d = Math.hypot(player.pos.x - v.standPos.x, player.pos.z - v.standPos.z);
    if (d < 3.4 && onFoot) {
      if (v.cooldownT > 0) { world.valetHint = `VALET STAND — next customer in ${Math.ceil(v.cooldownT)}s`; return; }
      world.valetHint = `Press <b>E</b> for a VALET TICKET — park the car, earn the tip`;
      if (pressed['KeyE']) {
        const car = makeVehicle(world.scene, v.standPos.x - 6, v.standPos.z, Math.PI / 2, randomCarColor(), { health: 100 });
        car.parked_ = true;
        v.car = car;
        v.startHealth = car.health;
        v.active = true;
        v.t = 50;
        world.parked.push(car);
        showMissionMsg('VALET TICKET', 'Get the car into the green ring — try not to scrape it', '#7cf78c');
      }
    }
    return;
  }

  v.t -= dt;
  world.valetBlip = { x: v.slotPos.x, z: v.slotPos.z };
  world.valetHint = `VALET — park it in the ring · <b>${Math.ceil(v.t)}s</b>`;
  if (v.car.dead || v.t <= 0) {
    endValet(world, false);
    return;
  }
  if (player.inCar === v.car) {
    const d = Math.hypot(v.car.pos.x - v.slotPos.x, v.car.pos.z - v.slotPos.z);
    const slow = v.car.vel.length() < 1.5;
    if (d < 2.6 && slow) endValet(world, true);
  }
}

function endValet(world, success) {
  const v = world.valet;
  v.active = false;
  v.cooldownT = 25;
  world.valetBlip = null;
  const pi = world.parked.indexOf(v.car);
  if (pi >= 0) world.parked.splice(pi, 1);
  world.scene.remove(v.car.mesh);
  if (success) {
    const damage = Math.max(0, v.startHealth - v.car.health);
    const tip = Math.round(Math.max(40, PAY - damage) * (world.payMult || 1));
    world.money += tip;
    addRep(world, 20);
    if (world.stats) world.stats.valetRuns = (world.stats.valetRuns || 0) + 1;
    sfxMissionPass();
    showMissionMsg('VALET COMPLETE', `+$${tip}${damage > 20 ? ' (docked for the scrapes)' : ''}`, '#7cf78c');
    showNews('a valet parks a stranger\'s car with more enthusiasm than the job requires');
    world.onSave?.();
  } else {
    showToast('Valet job blown — the customer is furious');
  }
}
