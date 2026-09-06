import * as THREE from 'three';
import { blockStart } from './city.js';
import { showToast, showNews, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxPickup } from './sound.js';
import { addCrime } from './police.js';

// CHOP SHOP: a back-alley garage that buys specific vehicles off a rotating
// want-list. Bring the right kind of car in clean and you get paid; damage
// eats into the take. The list refreshes daily. Delivering any car earns a
// little; delivering the wanted one pays a bounty.

const BASE = 220;         // any drivable car
const BONUS = 900;        // matches the want-list
const WANTS = [
  { key: 'any', label: 'any four-door', test: (v) => !v.bike && !v.monster && !v.tank },
  { key: 'bike', label: 'a motorbike', test: (v) => v.bike },
  { key: 'fast', label: 'something quick', test: (v) => (v.top ?? 38) >= 50 && !v.bike },
  { key: 'monster', label: 'a monster truck', test: (v) => v.monster },
  { key: 'cop', label: 'a police cruiser', test: (v) => v.police },
];

export function initChopShop(scene, world, save) {
  const pos = new THREE.Vector3(blockStart(6) + 6, 0, blockStart(1) + 44);

  const shed = new THREE.Mesh(
    new THREE.BoxGeometry(9, 4.5, 8),
    new THREE.MeshStandardMaterial({ color: 0x2c2622, metalness: 0.1, roughness: 0.9 })
  );
  shed.position.copy(pos).setY(2.25);
  shed.castShadow = true;
  scene.add(shed);
  const doorway = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 3.4),
    new THREE.MeshBasicMaterial({ color: 0x0a0a0c })
  );
  doorway.position.copy(pos).add(new THREE.Vector3(0, 1.7, 4.02));
  scene.add(doorway);

  const pad = new THREE.Mesh(
    new THREE.PlaneGeometry(5, 6),
    new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.95 })
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.copy(pos).add(new THREE.Vector3(0, 0.02, 7));
  scene.add(pad);
  const ring = new THREE.Mesh(
    new THREE.CylinderGeometry(3, 3, 0.5, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xff7a3d, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.position.copy(pos).add(new THREE.Vector3(0, 0.4, 7));
  scene.add(ring);

  world.chopshop = {
    pos: pos.clone().add(new THREE.Vector3(0, 0, 7)),
    ring,
    want: WANTS[(Math.random() * WANTS.length) | 0],
    day: -1,
    doneToday: 0,
  };
}

export function updateChopShop(world, dt, pressed) {
  const cs = world.chopshop;
  if (!cs) return;
  world.chopHint = null;
  cs.ring.rotation.y += dt;

  if (cs.day !== world.dailyDay) {
    cs.day = world.dailyDay;
    cs.doneToday = 0;
    cs.want = WANTS[(Math.random() * WANTS.length) | 0];
  }

  const player = world.player;
  const car = player.inCar;
  const d = Math.hypot(player.pos.x - cs.pos.x, player.pos.z - cs.pos.z);

  if (!car) {
    if (d < 5) world.chopHint = `CHOP SHOP — today they want ${cs.want.label}. Drive one in.`;
    return;
  }
  if (d > 4 || car.tank) return;

  const matches = cs.want.test(car);
  const healthFrac = Math.max(0, Math.min(1, (car.health ?? 100) / 100));
  const payout = Math.round((BASE + (matches ? BONUS : 0)) * (0.45 + 0.55 * healthFrac));

  world.chopHint = `CHOP SHOP — press <b>E</b> to sell this ${car.bike ? 'bike' : 'car'} ` +
    `(≈ $${payout}${matches ? ' · MATCH!' : ''}${healthFrac < 0.9 ? ' · damaged' : ''})`;

  if (pressed['KeyE']) {
    // remove the vehicle from the world
    const lists = [world.parked, world.traffic, world.cops];
    for (const list of lists) {
      const i = list.indexOf(car);
      if (i >= 0) list.splice(i, 1);
    }
    world.scene.remove(car.mesh);
    player.inCar = null;
    player.mesh.visible = true;
    player.pos.set(cs.pos.x + 3, 0, cs.pos.z + 2);
    player.vy = 0;

    world.money += payout;
    cs.doneToday++;
    sfxMissionPass();
    sfxPickup();
    if (car.police || matches) addCrime(world, matches && car.police ? 2 : 1);
    showMissionMsg('VEHICLE CHOPPED', `+$${payout}`, '#ff9a3d');
    if (matches) {
      showNews('a wanted vehicle is stripped for parts in an alley');
      cs.want = WANTS[(Math.random() * WANTS.length) | 0];
    }
    world.onSave?.();
  }
}
