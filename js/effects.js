import * as THREE from 'three';
import { sfxExplosion } from './sound.js';
import { vibrate } from './device.js';

let scene = null;
let boomLight = null; // one persistent light reused for every explosion (no shader recompiles)
let boomT = 0;
const list = [];

// --- shared geometry (never disposed) -----------------------------------------
const flashGeo = new THREE.SphereGeometry(1, 10, 8);
const smokeGeo = new THREE.SphereGeometry(1, 7, 6);
const ringGeo = new THREE.RingGeometry(0.55, 1, 26); ringGeo.rotateX(-Math.PI / 2);
const debrisGeo = new THREE.BoxGeometry(0.28, 0.28, 0.28);
const skidGeo = new THREE.PlaneGeometry(0.26, 1.7); skidGeo.rotateX(-Math.PI / 2);

// Per-instance materials still need their own opacity, but they are cheap
// clones of a template whose shader is already compiled — the expensive part
// (program link + getProgramInfoLog) happens once, at init, not mid-fight.
const flashTemplate = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });
const smokeTemplate = new THREE.MeshBasicMaterial({ color: 0x55555a, transparent: true, opacity: 0.55 });
const ringTemplate = new THREE.MeshBasicMaterial({ color: 0xffcc88, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false });
const skidTemplate = new THREE.MeshBasicMaterial({ color: 0x0c0c0e, transparent: true, opacity: 0.5, depthWrite: false });
const tracerTemplate = new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.95 });
const sparkTemplate = new THREE.PointsMaterial({ color: 0xffc96a, size: 0.16, transparent: true, opacity: 1, depthWrite: false });
const debrisTemplate = new THREE.MeshLambertMaterial({ color: 0x33333a, transparent: true });

function mat(template, color) {
  const m = template.clone();
  if (color != null) m.color.set(color);
  return m;
}

export function initEffects(s) {
  scene = s;
  boomLight = new THREE.PointLight(0xff9a3d, 0, 55, 1.6);
  boomLight.position.set(0, -50, 0);
  scene.add(boomLight);

  // warm every effect shader now so the first shot/explosion doesn't hitch
  const warm = [
    new THREE.Mesh(flashGeo, flashTemplate),
    new THREE.Mesh(smokeGeo, smokeTemplate),
    new THREE.Mesh(ringGeo, ringTemplate),
    new THREE.Mesh(skidGeo, skidTemplate),
    new THREE.Mesh(debrisGeo, debrisTemplate),
    new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3)), sparkTemplate),
    new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0.01, 0)]), tracerTemplate),
  ];
  const g = new THREE.Group();
  g.position.set(0, -200, 0); // off-screen
  for (const m of warm) g.add(m);
  scene.add(g);
  // one hidden frame is enough for three.js to compile the programs
  setTimeout(() => { scene.remove(g); for (const m of warm) { m.geometry.dispose?.(); } }, 0);
}

export function addTracer(a, b) {
  const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
  const mesh = new THREE.Line(geo, mat(tracerTemplate));
  scene.add(mesh);
  list.push({ mesh, t: 0, life: 0.09, kind: 'fade' });
}

export function addFlash(pos, color, size) {
  const mesh = new THREE.Mesh(flashGeo, mat(flashTemplate, color));
  mesh.position.copy(pos);
  mesh.scale.setScalar(size * 0.3);
  scene.add(mesh);
  list.push({ mesh, t: 0, life: 0.45, kind: 'explode', size });
}

// expanding ground shockwave ring
export function addRing(pos, color = 0xffcc88) {
  const mesh = new THREE.Mesh(ringGeo, mat(ringTemplate, color));
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
  const mesh = new THREE.Points(geo, mat(sparkTemplate, color));
  scene.add(mesh);
  list.push({ mesh, t: 0, life: 0.75, kind: 'sparks', vels });
}

// tumbling chunks of wreckage that bounce on the road
export function addDebris(pos, count = 8, color = 0x33333a) {
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(debrisGeo, mat(debrisTemplate, color));
    mesh.material.transparent = false;
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
  vibrate([40, 30, 60]); // explosion rumble on phones
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

// rubber stripes left on the road while drifting
export function addSkid(pos, heading) {
  const mesh = new THREE.Mesh(skidGeo, mat(skidTemplate));
  mesh.position.set(pos.x, 0.06 + Math.random() * 0.015, pos.z);
  mesh.rotation.y = heading;
  scene.add(mesh);
  list.push({ mesh, t: 0, life: 8, kind: 'skid' });
}

export function addSmoke(pos, size = 0.7) {
  const mesh = new THREE.Mesh(smokeGeo, mat(smokeTemplate));
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
      // geometry is shared for most kinds; only tracers/sparks own theirs
      if (e.kind === 'fade' || e.kind === 'sparks') e.mesh.geometry.dispose();
      e.mesh.material.dispose(); // the per-instance clone
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
    if (e.kind === 'skid') {
      e.mesh.material.opacity = 0.5 * Math.min(1, (1 - p) * 3);
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
