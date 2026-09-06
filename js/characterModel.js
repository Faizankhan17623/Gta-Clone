import * as THREE from 'three';

// Procedural articulated human. The old shoulder/hip handles and the first
// three root children are retained for gameplay, wardrobe and character swaps.
const sphere = new THREE.SphereGeometry(1, 12, 8);
const cylinder = new THREE.CylinderGeometry(1, .88, 1, 10);
const torsoGeometry = new THREE.CylinderGeometry(.27, .205, .62, 10);
const hairGeometry = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI * .55);
const box = new THREE.BoxGeometry(1, 1, 1);

export function createHumanRig({ shirt = '#ffffff', pants = '#2c3e66', skin = '#c98e63', hair = '#221a14' } = {}) {
  const group = new THREE.Group(); group.name = 'Open City articulated character';
  const makeMat = (color, roughness = .85) => new THREE.MeshStandardMaterial({ color, roughness });
  const palette = { shirt: makeMat(shirt), pants: makeMat(pants), skin: makeMat(skin, .72), hair: makeMat(hair), shoes: makeMat('#24272a'), eyes: makeMat('#1c1b19'), whites: makeMat('#c8c3b6') };
  const add = (parent, geo, mat, x, y, z, sx = 1, sy = 1, sz = 1) => {
    const mesh = new THREE.Mesh(geo, mat); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  const torso = add(group, torsoGeometry, palette.shirt, 0, 1.2, 0, 1, 1, .72);
  const head = add(group, sphere, palette.skin, 0, 1.74, .015, .155, .215, .17);
  const hairMesh = add(group, hairGeometry, palette.hair, 0, 1.755, .008, .163, .217, .179);
  torso.name = 'shirt'; head.name = 'head'; hairMesh.name = 'hair';

  function arm(side) {
    const pivot = new THREE.Group(); pivot.position.set(side * .315, 1.46, 0); group.add(pivot);
    add(pivot, cylinder, palette.skin, 0, -.15, 0, .085, .3, .085);
    add(pivot, cylinder, palette.shirt, 0, -.07, 0, .101, .17, .101);
    const elbow = new THREE.Group(); elbow.position.y = -.3; pivot.add(elbow);
    add(elbow, cylinder, palette.skin, 0, -.14, 0, .072, .28, .072);
    add(elbow, sphere, palette.skin, 0, -.3, .012, .068, .095, .05);
    return { pivot, elbow };
  }
  function leg(side) {
    const pivot = new THREE.Group(); pivot.position.set(side * .135, .9, 0); group.add(pivot);
    add(pivot, cylinder, palette.pants, 0, -.21, 0, .115, .42, .12);
    const knee = new THREE.Group(); knee.position.y = -.42; pivot.add(knee);
    add(knee, cylinder, palette.pants, 0, -.19, 0, .092, .38, .096);
    add(knee, box, palette.shoes, 0, -.42, .055, .19, .12, .31);
    return { pivot, knee };
  }
  const leftArm = arm(-1), rightArm = arm(1), leftLeg = leg(-1), rightLeg = leg(1);
  // These pieces share palette materials, so all skin/clothing recolors agree.
  add(group, cylinder, palette.skin, 0, 1.535, 0, .075, .14, .078);
  add(group, sphere, palette.pants, 0, .905, 0, .23, .13, .16);
  const detail = new THREE.Group(); detail.name = 'facial detail'; group.add(detail);
  for (const side of [-1, 1]) {
    add(detail, sphere, palette.skin, side * .155, 1.735, 0, .034, .058, .034);
    add(detail, sphere, palette.whites, side * .061, 1.77, .164, .036, .014, .008);
    add(detail, sphere, palette.eyes, side * .061, 1.77, .172, .012, .012, .005);
  }
  add(detail, sphere, palette.skin, 0, 1.715, .183, .028, .043, .044);
  add(detail, box, palette.hair, 0, 1.655, .164, .064, .009, .006);
  const rig = { group, lArm: leftArm.pivot, rArm: rightArm.pivot, lLeg: leftLeg.pivot, rLeg: rightLeg.pivot,
    lElbow: leftArm.elbow, rElbow: rightArm.elbow, lKnee: leftLeg.knee, rKnee: rightLeg.knee, palette, detail };
  resetArticulation(rig);
  return rig;
}

export function resetArticulation(ch) {
  if (!ch.lElbow) return;
  ch.lElbow.rotation.x = ch.rElbow.rotation.x = -.12;
  ch.lKnee.rotation.x = ch.rKnee.rotation.x = 0;
}

export function updateCharacterDetail(ch, focus, lowGraphics = false) {
  if (!ch?.detail) return;
  const p = ch.group.position;
  ch.detail.visible = Math.hypot(p.x - focus.x, p.z - focus.z) < (lowGraphics ? 16 : 35);
}
