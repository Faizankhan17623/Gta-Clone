// Persistent damage — scorch marks, debris piles and shattered-glass litter
// that stay on the street after a fight instead of vanishing instantly.
//
// Observer style: it watches `world` each frame (explosion count, vehicle
// wrecks, the player firing) and drops a decal. Decals live until the player
// gets far from them, then fade — so a street you shot up still looks shot up
// when you swing back a minute later, but the city never accumulates thousands.
//
// Pure visual. No collision, no gameplay effect. All decals share geometry and
// one of three materials, so the whole system is 3 draw-call families.

import * as THREE from 'three';

const MAX = 90;                 // hard cap on live decals
const KEEP_RADIUS = 95;         // within this of the player: kept fresh
const FADE_RADIUS = 140;        // beyond this: fade out and recycle

let scene, world;
let group;
let scorchMat, glassMat, oilMat;
const scorchGeo = new THREE.CircleGeometry(1, 14);
const shardGeo = new THREE.PlaneGeometry(0.25, 0.25);
const decals = []; // { mesh, kind, x, z, born, fade }

let prevExplosions = 0;
let prevWrecks = 0;
let shotCooldown = 0;

export function initScars(sc, w) {
  scene = sc;
  world = w;
  group = new THREE.Group();
  group.name = 'damage-scars';
  scene.add(group);

  scorchMat = new THREE.MeshBasicMaterial({
    color: 0x0a0a0c, transparent: true, opacity: 0.7, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4,
  });
  oilMat = new THREE.MeshBasicMaterial({
    color: 0x141018, transparent: true, opacity: 0.45, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -3,
  });
  glassMat = new THREE.MeshBasicMaterial({
    color: 0xbfe6ff, transparent: true, opacity: 0.5, depthWrite: false,
    side: THREE.DoubleSide,
  });

  world._scarBooms = 0;
  world.scars = {
    // let other systems drop a mark explicitly if they want to
    scorch: (x, z, r) => addScorch(x, z, r),
    glass: (x, z) => addGlass(x, z),
    // the main loop calls this from explodeRocket / explodeVehicle
    boom: (pos) => { world._scarBooms++; world._scarBoomAt = { x: pos.x, z: pos.z }; },
    clear: clearAll,
    get count() { return decals.length; },
  };
  prevExplosions = 0;
}

function recycleIfFull() {
  if (decals.length < MAX) return;
  // drop the oldest that isn't right under the player
  let oldest = -1, oldestT = Infinity;
  for (let i = 0; i < decals.length; i++) {
    const d = decals[i];
    const near = Math.hypot(d.x - focusX(), d.z - focusZ()) < 12;
    if (!near && d.born < oldestT) { oldestT = d.born; oldest = i; }
  }
  if (oldest < 0) oldest = 0;
  remove(oldest);
}

function focusX() { return (world.player.inCar || world.player.inHeli || world.player).pos.x; }
function focusZ() { return (world.player.inCar || world.player.inHeli || world.player).pos.z; }

function addScorch(x, z, r = 2.4) {
  recycleIfFull();
  const m = new THREE.Mesh(scorchGeo, (Math.random() < 0.5 ? scorchMat : oilMat).clone());
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = Math.random() * Math.PI;
  m.position.set(x, 0.045 + Math.random() * 0.02, z);
  m.scale.setScalar(r * (0.7 + Math.random() * 0.6));
  group.add(m);
  decals.push({ mesh: m, kind: 'scorch', x, z, born: world.time, fade: 1 });
}

function addGlass(x, z) {
  recycleIfFull();
  // a little cluster of shards catching the light — one shared cloned material
  const cluster = new THREE.Group();
  const mat = glassMat.clone();
  const n = 4 + (Math.random() * 4 | 0);
  for (let i = 0; i < n; i++) {
    const s = new THREE.Mesh(shardGeo, mat);
    s.position.set((Math.random() - 0.5) * 2.4, 0.02, (Math.random() - 0.5) * 2.4);
    s.rotation.set(-Math.PI / 2 + (Math.random() - 0.5) * 0.6, Math.random() * Math.PI, 0);
    s.scale.setScalar(0.5 + Math.random());
    cluster.add(s);
  }
  cluster.position.set(x, 0, z);
  cluster.userData.mat = mat;
  group.add(cluster);
  decals.push({ mesh: cluster, kind: 'glass', x, z, born: world.time, fade: 1 });
}

function remove(i) {
  const d = decals[i];
  group.remove(d.mesh);
  if (d.mesh.material) d.mesh.material.dispose();
  if (d.mesh.userData?.mat) d.mesh.userData.mat.dispose();
  decals.splice(i, 1);
}

function clearAll() {
  while (decals.length) remove(0);
}

export function updateScars(dt) {
  if (!world.scars) return;
  shotCooldown = Math.max(0, shotCooldown - dt);

  // --- new explosions: the main loop calls world.scars.boom(pos) which bumps
  //     this counter and records the position.
  const boom = world._scarBooms | 0;
  if (boom > prevExplosions) {
    const p = world._scarBoomAt || world.player.pos;
    addScorch(p.x + (Math.random() - 0.5) * 3, p.z + (Math.random() - 0.5) * 3, 3);
    if (Math.random() < 0.5) addGlass(p.x + (Math.random() - 0.5) * 4, p.z + (Math.random() - 0.5) * 4);
    prevExplosions = boom;
  }

  // --- vehicle wrecks lying around: dead cars leave an oil scorch once
  for (const group2 of [world.traffic, world.parked, world.cops]) {
    for (const v of group2 || []) {
      if (v.dead && !v._scarred) {
        v._scarred = true;
        addScorch(v.pos.x, v.pos.z, 2.6);
        addGlass(v.pos.x + 1.5, v.pos.z);
      }
    }
  }

  // --- shooting near a wall / ground: occasional bullet-graze scorch
  if (world._scarShotAt && shotCooldown === 0) {
    const s = world._scarShotAt;
    world._scarShotAt = null;
    shotCooldown = 0.35;
    if (Math.random() < 0.4) {
      recycleIfFull();
      const m = new THREE.Mesh(scorchGeo, scorchMat.clone());
      m.rotation.x = -Math.PI / 2;
      m.position.set(s.x, 0.04, s.z);
      m.scale.setScalar(0.35 + Math.random() * 0.3);
      group.add(m);
      decals.push({ mesh: m, kind: 'graze', x: s.x, z: s.z, born: world.time, fade: 1 });
    }
  }

  // --- distance-based fade / recycle
  const fx = focusX(), fz = focusZ();
  for (let i = decals.length - 1; i >= 0; i--) {
    const d = decals[i];
    const dist = Math.hypot(d.x - fx, d.z - fz);
    const target = dist > FADE_RADIUS ? 0 : dist > KEEP_RADIUS ? 0.35 : 1;
    d.fade += (target - d.fade) * Math.min(1, dt * 0.8);
    if (d.fade < 0.03) { remove(i); continue; }
    const base = d.kind === 'glass' ? 0.5 : d.kind === 'graze' ? 0.55 : 0.7;
    if (d.mesh.material) d.mesh.material.opacity = base * d.fade;
    else if (d.mesh.userData?.mat) d.mesh.userData.mat.opacity = base * d.fade;
  }
}
