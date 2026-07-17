import * as THREE from 'three';
import { pointBlocked } from './city.js';
import { makeVehicle } from './car.js';
import { showToast, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxPickup, sfxHorn } from './sound.js';

// MR. FROSTY: buy the ice cream truck parked by the cart. While you
// drive it, the jingle (N) rings out — stop near people and the window
// slides open by itself. Sales trickle in wherever there's foot traffic.
// On BEACH DAY the whole city wants a cone.

const COST = 8000;

export function initIcetruck(scene, world, save) {
  let pos = world.city.spawn.clone().add(new THREE.Vector3(40, 0, 10));
  const probe = new THREE.Vector3(pos.x, 1, pos.z);
  if (pointBlocked(probe, world.city.colliders, 2.4)) pos = world.city.spawn.clone().add(new THREE.Vector3(46, 0, 6));

  const truck = makeVehicle(scene, pos.x, pos.z, Math.PI / 2, '#e8e2f0');
  // the box body that makes it a truck
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(1.9, 1.3, 2.4),
    new THREE.MeshStandardMaterial({ color: 0xf0e8f8, roughness: 0.5 })
  );
  box.position.set(0, 1.35, -0.6);
  truck.mesh.add(box);
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(0.35, 0.8, 8),
    new THREE.MeshStandardMaterial({ color: 0xf7b8d0, roughness: 0.5 })
  );
  cone.position.set(0, 2.35, -0.6);
  truck.mesh.add(cone);
  world.parked.push(truck);

  world.icetruck = { truck, owned: !!save?.icetruck, saleT: 0, sold: save?.conesSold ?? 0 };
}

export function updateIcetruck(world, dt, pressed) {
  const it = world.icetruck;
  if (!it || it.truck.dead) return;
  const player = world.player;
  world.icetruckHint = null;

  // buying it
  if (!it.owned) {
    if (player.inCar === it.truck) {
      world.icetruckHint = `Press <b>E</b>… actually — <b>1</b> to BUY MR. FROSTY, $${COST}`;
      world.nearKiosk = true;
      if (pressed['Digit1']) {
        if (world.money < COST) { showToast('Not enough cash for the cold-cash business'); return; }
        world.money -= COST;
        it.owned = true;
        sfxMissionPass();
        showMissionMsg('MR. FROSTY IS YOURS', 'Park near people. The product sells itself.', '#f7b8d0');
        world.onSave?.();
      }
    }
    return;
  }

  if (player.inCar !== it.truck) return;

  // the jingle
  if (pressed['KeyN']) { sfxHorn(); sfxPickup(); }

  // sales: stopped or crawling near pedestrians
  it.saleT -= dt;
  if (it.saleT <= 0 && it.truck.vel.length() < 3) {
    it.saleT = 4 + Math.random() * 4;
    let customers = 0;
    for (const ped of world.peds) {
      if (!ped.pos) continue;
      if (Math.hypot(ped.pos.x - it.truck.pos.x, ped.pos.z - it.truck.pos.z) < 16) customers++;
      if (customers >= 4) break;
    }
    if (customers > 0) {
      const beach = world.calendar?.today === 'BEACH DAY' ? 3 : 1;
      const take = customers * (8 + Math.floor(Math.random() * 10)) * beach;
      world.money += take;
      it.sold += customers;
      if (world.stats) world.stats.cones = it.sold;
      sfxPickup();
      showToast(`${customers} cone${customers > 1 ? 's' : ''} sold — +$${take}${beach > 1 ? ' (BEACH DAY!)' : ''}`);
      world.onSave?.();
    }
  }
  world.icetruckHint = `MR. FROSTY — park near people to sell · <b>N</b> rings the jingle · ${it.sold} sold`;
}
