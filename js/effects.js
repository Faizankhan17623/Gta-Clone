import * as THREE from 'three';
import { sfxExplosion } from './sound.js';

let scene = null;
const list = [];

export function initEffects(s) {
  scene = s;
}

export function addTracer(a, b) {
  const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
  const mesh = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.95 }));
  scene.add(mesh);
  list.push({ mesh, t: 0, life: 0.09, kind: 'fade' });
}

export function addFlash(pos, color, size) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 10, 8),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 })
  );
  mesh.position.copy(pos);
  mesh.scale.setScalar(size * 0.3);
  scene.add(mesh);
  list.push({ mesh, t: 0, life: 0.45, kind: 'explode', size });
}

export function addExplosion(pos) {
  sfxExplosion();
  const p = pos.clone();
  p.y = Math.max(1.2, pos.y);
  addFlash(p, 0xff9a28, 4.5);
  addFlash(p, 0xffe28a, 2.5);
  for (let i = 0; i < 6; i++) {
    const sp = p.clone();
    sp.x += (Math.random() - 0.5) * 2.5;
    sp.z += (Math.random() - 0.5) * 2.5;
    addSmoke(sp, 1.4 + Math.random());
  }
}

export function addSmoke(pos, size = 0.7) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 7, 6),
    new THREE.MeshBasicMaterial({ color: 0x55555a, transparent: true, opacity: 0.55 })
  );
  mesh.position.copy(pos);
  mesh.scale.setScalar(size * 0.5);
  scene.add(mesh);
  list.push({ mesh, t: 0, life: 1.2, kind: 'smoke', size });
}

export function updateEffects(dt) {
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    e.t += dt;
    const p = e.t / e.life;
    if (p >= 1) {
      scene.remove(e.mesh);
      e.mesh.geometry.dispose();
      e.mesh.material.dispose();
      list.splice(i, 1);
      continue;
    }
    e.mesh.material.opacity = (1 - p) * 0.95;
    if (e.kind === 'explode') {
      e.mesh.scale.setScalar(e.size * (0.3 + p * 1.8));
    } else if (e.kind === 'smoke') {
      e.mesh.position.y += dt * 2.2;
      e.mesh.scale.setScalar(e.size * (0.5 + p * 1.2));
    }
  }
}
