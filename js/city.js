import * as THREE from 'three';

// City layout: N x N blocks separated by roads, surrounded by a perimeter road.
export const BLOCK = 60;
export const ROAD = 16;
export const N = 8;
export const CITY = N * BLOCK + (N + 1) * ROAD; // 624
export const HALF = CITY / 2;

export const roadCenter = (i) => -HALF + ROAD / 2 + i * (BLOCK + ROAD);
export const blockStart = (i) => -HALF + ROAD + i * (BLOCK + ROAD);

// Building facades: a wall map + an emissive map (lit windows only, used at night).
function windowTextures(base) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 512;
  const g = c.getContext('2d');
  const e = document.createElement('canvas');
  e.width = 256; e.height = 512;
  const ge = e.getContext('2d');

  g.fillStyle = base;
  g.fillRect(0, 0, 256, 512);
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, 256, 512);

  // concrete weathering
  for (let i = 0; i < 700; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.05})`;
    g.fillRect(Math.random() * 256, Math.random() * 512, 3, 3);
  }

  const office = Math.random() < 0.5;
  const glassTints = ['#5a7186', '#516478', '#62798e', '#46586a', '#6a8298'];

  if (office) {
    // glass ribbon floors
    for (let y = 14; y < 492; y += 26) {
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(8, y - 2, 240, 20); // recess
      for (let x = 10; x < 244; x += 20) {
        // day look is always glass; warm light comes from the emissive map at night
        g.fillStyle = glassTints[(Math.random() * glassTints.length) | 0];
        g.fillRect(x, y, 17, 16);
        if (Math.random() < 0.42) { ge.fillStyle = '#e8a23a'; ge.fillRect(x, y, 17, 16); }
      }
      // floor slab line
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(0, y + 19, 256, 3);
    }
  } else {
    // apartment punched windows
    for (let y = 16; y < 490; y += 30) {
      for (let x = 14; x < 236; x += 26) {
        g.fillStyle = 'rgba(0,0,0,0.4)';
        g.fillRect(x - 2, y - 2, 20, 24); // frame shadow
        g.fillStyle = glassTints[(Math.random() * glassTints.length) | 0];
        g.fillRect(x, y, 16, 20);
        if (Math.random() < 0.42) { ge.fillStyle = '#e8a23a'; ge.fillRect(x, y, 16, 20); }
        // sill
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.fillRect(x - 2, y + 20, 20, 2);
      }
    }
  }

  // parapet band at the top
  g.fillStyle = 'rgba(0,0,0,0.28)';
  g.fillRect(0, 0, 256, 8);

  // street grime at the bottom
  const grime = g.createLinearGradient(0, 512, 0, 430);
  grime.addColorStop(0, 'rgba(10,10,8,0.4)');
  grime.addColorStop(1, 'rgba(10,10,8,0)');
  g.fillStyle = grime;
  g.fillRect(0, 430, 256, 82);

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  const emissive = new THREE.CanvasTexture(e);
  emissive.colorSpace = THREE.SRGBColorSpace;
  return { map, emissive };
}

function roadTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#28282d';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 350; i++) {
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.035})`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  for (let i = 0; i < 60; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.25})`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 4, 3);
  }
  g.fillStyle = '#a8954a';
  g.fillRect(62, 8, 4, 48);
  g.fillRect(62, 72, 4, 48);
  g.fillStyle = '#8e8e90';
  g.fillRect(4, 0, 3, 128);
  g.fillRect(121, 0, 3, 128);
  const t = new THREE.CanvasTexture(c);
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function billboardTexture() {
  const words = ['VICE 24H', 'CLUCKIN', 'OPEN CITY', 'SPRUNK', 'LIQUOR', 'MOTEL', 'CASINO', 'BURGER'];
  const colors = ['#ff3d6e', '#3dd2ff', '#ffd23d', '#7dff5a', '#ff7a3d', '#c95aff'];
  const c = document.createElement('canvas');
  c.width = 256; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#0a0a10';
  g.fillRect(0, 0, 256, 96);
  const col = colors[(Math.random() * colors.length) | 0];
  g.strokeStyle = col;
  g.lineWidth = 5;
  g.strokeRect(6, 6, 244, 84);
  g.fillStyle = col;
  g.font = 'bold 38px Arial';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(words[(Math.random() * words.length) | 0], 128, 50);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function helipadTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#2a2c30';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#e8c84a';
  g.lineWidth = 6;
  g.beginPath();
  g.arc(64, 64, 50, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#e8c84a';
  g.font = 'bold 64px Arial';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('H', 64, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildCity(scene) {
  const colliders = [];   // {x0,z0,x1,z1,h}
  const pedRects = [];
  const roadXs = [];
  const roadZs = [];
  const helipads = [];
  const windowMats = []; // facade materials, dimmed/lit by the day/night cycle

  // scrubland beyond the city
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY * 3, CITY * 3),
    new THREE.MeshLambertMaterial({ color: 0x49583a })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  ground.receiveShadow = true;
  scene.add(ground);

  // asphalt base slab
  const slab = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY, CITY),
    new THREE.MeshLambertMaterial({ color: 0x303035 })
  );
  slab.rotation.x = -Math.PI / 2;
  slab.receiveShadow = true;
  scene.add(slab);

  // roads
  const roadTex = roadTexture();
  const roadGeo = new THREE.PlaneGeometry(ROAD, CITY);
  roadGeo.rotateX(-Math.PI / 2);
  for (let i = 0; i <= N; i++) {
    const cx = roadCenter(i);
    roadXs.push(cx);
    roadZs.push(cx);

    const tv = roadTex.clone();
    tv.needsUpdate = true;
    tv.wrapT = THREE.RepeatWrapping;
    tv.repeat.set(1, CITY / ROAD);
    const v = new THREE.Mesh(roadGeo, new THREE.MeshLambertMaterial({ map: tv }));
    v.position.set(cx, 0.04, 0);
    v.receiveShadow = true;
    scene.add(v);

    const th = roadTex.clone();
    th.needsUpdate = true;
    th.wrapT = THREE.RepeatWrapping;
    th.repeat.set(1, CITY / ROAD);
    const h = new THREE.Mesh(roadGeo, new THREE.MeshLambertMaterial({ map: th }));
    h.position.set(0, 0.08, cx);
    h.rotation.y = Math.PI / 2;
    h.receiveShadow = true;
    scene.add(h);
  }

  // gritty desaturated building palette, windows glow at dusk
  const winSets = ['#6e747c', '#7a7264', '#5e6a76', '#80775f', '#697078', '#746c5e'].map(windowTextures);
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x46474e });
  const roofPropMat = new THREE.MeshLambertMaterial({ color: 0x55565c });
  const sidewalkMat = new THREE.MeshLambertMaterial({ color: 0x77787c });
  const grassMat = new THREE.MeshLambertMaterial({ color: 0x46613a });
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a4128 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x35602a });
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.3, 1.6, 6);
  const leafGeo = new THREE.ConeGeometry(1.7, 3.6, 8);
  const acGeo = new THREE.BoxGeometry(2.2, 1.4, 2.2);
  const antennaGeo = new THREE.CylinderGeometry(0.08, 0.08, 7, 4);

  function addTree(x, z) {
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, 0.8, z);
    trunk.castShadow = true;
    scene.add(trunk);
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.position.set(x, 3.2, z);
    leaf.castShadow = true;
    scene.add(leaf);
    colliders.push({ x0: x - 0.5, z0: z - 0.5, x1: x + 0.5, z1: z + 0.5, h: 5 });
  }

  const padTex = helipadTexture();
  let parkCount = 0;

  for (let bi = 0; bi < N; bi++) {
    for (let bj = 0; bj < N; bj++) {
      const sx = blockStart(bi);
      const sz = blockStart(bj);
      const cx = sx + BLOCK / 2;
      const cz = sz + BLOCK / 2;
      const isPark = (bi + bj * N) % 11 === 4;

      const walk = new THREE.Mesh(new THREE.BoxGeometry(BLOCK, 0.24, BLOCK), sidewalkMat);
      walk.position.set(cx, 0.12, cz);
      walk.receiveShadow = true;
      scene.add(walk);

      pedRects.push({ x0: sx + 2, z0: sz + 2, x1: sx + BLOCK - 2, z1: sz + BLOCK - 2 });

      if (isPark) {
        const hasPad = parkCount < 2;
        parkCount++;
        const grass = new THREE.Mesh(new THREE.BoxGeometry(BLOCK - 10, 0.2, BLOCK - 10), grassMat);
        grass.position.set(cx, 0.26, cz);
        grass.receiveShadow = true;
        scene.add(grass);

        if (hasPad) {
          const pad = new THREE.Mesh(
            new THREE.CylinderGeometry(7.5, 7.5, 0.3, 24),
            new THREE.MeshLambertMaterial({ map: padTex })
          );
          pad.position.set(cx, 0.42, cz);
          scene.add(pad);
          helipads.push(new THREE.Vector3(cx, 0.6, cz));
        }

        for (let t = 0; t < 7; t++) {
          const tx = cx + (Math.random() - 0.5) * (BLOCK - 20);
          const tz = cz + (Math.random() - 0.5) * (BLOCK - 20);
          if (hasPad && Math.abs(tx - cx) < 11 && Math.abs(tz - cz) < 11) continue;
          addTree(tx, tz);
        }
        continue;
      }

      for (let li = 0; li < 2; li++) {
        for (let lj = 0; lj < 2; lj++) {
          const lotX = sx + 5 + li * 25 + 12.5;
          const lotZ = sz + 5 + lj * 25 + 12.5;
          const w = 17 + Math.random() * 6;
          const d = 17 + Math.random() * 6;
          const hgt = 12 + Math.floor(Math.random() * 9) * 6;
          const set = winSets[(Math.random() * winSets.length) | 0];
          const sideMat = new THREE.MeshStandardMaterial({
            map: set.map,
            emissive: 0xffffff,
            emissiveMap: set.emissive,
            emissiveIntensity: 0.06,
            roughness: 0.92,
            metalness: 0.0,
          });
          windowMats.push(sideMat);
          const geo = new THREE.BoxGeometry(w, hgt, d);
          const b = new THREE.Mesh(geo, [sideMat, sideMat, roofMat, roofMat, sideMat, sideMat]);
          b.position.set(lotX, hgt / 2 + 0.2, lotZ);
          b.castShadow = true;
          b.receiveShadow = true;
          scene.add(b);
          colliders.push({ x0: lotX - w / 2, z0: lotZ - d / 2, x1: lotX + w / 2, z1: lotZ + d / 2, h: hgt + 0.5 });

          // rooftop clutter: AC units + antennas
          const top = hgt + 0.2;
          if (Math.random() < 0.7) {
            const ac = new THREE.Mesh(acGeo, roofPropMat);
            ac.position.set(lotX + (Math.random() - 0.5) * (w - 5), top + 0.7, lotZ + (Math.random() - 0.5) * (d - 5));
            ac.castShadow = true;
            scene.add(ac);
          }
          if (Math.random() < 0.35) {
            const ant = new THREE.Mesh(antennaGeo, roofPropMat);
            ant.position.set(lotX + (Math.random() - 0.5) * (w - 6), top + 3.5, lotZ + (Math.random() - 0.5) * (d - 6));
            scene.add(ant);
          }
          // glowing billboard on some tall buildings, facing the road
          if (hgt >= 30 && Math.random() < 0.3) {
            const bb = new THREE.Mesh(
              new THREE.PlaneGeometry(11, 4.2),
              new THREE.MeshBasicMaterial({ map: billboardTexture() })
            );
            const face = (Math.random() * 4) | 0;
            const y = hgt - 4;
            if (face === 0) { bb.position.set(lotX, y, lotZ + d / 2 + 0.15); }
            else if (face === 1) { bb.position.set(lotX, y, lotZ - d / 2 - 0.15); bb.rotation.y = Math.PI; }
            else if (face === 2) { bb.position.set(lotX + w / 2 + 0.15, y, lotZ); bb.rotation.y = Math.PI / 2; }
            else { bb.position.set(lotX - w / 2 - 0.15, y, lotZ); bb.rotation.y = -Math.PI / 2; }
            scene.add(bb);
          }
        }
      }
    }
  }

  // street lamps at intersections (warm sodium glow)
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.12, 5.4, 6);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2c2c32 });
  const bulbGeo = new THREE.SphereGeometry(0.32, 8, 6);
  const bulbMat = new THREE.MeshLambertMaterial({ color: 0xffd9a0, emissive: 0xcc8b35 });
  const glowGeo = new THREE.CircleGeometry(4.5, 16);
  glowGeo.rotateX(-Math.PI / 2);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffb850, transparent: true, opacity: 0.04, depthWrite: false });
  for (let i = 0; i <= N; i += 2) {
    for (let j = 0; j <= N; j += 2) {
      const x = roadCenter(i) + ROAD / 2 + 1.2;
      const z = roadCenter(j) + ROAD / 2 + 1.2;
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(x, 2.7, z);
      pole.castShadow = true;
      scene.add(pole);
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.set(x, 5.5, z);
      scene.add(bulb);
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.position.set(x, 0.3, z);
      scene.add(glow);
    }
  }

  const mid = Math.floor(N / 2);
  const spawn = new THREE.Vector3(roadCenter(mid), 0, roadCenter(mid));

  return { colliders, pedRects, roadXs, roadZs, spawn, helipads, windowMats, lampGlowMat: glowMat, bulbMat };
}

// Push a circle (pos, r) out of every AABB collider it overlaps.
// Pass maxY to ignore colliders shorter than the entity's altitude (helicopters).
export function resolveCircle(pos, r, colliders, maxY = -Infinity) {
  let hit = null;
  for (const c of colliders) {
    if (maxY > (c.h ?? Infinity)) continue;
    const cx = Math.max(c.x0, Math.min(pos.x, c.x1));
    const cz = Math.max(c.z0, Math.min(pos.z, c.z1));
    let dx = pos.x - cx;
    let dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    let d = Math.sqrt(d2);
    if (d < 1e-4) {
      const px = Math.min(pos.x - c.x0, c.x1 - pos.x) + r;
      const pz = Math.min(pos.z - c.z0, c.z1 - pos.z) + r;
      if (px < pz) {
        const sign = (pos.x - c.x0 < c.x1 - pos.x) ? -1 : 1;
        pos.x += sign * px;
        hit = { nx: sign, nz: 0 };
      } else {
        const sign = (pos.z - c.z0 < c.z1 - pos.z) ? -1 : 1;
        pos.z += sign * pz;
        hit = { nx: 0, nz: sign };
      }
    } else {
      const nx = dx / d;
      const nz = dz / d;
      pos.x += nx * (r - d);
      pos.z += nz * (r - d);
      hit = { nx, nz };
    }
  }
  return hit;
}

// Highest walkable surface under a point: rooftops of colliders whose footprint
// contains the point and whose top is at or just below the point, else street level.
export function groundHeight(pos, colliders, pad = 0.1) {
  let g = 0;
  for (const c of colliders) {
    if (pos.x < c.x0 - pad || pos.x > c.x1 + pad || pos.z < c.z0 - pad || pos.z > c.z1 + pad) continue;
    const top = (c.h ?? 0) - 0.3; // collider tops sit 0.3 above the visible roof
    if (top > g && pos.y >= top - 0.5) g = top;
  }
  return g;
}

// True if a point is inside any collider that reaches above the point's height.
export function pointBlocked(pos, colliders, pad = 0.3) {
  for (const c of colliders) {
    if (pos.y > (c.h ?? Infinity)) continue;
    if (pos.x > c.x0 - pad && pos.x < c.x1 + pad && pos.z > c.z0 - pad && pos.z < c.z1 + pad) return true;
  }
  return false;
}
