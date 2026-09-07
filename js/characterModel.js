import * as THREE from 'three';

// Procedural articulated human. The old shoulder/hip handles and the first
// three root children are retained for gameplay, wardrobe and character swaps.
//
// Limbs are capsules (rounded ends) rather than hard cylinders so joints read
// as anatomy; the torso tapers from shoulders to waist; the head has a slight
// jaw. Same rig groups (lArm/rArm/lLeg/rLeg + elbow/knee), same first three
// root children (torso -> head -> hair), so wardrobe and swaps are unchanged.
const sphere = new THREE.SphereGeometry(1, 16, 12);
const cylinder = new THREE.CylinderGeometry(1, .88, 1, 10);
const capsule = new THREE.CapsuleGeometry(1, 1.1, 4, 12); // r=1, straight section 1.1
const torsoGeometry = (() => {
  // Lathe a rounded torso: narrow waist, broader chest, soft shoulders.
  const pts = [
    new THREE.Vector2(0.001, -0.34),
    new THREE.Vector2(0.19, -0.33),
    new THREE.Vector2(0.205, -0.12),
    new THREE.Vector2(0.235, 0.10),
    new THREE.Vector2(0.27, 0.24),
    new THREE.Vector2(0.255, 0.30),
    new THREE.Vector2(0.001, 0.31),
  ];
  const g = new THREE.LatheGeometry(pts, 16);
  g.computeVertexNormals();
  return g;
})();
const hairGeometry = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI * .58);
const box = new THREE.BoxGeometry(1, 1, 1);
const shoeGeometry = (() => {
  const g = new THREE.CapsuleGeometry(0.5, 1.0, 3, 8);
  g.rotateX(Math.PI / 2);
  g.scale(1, 0.62, 1);
  return g;
})();

export function createHumanRig({ shirt = '#ffffff', pants = '#2c3e66', skin = '#c98e63', hair = '#221a14' } = {}) {
  const group = new THREE.Group(); group.name = 'Open City articulated character';
  const makeMat = (color, roughness = .85) => new THREE.MeshStandardMaterial({ color, roughness });
  const palette = { shirt: makeMat(shirt), pants: makeMat(pants), skin: makeMat(skin, .68), hair: makeMat(hair), shoes: makeMat('#24272a', .6), eyes: makeMat('#1c1b19'), whites: makeMat('#c8c3b6') };
  const add = (parent, geo, mat, x, y, z, sx = 1, sy = 1, sz = 1) => {
    const mesh = new THREE.Mesh(geo, mat); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  const torso = add(group, torsoGeometry, palette.shirt, 0, 1.24, 0, 1, 1, .74);
  const head = add(group, sphere, palette.skin, 0, 1.75, .015, .143, .175, .152);
  const hairMesh = add(group, hairGeometry, palette.hair, 0, 1.762, .006, .152, .181, .166);
  torso.name = 'shirt'; head.name = 'head'; hairMesh.name = 'hair';
  // slight jaw / chin under the head sphere
  add(group, sphere, palette.skin, 0, 1.688, .028, .112, .10, .123);

  function arm(side) {
    const pivot = new THREE.Group(); pivot.position.set(side * .315, 1.46, 0); group.add(pivot);
    // child[0] is the skin part (applySuit recolors it); the sleeve sits over it.
    add(pivot, capsule, palette.skin, 0, -.19, 0, .07, .085, .07);
    add(pivot, capsule, palette.shirt, 0, -.1, 0, .088, .12, .088); // sleeve
    const elbow = new THREE.Group(); elbow.position.y = -.3; pivot.add(elbow);
    add(elbow, capsule, palette.skin, 0, -.13, 0, .062, .11, .062);
    // hand
    add(elbow, sphere, palette.skin, 0, -.31, .01, .062, .078, .05);
    add(elbow, box, palette.skin, 0, -.34, .012, .09, .09, .055);
    return { pivot, elbow };
  }
  function leg(side) {
    const pivot = new THREE.Group(); pivot.position.set(side * .135, .9, 0); group.add(pivot);
    // child[0] is the thigh (applySuit recolors it to the trouser colour).
    add(pivot, capsule, palette.pants, 0, -.2, 0, .108, .16, .112);
    const knee = new THREE.Group(); knee.position.y = -.42; pivot.add(knee);
    add(knee, capsule, palette.pants, 0, -.18, 0, .088, .15, .092);
    add(knee, shoeGeometry, palette.shoes, 0, -.4, .07, .12, .12, .19);
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
