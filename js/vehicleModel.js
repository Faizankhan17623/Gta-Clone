import * as THREE from 'three';

// Original sedan model, +Z forward, ground at Y=0. Geometry is shared between
// vehicles; paint and lamp materials remain local so damage/resprays stay local.
function hull(sections) {
  const vertices = [], indices = [], ring = 8;
  for (const s of sections) {
    const bevel = .055, topWidth = s.tw ?? s.w;
    const outline = [[-s.w + bevel, s.lo], [s.w - bevel, s.lo], [s.w, s.lo + bevel],
      [topWidth, s.hi - bevel], [topWidth - bevel, s.hi], [-topWidth + bevel, s.hi],
      [-topWidth, s.hi - bevel], [-s.w, s.lo + bevel]];
    for (const [x, y] of outline) vertices.push(x, y, s.z);
  }
  for (let r = 0; r < sections.length - 1; r++) for (let i = 0; i < ring; i++) {
    const a = r * ring + i, b = r * ring + (i + 1) % ring;
    indices.push(a, b, b + ring, a, b + ring, a + ring);
  }
  for (let i = 1; i < ring - 1; i++) {
    indices.push(0, i + 1, i);
    const end = (sections.length - 1) * ring;
    indices.push(end, end + i, end + i + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.setIndex(indices); geo.computeVertexNormals();
  return geo;
}

const bodyGeometry = hull([
  { z: -2.18, w: .84, lo: .4, hi: .73 }, { z: -1.85, w: .98, lo: .32, hi: .88 },
  { z: -1.12, w: 1, lo: .3, hi: .91 }, { z: .8, w: 1, lo: .3, hi: .91 },
  { z: 1.85, w: .94, lo: .36, hi: .77 }, { z: 2.18, w: .8, lo: .43, hi: .63 },
]);
const cabinGeometry = hull([
  { z: -1.4, w: .84, tw: .82, lo: .83, hi: .97 },
  { z: -.78, w: .86, tw: .68, lo: .86, hi: 1.52 },
  { z: .28, w: .86, tw: .68, lo: .86, hi: 1.52 },
  { z: 1.03, w: .82, tw: .8, lo: .84, hi: .98 },
]);
const box = new THREE.BoxGeometry(1, 1, 1);
const tyreGeometry = new THREE.CylinderGeometry(.36, .36, .28, 16);
tyreGeometry.rotateZ(Math.PI / 2);
const rimGeometry = new THREE.CylinderGeometry(.235, .235, .29, 12);
rimGeometry.rotateZ(Math.PI / 2);

// One mesh per material, rather than one draw call for each grille slat or trim.
function partsGeometry(parts) {
  const vertices = [], indices = [];
  const source = box.attributes.position;
  for (const p of parts) {
    const offset = vertices.length / 3;
    for (let i = 0; i < source.count; i++) vertices.push(source.getX(i) * p[3] + p[0], source.getY(i) * p[4] + p[1], source.getZ(i) * p[5] + p[2]);
    for (const i of box.index.array) indices.push(offset + i);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.setIndex(indices); geo.computeVertexNormals();
  return geo;
}

const paintParts = partsGeometry([
  [0, 1.52, -.24, 1.38, .075, 1.13], // roof
  [-.88, 1.04, -.18, .095, .36, .12], [.88, 1.04, -.18, .095, .36, .12], // B pillars
  [-1.03, 1.0, .64, .2, .13, .26], [1.03, 1.0, .64, .2, .13, .26], // mirrors
]);
const trimParts = partsGeometry([
  [0, .43, 2.1, 1.5, .15, .18], [0, .43, -2.15, 1.72, .17, .15],
  [-.994, .52, -.06, .035, .12, 3.1], [.994, .52, -.06, .035, .12, 3.1],
  [0, .64, 2.16, .74, .17, .05], // grille
  [-.97, .89, -.25, .07, .065, 2.2], [.97, .89, -.25, .07, .065, 2.2],
]);
const chromeParts = partsGeometry([
  ...[-1, 1].flatMap(side => [[side * 1.005, .82, .35, .03, .045, .23], [side * 1.005, .82, -.65, .03, .045, .23]]),
  [0, .66, 2.19, .69, .025, .03], [0, .6, 2.19, .69, .025, .03],
  [-1.14, 1.01, .64, .025, .09, .19], [1.14, 1.01, .64, .025, .09, .19],
]);
const headParts = partsGeometry([[-.59, .67, 2.095, .36, .12, .08], [.59, .67, 2.095, .36, .12, .08]]);
const tailParts = partsGeometry([[-.61, .72, -2.16, .39, .13, .065], [.61, .72, -2.16, .39, .13, .065]]);
const plateParts = partsGeometry([[0, .51, 2.21, .4, .105, .02], [0, .6, -2.225, .42, .115, .02]]);

export function createSedanMesh(color, { police = false } = {}) {
  const group = new THREE.Group(); group.name = 'Open City sedan';
  const paint = new THREE.MeshStandardMaterial({ color: police ? '#e0e2df' : color, metalness: .62, roughness: .3 });
  const glass = new THREE.MeshStandardMaterial({ color: '#283f4b', metalness: .55, roughness: .16 });
  const trim = new THREE.MeshStandardMaterial({ color: '#22282b', roughness: .75 });
  const chrome = new THREE.MeshStandardMaterial({ color: '#9ba6ab', metalness: .88, roughness: .24 });
  const rubber = new THREE.MeshStandardMaterial({ color: '#191b1d', roughness: .95 });
  const add = (geometry, mat, parent = group) => {
    const mesh = new THREE.Mesh(geometry, mat); mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  };
  const body = add(bodyGeometry, paint); body.name = 'paint-body';
  const cabin = add(cabinGeometry, glass); cabin.name = 'glazing';
  // Body and cabin retain their original root child indices.
  const detail = new THREE.Group(); detail.name = 'sedan trim'; group.add(detail);
  const extraPaint = add(paintParts, paint, detail); extraPaint.name = 'paint-trim';
  body.userData.respray = true; extraPaint.userData.respray = true;
  add(trimParts, trim, detail); add(chromeParts, chrome, detail);
  add(headParts, new THREE.MeshStandardMaterial({ color: '#e6e9d8', emissive: '#ffdeb0', emissiveIntensity: .45 }));
  const tailMaterial = new THREE.MeshStandardMaterial({ color: '#8e1720', emissive: '#ff1925', emissiveIntensity: .3 });
  add(tailParts, tailMaterial);
  add(plateParts, new THREE.MeshStandardMaterial({ color: '#d6d7cf', roughness: .65 }), detail);
  const wheels = [], rims = [];
  for (const [x, z] of [[-.95, 1.48], [.95, 1.48], [-.95, -1.48], [.95, -1.48]]) {
    const wheel = add(tyreGeometry, rubber); wheel.position.set(x, .36, z); wheel.rotation.order = 'YXZ';
    rims.push(add(rimGeometry, chrome, wheel)); wheels.push(wheel);
  }
  let lightbar = null;
  if (police) {
    add(partsGeometry([[-1.005, .7, -.12, .025, .21, 2.8], [1.005, .7, -.12, .025, .21, 2.8]]), trim, detail);
    const lamps = [-1, 1].map((side, i) => {
      const color = i ? '#2472ff' : '#f52f32';
      const lamp = add(box, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .8 }));
      lamp.position.set(side * .3, 1.64, -.24); lamp.scale.set(.49, .15, .28); return lamp;
    });
    lightbar = { red: lamps[0], blue: lamps[1] };
  }
  group.userData.modelDetail = { group: detail, rims, tailMaterial };
  return { group, wheels, lightbar };
}

export function updateVehicleDetail(vehicle, focus, lowGraphics, braking = false) {
  const detail = vehicle.mesh.userData.modelDetail;
  if (!detail) return;
  const distance = Math.hypot(vehicle.pos.x - focus.x, vehicle.pos.z - focus.z);
  const visible = distance < (lowGraphics ? 42 : 90);
  detail.group.visible = visible;
  for (const rim of detail.rims) rim.visible = visible;
  if (!vehicle.dead) detail.tailMaterial.emissiveIntensity = braking ? 2.2 : .3;
}
