import * as THREE from 'three';
import { blockStart, BLOCK, N } from './city.js';

// Pigeon flocks pecking on the sidewalks; they burst into the air when the
// player (or a speeding swing) gets close, then settle somewhere new.

const FLOCKS = 5;
const BIRDS = 9;

function sidewalkPoint() {
  const bi = (Math.random() * N) | 0;
  const bj = (Math.random() * N) | 0;
  return new THREE.Vector3(
    blockStart(bi) + 3 + Math.random() * (BLOCK - 6),
    0,
    blockStart(bj) + 3 + Math.random() * (BLOCK - 6)
  );
}

export function initAmbient(scene) {
  const flocks = [];
  for (let f = 0; f < FLOCKS; f++) {
    const geo = new THREE.BufferGeometry();
    const p = new Float32Array(BIRDS * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const mesh = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0x8d8d94, size: 0.3, depthWrite: false })
    );
    scene.add(mesh);
    const flock = {
      mesh,
      center: sidewalkPoint(),
      state: 'idle', // idle | fly | gone
      t: 0,
      vels: Array.from({ length: BIRDS }, () => new THREE.Vector3()),
    };
    settle(flock);
    flocks.push(flock);
  }
  return flocks;
}

function settle(flock) {
  flock.state = 'idle';
  flock.t = 0;
  flock.mesh.visible = true;
  const arr = flock.mesh.geometry.attributes.position;
  for (let i = 0; i < BIRDS; i++) {
    arr.array[i * 3] = flock.center.x + (Math.random() - 0.5) * 3;
    arr.array[i * 3 + 1] = 0.15;
    arr.array[i * 3 + 2] = flock.center.z + (Math.random() - 0.5) * 3;
  }
  arr.needsUpdate = true;
}

export function updateAmbient(flocks, world, dt) {
  const player = world.player;
  const focus = player.inCar ? player.inCar.pos : player.pos;
  const fast = (player.inCar ? player.inCar.vel.length() : Math.hypot(player.vel.x, player.vel.z)) > 12;

  for (const flock of flocks) {
    const arr = flock.mesh.geometry.attributes.position;

    if (flock.state === 'idle') {
      flock.t += dt;
      // peck about
      if (flock.t > 0.4) {
        flock.t = 0;
        const i = (Math.random() * BIRDS) | 0;
        arr.array[i * 3] += (Math.random() - 0.5) * 0.4;
        arr.array[i * 3 + 2] += (Math.random() - 0.5) * 0.4;
        arr.needsUpdate = true;
      }
      const d = Math.hypot(focus.x - flock.center.x, focus.z - flock.center.z);
      if (d < (fast ? 14 : 7) && focus.y < 12) {
        flock.state = 'fly';
        flock.t = 0;
        for (const v of flock.vels) {
          v.set((Math.random() - 0.5) * 8, 5 + Math.random() * 5, (Math.random() - 0.5) * 8);
        }
      }
    } else if (flock.state === 'fly') {
      flock.t += dt;
      for (let i = 0; i < BIRDS; i++) {
        const v = flock.vels[i];
        arr.array[i * 3] += v.x * dt;
        arr.array[i * 3 + 1] += v.y * dt;
        arr.array[i * 3 + 2] += v.z * dt;
        v.y += 2 * dt; // climbing away
      }
      arr.needsUpdate = true;
      if (flock.t > 3) {
        flock.state = 'gone';
        flock.t = 10 + Math.random() * 15;
        flock.mesh.visible = false;
      }
    } else {
      flock.t -= dt;
      if (flock.t <= 0) {
        flock.center = sidewalkPoint();
        settle(flock);
      }
    }
  }
}
