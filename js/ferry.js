import * as THREE from 'three';
import { HALF } from './city.js';
import { WATER_X0, WATER_Y } from './water.js';
import { showToast, showNews, showMissionMsg } from './hud.js';
import { sfxMissionPass } from './sound.js';

// THE HARBOR FERRY: two docks along the seawall. Pay $80, ride the water
// taxi across, and the camera holds a slow pan while it crosses — a scenic
// beat rather than an instant jump.

const FARE = 80;
const DOCKS = [
  { name: 'NORTH DOCK', x: WATER_X0 + 20, z: -HALF + 60 },
  { name: 'SOUTH DOCK', x: WATER_X0 + 20, z: HALF - 60 },
];

function dockMesh(color) {
  const g = new THREE.Group();
  const plank = new THREE.Mesh(new THREE.BoxGeometry(6, 0.3, 4), new THREE.MeshLambertMaterial({ color: 0x5a4028 }));
  plank.position.y = WATER_Y + 0.1;
  g.add(plank);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 3, 6), new THREE.MeshLambertMaterial({ color: 0x3a2a18 }));
  post.position.set(2.5, 1.5, 1.5);
  g.add(post);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.6), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
  flag.position.set(2.9, 2.9, 1.5);
  g.add(flag);
  return g;
}

export function initFerry(scene, world) {
  const docks = DOCKS.map((d) => {
    const mesh = dockMesh(0x4ad2ff);
    mesh.position.set(d.x, 0, d.z);
    scene.add(mesh);
    return { ...d, pos: new THREE.Vector3(d.x, WATER_Y, d.z), mesh };
  });
  world.ferry = { docks, riding: 0, from: null, to: null, t: 0 };
}

export function updateFerry(world, dt, pressed, camera) {
  const f = world.ferry;
  if (!f) return;
  const player = world.player;
  world.ferryHint = null;

  if (f.riding > 0) {
    f.t += dt;
    f.riding -= dt;
    const p = 1 - Math.max(0, f.riding) / f.total;
    player.pos.lerpVectors(f.from.pos, f.to.pos, Math.min(1, p)).add(new THREE.Vector3(2, 0, 0));
    player.pos.y = 0;
    if (f.riding <= 0) {
      player.pos.copy(f.to.pos).add(new THREE.Vector3(2, 0, 2));
      player.onGround = true;
      sfxMissionPass();
      showToast(`Docked at ${f.to.name}`);
      world.ferryLocked = false;
    }
    world.ferryHint = `FERRY — crossing to ${f.to.name}...`;
    world.ferryLocked = true;
    return;
  }
  world.ferryLocked = false;

  const onFoot = !player.inCar && !player.inHeli && !player.inBoat;
  if (!onFoot) return;
  for (const d of f.docks) {
    const dist = Math.hypot(player.pos.x - d.pos.x, player.pos.z - d.pos.z);
    if (dist < 4) {
      const other = f.docks.find((o) => o !== d);
      world.ferryHint = `Press <b>E</b> to ride the FERRY to ${other.name} — $${FARE}`;
      if (pressed['KeyE']) {
        if (world.money < FARE) { showToast('Not enough cash for the fare'); return; }
        world.money -= FARE;
        f.from = d; f.to = other; f.total = 14; f.riding = 14; f.t = 0;
        player.vel.set(0, 0, 0);
        showMissionMsg('HARBOR FERRY', `Crossing to ${other.name}`, '#4ad2ff');
        showNews('the harbor ferry pulls out with one more paying passenger than usual');
      }
      return;
    }
  }
}
