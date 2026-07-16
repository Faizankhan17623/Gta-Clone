import * as THREE from 'three';
import { blockStart, pointBlocked } from './city.js';
import { showToast } from './hud.js';
import { addCrime } from './police.js';
import { addSparks } from './effects.js';
import { sfxPickup } from './sound.js';

// PARKING METERS: a row of coin-fed poles on a mid-town sidewalk. Crack
// one open for pocket change — petty, loud, and occasionally watched.
// They refill overnight.

export function initMeters(scene, world) {
  const poles = [];
  const bx = blockStart(5) - 2;
  for (let i = 0; i < 10; i++) {
    const pos = new THREE.Vector3(bx, 0, blockStart(5) + 6 + i * 4);
    const probe = new THREE.Vector3(pos.x, 0.5, pos.z);
    if (pointBlocked(probe, world.city.colliders, 0.6)) continue;

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6),
      new THREE.MeshStandardMaterial({ color: 0x6a7076, metalness: 0.5, roughness: 0.5 })
    );
    pole.position.copy(pos).setY(0.55);
    scene.add(pole);
    const headMat = new THREE.MeshStandardMaterial({ color: 0x8a9096, metalness: 0.5, roughness: 0.4 });
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.34, 0.12), headMat);
    head.position.copy(pos).setY(1.2);
    scene.add(head);

    const m = { pos, head, headMat, dead: false, doneDay: -99 };
    m.target = {
      pos: m.pos, aimY: 1.1, r: 0.5, passive: true,
      get dead() { return m.dead; },
      hit() {
        if (m.dead || m.doneDay === m.parentWorld.dailyDay) return;
        m.dead = true;
        m.doneDay = m.parentWorld.dailyDay;
        m.head.rotation.x = 1.1;
        const coins = 20 + Math.floor(Math.random() * 41);
        m.parentWorld.money += coins;
        addSparks(m.pos.clone().setY(1.1), 8);
        sfxPickup();
        showToast(`PARKING METER CRACKED — +$${coins} in quarters`);
        if (Math.random() < 0.25) addCrime(m.parentWorld, 1);
      },
    };
    m.parentWorld = world;
    world.targets.push(m.target);
    poles.push(m);
  }
  world.meters = { poles };
}

export function updateMeters(world, dt) {
  const mt = world.meters;
  if (!mt) return;
  // overnight the city re-arms its little cash boxes
  for (const m of mt.poles) {
    if (m.dead && m.doneDay !== world.dailyDay) {
      m.dead = false;
      m.head.rotation.x = 0;
    }
  }
}
