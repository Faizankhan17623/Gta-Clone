import * as THREE from 'three';
import { blockStart, BLOCK, HALF, N } from './city.js';

// Unique landmarks that break up the grid: a super-tall spire (the ultimate
// swing magnet), a sports stadium, a giant park with a fountain, and a
// waterfront pier at the map edge. Each registers colliders so you can land
// and swing off them like any building.

export function buildLandmarks(scene, city) {
  const marks = [];
  const std = (c, e = 0x000000, m = 0.3, r = 0.6) =>
    new THREE.MeshStandardMaterial({ color: c, emissive: e, metalness: m, roughness: r });

  // ---- SPIRE: a 150m landmark tower, dead centre-ish, tapering ----
  {
    const bx = blockStart(2) + BLOCK / 2;
    const bz = blockStart(7) + BLOCK / 2;
    const tiers = [
      { w: 24, h: 60, y: 30 },
      { w: 17, h: 50, y: 85 },
      { w: 11, h: 40, y: 130 },
    ];
    for (const t of tiers) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(t.w, t.h, t.w), std(0x3a4048, 0x11161f, 0.5, 0.4));
      m.position.set(bx, t.y, bz);
      m.castShadow = true;
      scene.add(m);
    }
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.9, 30, 8), std(0x6a7078, 0, 0.7, 0.3));
    antenna.position.set(bx, 165, bz);
    scene.add(antenna);
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(1.2, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xff3030 })
    );
    beacon.position.set(bx, 181, bz);
    scene.add(beacon);
    city.colliders.push({ x0: bx - 12, z0: bz - 12, x1: bx + 12, z1: bz + 12, h: 150 });
    marks.push({ name: 'THE SPIRE', pos: new THREE.Vector3(bx, 150, bz), beacon });
  }

  // ---- STADIUM: an oval bowl on a two-block footprint ----
  {
    const cx = blockStart(7) + BLOCK / 2;
    const cz = blockStart(2) + BLOCK / 2;
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(34, 38, 18, 40, 1, true),
      std(0xb8bcc4, 0, 0.2, 0.8)
    );
    ring.position.set(cx, 9, cz);
    ring.scale.z = 0.72;
    ring.castShadow = true;
    scene.add(ring);
    const field = new THREE.Mesh(
      new THREE.CircleGeometry(26, 32),
      new THREE.MeshLambertMaterial({ color: 0x2e6b34 })
    );
    field.rotation.x = -Math.PI / 2;
    field.position.set(cx, 0.4, cz);
    field.scale.y = 0.72;
    scene.add(field);
    // floodlight pylons
    for (const a of [0.6, 2.0, 4.1, 5.5]) {
      const px = cx + Math.cos(a) * 30;
      const pz = cz + Math.sin(a) * 30 * 0.72;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 26, 6), std(0x2c2c32));
      pole.position.set(px, 13, pz);
      scene.add(pole);
      const lamp = new THREE.Mesh(
        new THREE.BoxGeometry(4, 2.4, 1),
        new THREE.MeshBasicMaterial({ color: 0xfff4d0 })
      );
      lamp.position.set(px, 26, pz);
      lamp.lookAt(cx, 0, cz);
      scene.add(lamp);
    }
    // ring wall collider (approx as a box so you can swing off the rim)
    city.colliders.push({ x0: cx - 36, z0: cz - 27, x1: cx + 36, z1: cz + 27, h: 18 });
    marks.push({ name: 'THE STADIUM', pos: new THREE.Vector3(cx, 18, cz) });
  }

  // ---- CENTRAL PARK with a fountain (open, walkable) ----
  {
    const cx = blockStart(5) + BLOCK / 2;
    const cz = blockStart(5) + BLOCK / 2;
    const lawn = new THREE.Mesh(
      new THREE.CircleGeometry(24, 40),
      new THREE.MeshLambertMaterial({ color: 0x3f6b34 })
    );
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.set(cx, 0.35, cz);
    scene.add(lawn);
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.5, 1.2, 24), std(0x8a8f98, 0, 0.2, 0.8));
    basin.position.set(cx, 0.6, cz);
    scene.add(basin);
    const water = new THREE.Mesh(
      new THREE.CircleGeometry(5.4, 24),
      new THREE.MeshStandardMaterial({ color: 0x2a6ea8, metalness: 0.9, roughness: 0.15 })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(cx, 1.15, cz);
    scene.add(water);
    const jet = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.5, 7, 8),
      new THREE.MeshBasicMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.5 })
    );
    jet.position.set(cx, 4.5, cz);
    scene.add(jet);
    city.colliders.push({ x0: cx - 6, z0: cz - 6, x1: cx + 6, z1: cz + 6, h: 1.5 });
    marks.push({ name: 'CENTRAL PARK', pos: new THREE.Vector3(cx, 6, cz), jet });
  }

  // ---- WATERFRONT strip along the far edge (blue plane + a pier) ----
  {
    const edge = HALF + 30;
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF * 2 + 200, 220),
      new THREE.MeshStandardMaterial({ color: 0x1c4d78, metalness: 0.85, roughness: 0.2 })
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, -0.02, edge + 90);
    scene.add(sea);
    for (let i = -2; i <= 2; i++) {
      const px = i * 40;
      const deck = new THREE.Mesh(new THREE.BoxGeometry(8, 1, 60), std(0x6a4a2a, 0, 0.1, 0.9));
      deck.position.set(px, 1, edge + 20);
      scene.add(deck);
      city.colliders.push({ x0: px - 4, z0: edge - 10, x1: px + 4, z1: edge + 50, h: 1.5 });
    }
    marks.push({ name: 'THE WATERFRONT', pos: new THREE.Vector3(0, 2, edge + 20) });
  }

  return marks;
}

export function updateLandmarks(marks, dt, t) {
  for (const m of marks) {
    if (m.beacon) m.beacon.material.color.setScalar(0.6 + Math.sin(t * 4) * 0.4);
    if (m.jet) m.jet.scale.y = 1 + Math.sin(t * 3) * 0.12;
  }
}
