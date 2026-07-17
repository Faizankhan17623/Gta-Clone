import * as THREE from 'three';
import { blockStart, roadCenter, N, pointBlocked } from './city.js';
import { makeVehicle } from './car.js';
import { showToast, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxPickup } from './sound.js';
import { addCrime } from './police.js';

// REPO RUNS: the impound lot on the north-east side posts delinquent
// cars. Find the marked car, get it back to the lot in one piece.
// Technically legal. The previous owners rarely agree.

export function initRepo(scene, world, save) {
  let pos = new THREE.Vector3(blockStart(9) + 10, 0, blockStart(4) + 10);
  const probe = new THREE.Vector3(pos.x, 1, pos.z);
  if (pointBlocked(probe, world.city.colliders, 3)) pos = new THREE.Vector3(blockStart(9) + 30, 0, blockStart(4) - 3);

  // the lot: a fenced pad
  const padMat = new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.9 });
  const pad = new THREE.Mesh(new THREE.BoxGeometry(9, 0.1, 9), padMat);
  pad.position.copy(pos).setY(0.05);
  scene.add(pad);
  const hut = new THREE.Mesh(new THREE.BoxGeometry(2, 2.2, 2), new THREE.MeshStandardMaterial({ color: 0x8a6a2a, roughness: 0.7 }));
  hut.position.copy(pos).add(new THREE.Vector3(-5.5, 1.1, 0));
  scene.add(hut);

  world.repo = { pos, hut: hut.position, car: null, done: save?.repoDone ?? 0 };
}

export function updateRepo(world, dt, pressed) {
  const rp = world.repo;
  if (!rp) return;
  const player = world.player;
  world.repoHint = null;
  world.repoBlip = null;

  if (!rp.car) {
    const onFoot = !player.inCar && !player.inHeli && !player.inBoat;
    const d = Math.hypot(player.pos.x - rp.hut.x, player.pos.z - rp.hut.z);
    if (d < 4 && onFoot) {
      world.repoHint = `Press <b>E</b> — REPO RUN #${rp.done + 1}: fetch a delinquent car`;
      if (pressed['KeyE']) {
        // park the mark on a random road, far enough to be a drive
        let x = 0, z = 0;
        for (let tries = 0; tries < 10; tries++) {
          const road = roadCenter(1 + ((Math.random() * (N - 1)) | 0));
          const along = (Math.random() * 2 - 1) * (blockStart(N - 1));
          if (Math.random() < 0.5) { x = road + 5; z = along; } else { x = along; z = road + 5; }
          if (Math.hypot(x - rp.pos.x, z - rp.pos.z) > 150) break;
        }
        const car = makeVehicle(world.scene, x, z, Math.random() * Math.PI * 2, '#8a4aa0');
        world.parked.push(car);
        rp.car = car;
        sfxPickup();
        showMissionMsg('REPO RUN', 'Purple sedan, three payments behind. Bring it home.', '#b08af0');
      }
    }
    return;
  }

  // mark is live
  if (rp.car.dead) {
    showToast('REPO BLOWN — the collateral is a fireball now');
    addCrime(world, 1);
    rp.car = null;
    return;
  }
  world.repoBlip = { x: rp.car.pos.x, z: rp.car.pos.z };
  if (player.inCar === rp.car) {
    world.repoHint = 'REPO — bring it to the impound pad';
    world.repoBlip = { x: rp.pos.x, z: rp.pos.z };
    const d = Math.hypot(rp.car.pos.x - rp.pos.x, rp.car.pos.z - rp.pos.z);
    if (d < 6 && rp.car.vel.length() < 3) {
      rp.done++;
      const pay = Math.round((350 + rp.done * 50) * (world.payMult || 1));
      world.money += pay;
      // the lot keeps the car
      const pi = world.parked.indexOf(rp.car);
      player.inCar = null;
      player.pos.set(rp.pos.x - 6, 0, rp.pos.z);
      if (pi >= 0) world.parked.splice(pi, 1);
      world.scene.remove(rp.car.mesh);
      rp.car = null;
      sfxMissionPass();
      showMissionMsg('REPO CLOSED', `+$${pay} — the lot signs for it`, '#b08af0');
      world.onSave?.();
    }
  } else {
    world.repoHint = 'REPO — the marked car is waiting somewhere on the grid';
  }
}
