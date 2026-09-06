import * as THREE from 'three';

// Original, reusable environment models. Dimensions are in world metres.
// Building bounds stay authoritative for collision, landing and web anchors.
export function seededRandom(seed = 17623) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

export function makePavingTexture() {
  const random = seededRandom(91);
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#53575a'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 64) for (let x = 0; x < w; x += 128) {
      const c = 124 + Math.floor(random() * 12);
      g.fillStyle = `rgb(${c + 8},${c + 7},${c + 3})`;
      g.fillRect(x + 1, y + 1, 126, 62);
      g.fillStyle = '#b1b1a9'; g.fillRect(x + 2, y + 2, 124, 1);
    }
    for (let i = 0; i < 4500; i++) {
      g.fillStyle = random() > .5 ? '#ffffff09' : '#0000000c';
      g.fillRect(random() * w, random() * h, 1, 1);
    }
  });
}

function masonryTexture(kind) {
  const random = seededRandom(710 + kind);
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = kind === 0 ? '#776d64' : '#9e9c91';
    g.fillRect(0, 0, w, h);
    const rh = kind === 0 ? 16 : 64, rw = kind === 0 ? 64 : 128;
    for (let y = 0; y < h; y += rh) {
      const shift = (y / rh) % 2 ? -rw / 2 : 0;
      for (let x = shift; x < w; x += rw) {
        const v = Math.floor(random() * 20);
        g.fillStyle = kind === 0 ? `rgb(${114 + v},${69 + v},${51 + v})` : `rgb(${152 + v},${150 + v},${139 + v})`;
        g.fillRect(x + 1, y + 1, rw - 2, rh - 2);
      }
    }
    for (let i = 0; i < 5500; i++) {
      g.fillStyle = random() > .5 ? '#ffffff0c' : '#00000010';
      g.fillRect(random() * w, random() * h, 1, 2);
    }
  });
}

function material(color, roughness = .8, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

// A handful of draw calls for thousands of repeated frames, bricks and markings.
function boxBatcher(group, castShadow = true) {
  const batches = new Map();
  return {
    add(mat, x, y, z, w, h, d, yaw = 0) {
      if (!batches.has(mat)) batches.set(mat, []);
      batches.get(mat).push({ x, y, z, w, h, d, yaw });
    },
    finish() {
      let instances = 0;
      const transform = new THREE.Object3D();
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      for (const [mat, boxes] of batches) {
        const mesh = new THREE.InstancedMesh(geometry, mat, boxes.length);
        boxes.forEach((b, i) => {
          transform.position.set(b.x, b.y, b.z);
          transform.rotation.set(0, b.yaw, 0);
          transform.scale.set(b.w, b.h, b.d); transform.updateMatrix();
          mesh.setMatrixAt(i, transform.matrix);
        });
        mesh.castShadow = castShadow; mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        group.add(mesh); instances += boxes.length;
      }
      return { instances, drawCalls: batches.size };
    },
  };
}

// Right-hand traffic currently travels at offsets +/-4m from road centres.
// Keep those routes and all intersections unobstructed. Dividers are paint;
// physical medians require a separate routing change for traffic and police.
export function buildRoadDetails(scene, { roadXs, roadZs, roadWidth, blockSize, surfaceMap }) {
  const group = new THREE.Group(); group.name = 'Road markings'; scene.add(group);
  const batch = boxBatcher(group, false);
  const white = material('#d4d1ba'), yellow = material('#cda94e'), asphalt = material('#ffffff', .96);
  asphalt.map = surfaceMap;
  const markingY = .112;
  function strip(x, z, w, d, mat = white) { batch.add(mat, x, markingY, z, w, .008, d); }
  function oriented(cx, cz, x, z, w, d, horizontal, mat = white) {
    strip(cx + (horizontal ? z : x), cz + (horizontal ? x : z), horizontal ? d : w, horizontal ? w : d, mat);
  }
  for (const horizontal of [false, true]) {
    const roads = horizontal ? roadZs : roadXs;
    for (const road of roads) for (let j = 0; j < roads.length - 1; j++) {
      const start = roads[j] + roadWidth / 2, mid = start + blockSize / 2;
      const cx = horizontal ? mid : road, cz = horizontal ? road : mid;
      // Double centre line and edge lines stop before each crossing.
      for (const x of [-.65, .65]) oriented(cx, cz, x, 0, .12, blockSize - 9, horizontal, yellow);
      if (Math.abs(cx) < 80 && Math.abs(cz) < 80) {
        // Flush hatched divider: the traffic paths at +/-4m remain open.
        for (let z = -18; z <= 18; z += 3) batch.add(yellow, cx + (horizontal ? z : 0), markingY, cz + (horizontal ? 0 : z), 1.55, .008, .11, Math.PI / 4);
      }
      for (const x of [-6.65, 6.65]) oriented(cx, cz, x, 0, .12, blockSize - 3, horizontal);
      // One arrow per travel direction. Positive X lane heads toward positive Z.
      for (const sign of [-1, 1]) {
        const x = sign * 4, z = sign * 13;
        const laneX = horizontal ? -x : x;
        oriented(cx, cz, laneX, z, .22, 2.4, horizontal);
        for (let k = 0; k < 5; k++) oriented(cx, cz, laneX, z + sign * (1.15 + k * .18), 1.5 - k * .3, .18, horizontal);
      }
    }
  }
  // Junction surfacing masks the crossing of the two long road meshes.
  // Repeat crossings across the city so the streamed districts share one road kit.
  for (const x of roadXs) for (const z of roadZs) {
    batch.add(asphalt, x, .094, z, roadWidth, .012, roadWidth);
    for (const horizontal of [false, true]) for (const sign of [-1, 1]) {
      for (let lane = -6; lane <= 6; lane += 1.2) oriented(x, z, lane, sign * 10, .6, 2.8, horizontal);
      // Stop bar only across the approaching lane, beyond the crossing.
      oriented(x, z, horizontal ? sign * 3.7 : -sign * 3.7, sign * 12.1, 5.7, .35, horizontal);
    }
  }
  return { group, ...batch.finish() };
}

function shopSign(text, accent) {
  return canvasTexture(512, 96, (g, w, h) => {
    g.fillStyle = accent; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ffffff45'; g.lineWidth = 2; g.strokeRect(9, 9, w - 18, h - 18);
    g.fillStyle = '#f2ead5'; g.font = '600 34px Arial';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2);
  });
}

export function buildSpawnDistrict(scene, city, area = { bi: 4, bj: 4, props: true }) {
  const inArea = b => b.bi >= area.bi && b.bi < area.bi + 2 && b.bj >= area.bj && b.bj < area.bj + 2;
  const centerX = (area.bi - 4) * 76, centerZ = (area.bj - 4) * 76;
  const previousWindowCount = city.windowMats.length, previousColliderCount = city.colliders.length;
  const name = area.bi >= 8 ? 'Harbor warehouses' : area.bi <= 2 ? 'Old town' : area.bj >= 8 ? 'North residential' : 'Central district';
  const group = new THREE.Group(); group.name = `${name} ${area.bi},${area.bj}`; scene.add(group);
  const batch = boxBatcher(group);
  const random = seededRandom(1886 + area.bi * 10 + area.bj);
  const m = {
    limestone: material('#b9b5a4'), dark: material('#282f32', .55, .35),
    sill: material('#bcb8a9'), frame: material('#555a58', .48, .4),
    recess: material('#1c2428'), glass: material('#344b56', .2, .62),
    wood: material('#6f5036'), green: material('#314b3b'), roof: material('#51565a'),
    curb: material('#a4a49a'), stripe: material('#d3c6a6'), brick: material('#765043'),
  };
  const warm = material('#536365', .32, .25);
  // Upper floors keep framed-window appearance without seven tiny solid meshes
  // per window. Close street-level windows retain their physical frames/sills.
  const pane = canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = '#a4b6bc'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#465052';
    g.fillRect(0, 0, 7, h); g.fillRect(w - 7, 0, 7, h);
    g.fillRect(0, 0, w, 8); g.fillRect(0, h - 10, w, 10);
    g.fillRect(w / 2 - 3, 0, 6, h);
    g.fillStyle = '#c4c1b5'; g.fillRect(0, h - 4, w, 4);
  });
  m.glass.map = warm.map = pane;
  warm.emissive.set('#f3c888'); warm.emissiveIntensity = .06;
  city.windowMats.push(warm);
  const bricks = masonryTexture(0), stone = masonryTexture(1);
  const buildings = city.buildings.filter(inArea);
  const shops = ['CORNER COFFEE', 'CITY SUPPLY', 'NORTHSIDE BOOKS', 'THE DAILY', 'STUDIO 08', 'CENTRAL MARKET', 'PARK PHARMACY', 'OAK & STONE'];
  const colors = ['#294b42', '#2e3b4c', '#6a3630', '#51483b'];
  let windowCount = 0;

  buildings.forEach((b, index) => {
    const kind = area.bi >= 8 ? 1 : area.bi <= 2 || area.bj >= 8 ? 0 : index % 3;
    const tex = (kind === 0 ? bricks : stone).clone(); tex.needsUpdate = true;
    tex.repeat.set(b.w / (kind === 0 ? 1.3 : 4), b.h / (kind === 0 ? 1.3 : 4));
    const wall = material(kind === 2 ? '#79888b' : '#ffffff'); wall.map = tex;
    // Keep the original window-textured facade for the distant representation.
    b.coarseMaterials = b.mesh.material;
    b.detailedMaterials = [wall, wall, m.roof, m.roof, wall, wall];
    b.mesh.material = b.detailedMaterials;
    b.mesh.name = `District ${['brick apartments', 'stone commercial', 'office'][kind]} ${index + 1}`;
    b.style = ['brick', 'stone', 'office'][kind];
    const top = b.h + .2;
    // Roof edging remains within the existing collision footprint.
    for (const sign of [-1, 1]) {
      batch.add(m.limestone, b.x, top + .14, b.z + sign * (b.d / 2 - .16), b.w, .28, .32);
      batch.add(m.limestone, b.x + sign * (b.w / 2 - .16), top + .14, b.z, .32, .28, b.d);
    }
    // Rooftop air handling unit, vents and an access enclosure.
    batch.add(m.roof, b.x, top + .7, b.z, 3.5, 1.4, 2.6);
    for (let i = 0; i < 7; i++) batch.add(m.dark, b.x - 1.35 + i * .45, top + 1.42, b.z, .16, .05, 2.1);
    batch.add(m.limestone, b.x + b.w * .25, top + 1.1, b.z - b.d * .2, 2.3, 2.2, 2.7);

    for (let face = 0; face < 4; face++) {
      const yaw = face * Math.PI / 2, c = Math.cos(yaw), s = Math.sin(yaw);
      const width = face % 2 ? b.d : b.w, depth = face % 2 ? b.w : b.d;
      // Face coordinates: u runs along the wall, n points out of the building.
      const local = (mat, u, y, n, w, h, d) => batch.add(mat, b.x + c * u + s * n, y, b.z - s * u + c * n, w, h, d, yaw);
      const edge = depth / 2;
      const cols = Math.max(3, Math.floor((width - 2.2) / 3.15));
      const step = (width - 2.2) / cols, floors = Math.max(2, Math.floor((b.h - 4.3) / 3.25));
      local(m.limestone, 0, 2.1, edge - .08, width, 3.8, .2);
      local(m.dark, 0, .46, edge + .025, width, .44, .13);
      for (let floor = 0; floor < floors; floor++) {
        const y = 5.7 + floor * 3.25;
        if (y + 1.2 > top - .35) continue;
        if (kind === 2 || floor === 0 || floor === floors - 1) local(m.sill, 0, y - 1.24, edge + .065, width, .15, .2);
        for (let col = 0; col < cols; col++) {
          const u = -width / 2 + 1.1 + step * (col + .5);
          const ww = kind === 2 ? step - .38 : 1.55;
          if (y > 16) {
            local(random() < .27 ? warm : m.glass, u, y, edge + .06, ww + .16, 2.12, .045);
            windowCount++;
            continue;
          }
          local(m.recess, u, y, edge + .025, ww + .24, 2.22, .1);
          local(random() < .27 ? warm : m.glass, u, y, edge + .085, ww, 1.96, .04);
          for (const sign of [-1, 1]) local(m.frame, u + sign * ww / 2, y, edge + .12, .075, 2.09, .08);
          local(m.frame, u, y, edge + .13, .065, 2.02, .08);
          local(m.sill, u, y - 1.08, edge + .13, ww + .32, .13, .3);
          local(m.frame, u, y + 1.02, edge + .12, ww + .1, .075, .09);
          // Shallow Juliet rails add depth without inventing an unsupported
          // walkable balcony over the pavement's ground-to-roof collision model.
          if (kind === 0 && floor % 2 === 1 && col % 2 === 0) {
            local(m.dark, u, y - .22, edge + .27, ww + .24, .065, .06);
            for (let rail = -2; rail <= 2; rail++) local(m.dark, u + rail * ww / 4, y - .64, edge + .27, .045, .85, .045);
          }
          windowCount++;
        }
      }
      // Corner pilasters and a continuous street-level cornice.
      for (const sign of [-1, 1]) local(m.sill, sign * (width / 2 - .25), top / 2, edge + .035, .38, b.h - .4, .14);
      local(m.sill, 0, 4.1, edge + .1, width, .26, .4);

      // Retail on outward-facing sides of each block; courtyards have quiet doors.
      const storefront = (face === 0 && b.lj === 1) || (face === 2 && b.lj === 0) || (face === 1 && b.li === 1) || (face === 3 && b.li === 0);
      if (storefront) {
        for (let j = -1; j <= 1; j++) {
          local(m.dark, j * 4.7, 1.9, edge + .065, 4.15, 2.75, .13);
          local(m.glass, j * 4.7, 1.92, edge + .15, 3.88, 2.4, .04);
          local(m.frame, j * 4.7, 1.95, edge + .18, .08, 2.45, .06);
          // Recessed display plinth visible across the glass.
          local(m.wood, j * 4.7, .86, edge + .2, 3.6, .3, .06);
        }
        local(m.dark, 0, 1.65, edge + .21, 1.28, 2.55, .08);
        local(m.glass, 0, 1.71, edge + .26, 1.08, 2.32, .035);
        local(m.sill, .38, 1.62, edge + .31, .045, .42, .05);
        const accent = material(colors[index % colors.length]);
        local(accent, 0, 3.1, edge + .32, width - 1.1, .32, .72);
        for (let stripe = -6; stripe <= 6; stripe++) local(m.stripe, stripe * .55, 3.28, edge + .32, .22, .035, .74);
        const signMap = shopSign(shops[index % shops.length], colors[index % colors.length]);
        signMap.wrapS = signMap.wrapT = THREE.ClampToEdgeWrapping;
        const signMat = new THREE.MeshStandardMaterial({ map: signMap, roughness: .65, emissive: '#ffffff', emissiveMap: signMap, emissiveIntensity: .06 });
        city.windowMats.push(signMat);
        const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(7.2, .65), signMat);
        signMesh.position.set(b.x + s * (edge + .13), 3.67, b.z + c * (edge + .13));
        signMesh.rotation.y = yaw; group.add(signMesh);
      } else {
        local(m.dark, 0, 1.45, edge + .06, 1.45, 2.5, .12);
        local(m.frame, .42, 1.42, edge + .15, .04, .4, .05);
      }
    }
  });

  const paving = makePavingTexture(); paving.repeat.set(30, 30);
  const pavingMat = material('#ffffff', .94); pavingMat.map = paving;
  const crowns = [];
  const walks = city.walks.filter(inArea);
  const originalWalkMaterials = walks.map(w => w.mesh.material);
  for (const walk of walks) {
    walk.mesh.material = pavingMat;
    const { x, z } = walk;
    for (const sign of [-1, 1]) {
      batch.add(m.curb, x + sign * 29.82, .24, z, .36, .32, 60);
      batch.add(m.curb, x, .24, z + sign * 29.82, 60, .32, .36);
    }
    // Other neighborhoods retain their activity placements and pedestrian paths.
    // The first district owns the new solid street-furniture colliders.
    if (!area.props) continue;
    // Props sit on the long pavement edges, away from intersection activities.
    const side = x > 0 ? -1 : 1, px = x + side * 28.6;
    for (const offset of [-8, 8]) {
      const pz = z + offset;
      batch.add(m.dark, px, .48, pz, .6, .75, 2.25);
      for (let slat = 0; slat < 4; slat++) batch.add(m.wood, px - .25 + slat * .17, .88, pz, .13, .1, 2.35);
      batch.add(m.wood, px - side * .34, 1.18, pz, .12, .52, 2.35);
      city.colliders.push({ x0: px - .48, z0: pz - 1.23, x1: px + .48, z1: pz + 1.23, h: 1.5, detail: true });
    }
    // Drain grilles close to the curb, flush with the road-side surface.
    for (let i = 0; i < 7; i++) batch.add(m.dark, px + side * .65, .415, z - 1.1 + i * .18, .65, .012, .07);
    batch.add(m.dark, px, .85, z + 2.5, .6, 1.15, .6);
    batch.add(m.frame, px, 1.45, z + 2.5, .66, .09, .66);
    batch.add(m.recess, px + side * .315, 1.16, z + 2.5, .04, .19, .4);
    city.colliders.push({ x0: px - .34, z0: z + 2.16, x1: px + .34, z1: z + 2.84, h: 1.5, detail: true });
    for (const offset of [-19, 19]) {
      const tz = z + offset;
      batch.add(m.limestone, px, .53, tz, 1.6, .55, 1.6);
      batch.add(m.wood, px, .82, tz, 1.35, .04, 1.35);
      batch.add(m.wood, px, 2.1, tz, .24, 2.8, .24);
      for (let lobe = 0; lobe < 5; lobe++) {
        const angle = lobe * Math.PI * .5;
        crowns.push({ x: px + Math.sin(angle) * .65, y: 4.0 + (lobe === 4 ? .6 : 0), z: tz + Math.cos(angle) * .65 });
      }
      city.colliders.push({ x0: px - .8, z0: tz - .8, x1: px + .8, z1: tz + .8, h: .83, detail: true });
      city.colliders.push({ x0: px - .15, z0: tz - .15, x1: px + .15, z1: tz + .15, h: 4, detail: true });
    }
    // Street name plates identify routes without implying new traffic rules.
    const sz = z + (z > 0 ? -25.5 : 25.5);
    batch.add(m.dark, px, 2.08, sz, .11, 3.7, .11);
    const plate = shopSign(x > 0 ? 'CENTRAL AVENUE' : 'MARKET STREET', '#29433b');
    const plateMat = new THREE.MeshStandardMaterial({ map: plate, roughness: .65 });
    const streetSign = new THREE.Mesh(new THREE.PlaneGeometry(2.8, .53), plateMat);
    streetSign.position.set(px, 3.6, sz); group.add(streetSign);
    const signBack = streetSign.clone(); signBack.rotation.y = Math.PI;
    signBack.position.z -= .025; group.add(signBack);
    city.colliders.push({ x0: px - .1, z0: sz - .1, x1: px + .1, z1: sz + .1, h: 3.9, detail: true });
  }

  const crownGeometry = new THREE.IcosahedronGeometry(1, 2);
  const vertices = crownGeometry.attributes.position;
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i), y = vertices.getY(i), z = vertices.getZ(i);
    const r = .92 + .13 * Math.sin(x * 31 + y * 19 + z * 13);
    vertices.setXYZ(i, x * r, y * r, z * r);
  }
  crownGeometry.computeVertexNormals();
  const foliage = new THREE.InstancedMesh(crownGeometry, material('#466347', .97), crowns.length);
  const treeTransform = new THREE.Object3D();
  crowns.forEach((c, i) => {
    treeTransform.position.set(c.x, c.y, c.z);
    treeTransform.scale.set(1.1, 1.35, 1.0); treeTransform.updateMatrix();
    foliage.setMatrixAt(i, treeTransform.matrix);
    foliage.setColorAt(i, new THREE.Color().setHSL(.26 + random() * .045, .22 + random() * .12, .8 + random() * .12));
  });
  foliage.castShadow = true; foliage.receiveShadow = true; foliage.computeBoundingSphere(); group.add(foliage);
  const counts = batch.finish();
  const stats = { buildings: buildings.length, windows: windowCount, trees: crowns.length / 5, detailInstances: counts.instances, detailBatches: counts.drawCalls + 1, seed: 17623 };
  const addedWindows = new Set(city.windowMats.slice(previousWindowCount));
  const addedColliders = new Set(city.colliders.slice(previousColliderCount));
  let detailed = true;
  return {
    group, stats,
    update(playerPos, lowGraphics = false) {
      // The district is 152m wide; keep close detail for its surrounding streets.
      // A hysteresis band prevents rapid flickering around the detail boundary.
      const distance = Math.max(Math.abs(playerPos.x - centerX), Math.abs(playerPos.z - centerZ));
      const limit = (lowGraphics ? 155 : 240) + (detailed ? 12 : -12);
      const nextDetailed = distance < limit;
      if (nextDetailed !== detailed) {
        detailed = nextDetailed;
        group.visible = detailed;
        for (const building of buildings) building.mesh.material = detailed ? building.detailedMaterials : building.coarseMaterials;
      }
    },
    dispose() {
      // Only release this neighborhood's resources, never shared original city
      // materials or colliders belonging to missions and other feature modules.
      const geometries = new Set(), materials = new Set([pavingMat]);
      group.traverse(o => { if (o.isMesh) { geometries.add(o.geometry); materials.add(o.material); } });
      for (const b of buildings) {
        for (const mat of b.detailedMaterials) materials.add(mat);
        b.mesh.material = b.coarseMaterials;
        delete b.detailedMaterials; delete b.coarseMaterials; delete b.style;
      }
      walks.forEach((w, i) => { w.mesh.material = originalWalkMaterials[i]; });
      const textures = new Set([bricks, stone]);
      for (const mat of materials) { if (mat.map) textures.add(mat.map); if (mat.emissiveMap) textures.add(mat.emissiveMap); mat.dispose(); }
      for (const geo of geometries) geo.dispose();
      for (const tex of textures) tex.dispose();
      for (let i = city.windowMats.length - 1; i >= 0; i--) if (addedWindows.has(city.windowMats[i])) city.windowMats.splice(i, 1);
      for (let i = city.colliders.length - 1; i >= 0; i--) if (addedColliders.has(city.colliders[i])) city.colliders.splice(i, 1);
      scene.remove(group);
    },
  };
}

// Nearby neighborhoods reuse the same kit. Bound the resident detail rather
// than constructing hundreds of thousands of facade pieces on initial load.
export function createDistrictManager(scene, city) {
  const areas = [];
  for (let bi = 0; bi < 10; bi += 2) for (let bj = 0; bj < 10; bj += 2) areas.push({ bi, bj, props: bi === 4 && bj === 4, key: `${bi}:${bj}`, x: (bi - 4) * 76, z: (bj - 4) * 76 });
  const active = new Map();
  active.set('4:4', buildSpawnDistrict(scene, city));
  let lastBuild = -Infinity;
  let lastCheck = -Infinity, lastX = Infinity, lastZ = Infinity, lastLow;
  return {
    get stats() {
      const totals = { buildings: 0, windows: 0, trees: 0, detailInstances: 0, detailBatches: 0, loadedDistricts: active.size, seed: 17623 };
      for (const district of active.values()) for (const key of ['buildings', 'windows', 'trees', 'detailInstances', 'detailBatches']) totals[key] += district.stats[key];
      return totals;
    },
    get group() { return active.get('4:4')?.group; },
    update(focus, lowGraphics = false) {
      const now = performance.now();
      // No per-frame allocations/sorting while standing still. A pending nearby
      // chunk still gets a chance to load, and moving checks run at most 5 Hz.
      if (lowGraphics === lastLow && now - lastCheck < 200) return;
      if (lowGraphics === lastLow && Math.hypot(focus.x - lastX, focus.z - lastZ) < 4 && now - lastCheck < 1000) return;
      lastCheck = now; lastX = focus.x; lastZ = focus.z; lastLow = lowGraphics;
      const maxLoaded = lowGraphics ? 2 : 4;
      const wanted = areas.map(a => ({ ...a, distance: Math.hypot(Math.max(0, Math.abs(focus.x - a.x) - 76), Math.max(0, Math.abs(focus.z - a.z) - 76)) }))
        .filter(a => a.distance < (lowGraphics ? 40 : 70)).sort((a, b) => a.distance - b.distance).slice(0, maxLoaded);
      const wantedKeys = new Set(wanted.map(a => a.key));
      for (const [key, district] of active) {
        if (!wantedKeys.has(key)) { district.dispose(); active.delete(key); }
        else district.update(focus, lowGraphics);
      }
      // At most one neighborhood is built per update, spaced apart while moving.
      const missing = wanted.find(a => !active.has(a.key));
      if (missing && performance.now() - lastBuild > 250) {
        active.set(missing.key, buildSpawnDistrict(scene, city, missing));
        lastBuild = performance.now();
      }
    },
  };
}
