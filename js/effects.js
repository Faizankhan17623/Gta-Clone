import * as THREE from 'three';
import { sfxExplosion } from './sound.js';

let scene = null;
let boomLight = null; // one persistent light reused for every explosion (no shader recompiles)
let boomT = 0;
const list = [];

export function initEffects(s) {
  scene = s;
  boomLight = new THREE.PointLight(0xff9a3d, 0, 55, 1.6);
  boomLight.position.set(0, -50, 0);
  scene.add(boomLight);
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

// expanding ground shockwave ring
export function addRing(pos, color = 0xffcc88) {
  const geo = new THREE.RingGeometry(0.55, 1, 26);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false })
  );
  mesh.position.set(pos.x, 0.18, pos.z);
  scene.add(mesh);
  list.push({ mesh, t: 0, life: 0.6, kind: 'ring' });
}

// burst of glowing sparks with gravity (single Points draw call)
export function addSparks(pos, count = 12, color = 0xffc96a) {
  const geo = new THREE.BufferGeometry();
  const p = new Float32Array(count * 3);
  const vels = [];
  for (let i = 0; i < count; i++) {
    p[i * 3] = pos.x;
    p[i * 3 + 1] = pos.y;
    p[i * 3 + 2] = pos.z;
    vels.push(new THREE.Vector3(
      (Math.random() - 0.5) * 11,
      Math.random() * 8 + 2.5,
      (Math.random() - 0.5) * 11
    ));
  }
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const mesh = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ color, size: 0.16, transparent: true, opacity: 1, depthWrite: false })
  );
  scene.add(mesh);
  list.push({ mesh, t: 0, life: 0.75, kind: 'sparks', vels });
}

// tumbling chunks of wreckage that bounce on the road
const debrisGeo = new THREE.BoxGeometry(0.28, 0.28, 0.28);
export function addDebris(pos, count = 8, color = 0x33333a) {
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(debrisGeo, new THREE.MeshLambertMaterial({ color }));
    mesh.position.set(pos.x, Math.max(0.6, pos.y), pos.z);
    mesh.scale.setScalar(0.6 + Math.random() * 1.3);
    scene.add(mesh);
    list.push({
      mesh, t: 0, life: 2.2, kind: 'debris',
      vel: new THREE.Vector3((Math.random() - 0.5) * 12, Math.random() * 9 + 4, (Math.random() - 0.5) * 12),
      spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8),
    });
  }
}

export function addExplosion(pos) {
  sfxExplosion();
  const p = pos.clone();
  p.y = Math.max(1.2, pos.y);
  addFlash(p, 0xff9a28, 4.5);
  addFlash(p, 0xffe28a, 2.5);
  addRing(p);
  addSparks(p, 18);
  addDebris(p, 8);
  for (let i = 0; i < 6; i++) {
    const sp = p.clone();
    sp.x += (Math.random() - 0.5) * 2.5;
    sp.z += (Math.random() - 0.5) * 2.5;
    addSmoke(sp, 1.4 + Math.random());
  }
  // fireball light wash on nearby buildings
  boomLight.position.set(p.x, p.y + 2, p.z);
  boomT = 1;
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
  if (boomT > 0) {
    boomT = Math.max(0, boomT - dt * 2.2);
    boomLight.intensity = boomT * 320;
  }

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
    if (e.kind === 'debris') {
      e.vel.y -= 22 * dt;
      e.mesh.position.addScaledVector(e.vel, dt);
      if (e.mesh.position.y < 0.15) {
        e.mesh.position.y = 0.15;
        e.vel.y *= -0.35;
        e.vel.x *= 0.7;
        e.vel.z *= 0.7;
      }
      e.mesh.rotation.x += e.spin.x * dt;
      e.mesh.rotation.y += e.spin.y * dt;
      if (p > 0.6) {
        e.mesh.material.transparent = true;
        e.mesh.material.opacity = 1 - (p - 0.6) / 0.4;
      }
      continue;
    }
    e.mesh.material.opacity = (1 - p) * 0.95;
    if (e.kind === 'explode') {
      e.mesh.scale.setScalar(e.size * (0.3 + p * 1.8));
    } else if (e.kind === 'smoke') {
      e.mesh.position.y += dt * 2.2;
      e.mesh.scale.setScalar(e.size * (0.5 + p * 1.2));
    } else if (e.kind === 'ring') {
      const s = 1 + p * 14;
      e.mesh.scale.set(s, 1, s);
    } else if (e.kind === 'sparks') {
      const arr = e.mesh.geometry.attributes.position;
      for (let j = 0; j < e.vels.length; j++) {
        const v = e.vels[j];
        v.y -= 24 * dt;
        arr.array[j * 3] += v.x * dt;
        arr.array[j * 3 + 1] = Math.max(0.05, arr.array[j * 3 + 1] + v.y * dt);
        arr.array[j * 3 + 2] += v.z * dt;
      }
      arr.needsUpdate = true;
    }
  }
}
