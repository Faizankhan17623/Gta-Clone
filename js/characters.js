import * as THREE from 'three';

const SHIRTS = ['#7a2a22', '#8c8c84', '#2a4a6a', '#9a8a3a', '#5a3a6a', '#2a6a5a', '#8a5222', '#23303d', '#6a3a4a'];
const PANTS = ['#22304d', '#28333d', '#181f28', '#43302a', '#33333a', '#1f2566'];
const SKINS = ['#c98e63', '#8d5a3a', '#e6b88f', '#6b4226', '#d9a06e'];

export function randomOutfit() {
  return {
    shirt: SHIRTS[(Math.random() * SHIRTS.length) | 0],
    pants: PANTS[(Math.random() * PANTS.length) | 0],
    skin: SKINS[(Math.random() * SKINS.length) | 0],
  };
}

// Blocky GTA-style character, feet at y=0, facing +z.
export function createCharacter({ shirt = '#ffffff', pants = '#2c3e66', skin = '#c98e63', hair = '#221a14' } = {}) {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.7, 0.34), mat(shirt));
  torso.position.y = 1.17;
  torso.castShadow = true;
  g.add(torso);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), mat(skin));
  head.position.y = 1.74;
  head.castShadow = true;
  g.add(head);

  const hairMesh = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.36), mat(hair));
  hairMesh.position.y = 1.95;
  g.add(hairMesh);

  function limb(w, len, color, x, y) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, w), mat(color));
    m.position.y = -len / 2;
    m.castShadow = true;
    pivot.add(m);
    g.add(pivot);
    return pivot;
  }

  const lArm = limb(0.18, 0.66, skin, -0.4, 1.48);
  const rArm = limb(0.18, 0.66, skin, 0.4, 1.48);
  const lLeg = limb(0.22, 0.8, pants, -0.17, 0.82);
  const rLeg = limb(0.22, 0.8, pants, 0.17, 0.82);

  return { group: g, lArm, rArm, lLeg, rLeg };
}

// Recolor an existing character — used by the wardrobe suits.
export function applySuit(ch, { shirt, pants, skin, hair }) {
  const g = ch.group;
  const set = (mesh, c) => { if (c) mesh.material.color.set(c); };
  set(g.children[0], shirt);          // torso
  set(g.children[1], skin);           // head
  set(g.children[2], hair ?? '#221a14'); // hair
  set(ch.lArm.children[0], skin);
  set(ch.rArm.children[0], skin);
  set(ch.lLeg.children[0], pants);
  set(ch.rLeg.children[0], pants);
}

export function animateWalk(ch, t, amp) {
  const s = Math.sin(t) * amp;
  ch.lLeg.rotation.x = s;
  ch.rLeg.rotation.x = -s;
  ch.lArm.rotation.x = -s * 0.8;
  ch.rArm.rotation.x = s * 0.8;
}

export function animateIdle(ch) {
  ch.lLeg.rotation.x = 0;
  ch.rLeg.rotation.x = 0;
  ch.lArm.rotation.x = 0;
  ch.rArm.rotation.x = 0;
}
