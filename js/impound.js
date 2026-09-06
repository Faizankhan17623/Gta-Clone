import * as THREE from 'three';
import { blockStart } from './city.js';
import { showToast, showNews } from './hud.js';
import { makeVehicle, resprayVehicle } from './car.js';
import { sfxPickup, sfxMissionFail } from './sound.js';
import { addCrime } from './police.js';

// CITY IMPOUND: get busted while driving and the car is towed here instead
// of just disappearing. Pay the release fee at the office, or slip past the
// gate guard and drive it out yourself — that draws heat. Holds up to 4;
// the oldest is crushed when a fifth comes in.

const FEE = 300;
const CAP = 4;

function describe(v) {
  const d = { bike: !!v.bike, monster: !!v.monster };
  if (v.accel != null) d.accel = v.accel;
  if (v.top != null) d.top = v.top;
  if (v.rad != null) d.rad = v.rad;
  const col = v.mesh?.children?.[0]?.material?.color;
  d.color = col ? '#' + col.getHexString() : (v.bike ? '#23262d' : '#3d6b8f');
  return d;
}

function rebuild(scene, desc, x, z, yaw) {
  const opts = {};
  if (desc.bike) opts.bike = true;
  if (desc.monster) opts.monster = true;
  if (desc.accel != null) opts.accel = desc.accel;
  if (desc.top != null) opts.top = desc.top;
  if (desc.rad != null) opts.rad = desc.rad;
  const v = makeVehicle(scene, x, z, yaw, desc.color || '#3d6b8f', opts);
  if (desc.color) resprayVehicle(v, desc.color);
  return v;
}

export function initImpound(scene, world) {
  const base = new THREE.Vector3(blockStart(8) + 20, 0, blockStart(8) + 20);

  // fenced yard
  const fenceMat = new THREE.MeshStandardMaterial({ color: 0x8a8f96, metalness: 0.5, roughness: 0.5 });
  for (const [x0, z0, x1, z1] of [
    [-14, -12, 14, -12], [-14, 12, 14, 12], [-14, -12, -14, 12], [14, -12, 14, 4],
  ]) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const post = new THREE.Mesh(new THREE.BoxGeometry(x0 === x1 ? 0.2 : len, 2.2, x0 === x1 ? len : 0.2), fenceMat);
    post.position.set(base.x + (x0 + x1) / 2, 1.1, base.z + (z0 + z1) / 2);
    scene.add(post);
  }
  const office = new THREE.Mesh(
    new THREE.BoxGeometry(4, 3, 3),
    new THREE.MeshStandardMaterial({ color: 0x3a4450, roughness: 0.8 })
  );
  office.position.set(base.x + 16, 1.5, base.z + 8);
  scene.add(office);
  const officeSign = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 0.5),
    new THREE.MeshBasicMaterial({ color: 0x4a8cff })
  );
  officeSign.position.set(base.x + 16, 3.4, base.z + 8);
  scene.add(officeSign);
  const gateRing = new THREE.Mesh(
    new THREE.CylinderGeometry(2.6, 2.6, 0.5, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x4a8cff, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false })
  );
  gateRing.position.set(base.x + 14, 0.4, base.z + 8);
  scene.add(gateRing);

  // the guard by the gate
  const guard = new THREE.Group();
  const gb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.1, 0.35), new THREE.MeshStandardMaterial({ color: 0x20304a }));
  gb.position.y = 0.9; guard.add(gb);
  const gh = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), new THREE.MeshStandardMaterial({ color: 0xc98e63 }));
  gh.position.y = 1.6; guard.add(gh);
  guard.position.set(base.x + 13, 0, base.z + 11);
  scene.add(guard);

  world.impound = {
    scene, base, officePos: new THREE.Vector3(base.x + 16, 0, base.z + 8),
    gatePos: new THREE.Vector3(base.x + 14, 0, base.z + 8),
    guardPos: guard.position.clone(),
    gateRing, lot: [], slots: [
      new THREE.Vector3(base.x - 8, 0, base.z - 6),
      new THREE.Vector3(base.x - 8, 0, base.z + 2),
      new THREE.Vector3(base.x, 0, base.z - 6),
      new THREE.Vector3(base.x, 0, base.z + 2),
    ],
  };
}

// Called from respawn() when a bust happens with the player in a car.
export function impoundSeize(world) {
  const imp = world.impound;
  const car = world.player.inCar;
  if (!imp || !car || car.tank || car.dead) return;
  if (imp.lot.length >= CAP) {
    const old = imp.lot.shift();
    if (old.veh) imp.scene.remove(old.veh.mesh);
  }
  const slot = imp.slots[imp.lot.length % imp.slots.length];
  const desc = describe(car);
  const veh = rebuild(imp.scene, desc, slot.x, slot.z, Math.random() * Math.PI);
  world.parked.push(veh);
  imp.lot.push({ desc, veh, slot });
  showNews('an impounded vehicle is towed to the city lot');
}

export function updateImpound(world, dt, pressed) {
  const imp = world.impound;
  if (!imp) return;
  world.impoundHint = null;
  imp.gateRing.rotation.y += dt;

  const player = world.player;
  const onFoot = !player.inCar && !player.inHeli && player.pos.y < 2;

  // office: pay to release the oldest car — it appears at the gate
  const dOff = Math.hypot(player.pos.x - imp.officePos.x, player.pos.z - imp.officePos.z);
  if (onFoot && dOff < 3.5 && imp.lot.length) {
    world.impoundHint = `IMPOUND OFFICE — press <b>E</b> to release a vehicle ($${FEE})`;
    if (pressed['KeyE']) {
      if (world.money < FEE) showToast('Not enough cash for the release fee');
      else {
        world.money -= FEE;
        const item = imp.lot.shift();
        if (item.veh) {
          item.veh.pos.set(imp.gatePos.x + 4, 0, imp.gatePos.z);
        }
        sfxPickup();
        showToast('VEHICLE RELEASED — it\'s at the gate');
        world.onSave?.();
      }
    }
  } else if (onFoot && dOff < 3.5) {
    world.impoundHint = 'IMPOUND OFFICE — nothing of yours is held here';
  }

  // driving a lot car out past the guard = grand theft, again
  const car = player.inCar;
  if (car) {
    const item = imp.lot.find((l) => l.veh === car);
    if (item) {
      const dGate = Math.hypot(car.pos.x - imp.gatePos.x, car.pos.z - imp.gatePos.z);
      if (dGate < 5 && car.vel.length() > 3) {
        imp.lot = imp.lot.filter((l) => l !== item);
        addCrime(world, 2);
        sfxMissionFail();
        showToast('BROKE THE CAR OUT OF IMPOUND — heat is on');
        showNews('a vehicle is driven straight through the impound gate');
      }
    }
  }
}
