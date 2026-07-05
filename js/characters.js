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

// Playable roster: pick one at the start screen. Each tweaks the feel.
export const CHARACTERS = [
  {
    key: 'web', name: 'WEAVER', tagline: 'Balanced all-rounder',
    colors: { shirt: '#c1121f', pants: '#1f3fa8', skin: '#c98e63' },
    speed: 1, health: 100, jump: 1, webReel: 1,
  },
  {
    key: 'dash', name: 'BOLT', tagline: 'Fast & agile, glass cannon',
    colors: { shirt: '#f5a800', pants: '#2a2a30', skin: '#8d5a3a' },
    speed: 1.25, health: 80, jump: 1.15, webReel: 1.2,
  },
  {
    key: 'tank', name: 'BRICK', tagline: 'Tough bruiser, hits hard',
    colors: { shirt: '#2a6a5a', pants: '#181f28', skin: '#6b4226' },
    speed: 0.85, health: 150, jump: 0.9, webReel: 0.85, melee: 1.6,
  },
];

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
  const c = Math.cos(t * 2) * amp; // knee/elbow bend at twice the stride
  ch.lLeg.rotation.x = s;
  ch.rLeg.rotation.x = -s;
  ch.lArm.rotation.x = -s * 0.85;
  ch.rArm.rotation.x = s * 0.85;
  // subtle counter-rotation and bob so it reads as real running
  ch.lArm.rotation.z = 0.08;
  ch.rArm.rotation.z = -0.08;
  const g = ch.group;
  g.position.y = (g.userData.baseY || 0) + Math.abs(c) * 0.06 * amp;
  g.rotation.z = Math.sin(t) * 0.04 * amp; // slight torso sway
}

export function animateIdle(ch) {
  const g = ch.group;
  const t = (performance.now() * 0.001);
  // breathing sway instead of a dead-still statue
  const b = Math.sin(t * 1.6) * 0.03;
  ch.lLeg.rotation.x = 0;
  ch.rLeg.rotation.x = 0;
  ch.lArm.rotation.x = b;
  ch.rArm.rotation.x = -b;
  ch.lArm.rotation.z = 0.06;
  ch.rArm.rotation.z = -0.06;
  g.rotation.z = Math.sin(t * 0.8) * 0.012;
  g.position.y = (g.userData.baseY || 0) + Math.sin(t * 1.6) * 0.015;
}

// Landing crouch: absorb impact, spring back. p goes 0 (deep) -> 1 (stood).
export function animateLand(ch, p) {
  const dip = (1 - p) * 0.6;
  ch.lLeg.rotation.x = dip;
  ch.rLeg.rotation.x = dip;
  ch.lArm.rotation.x = -dip * 0.7;
  ch.rArm.rotation.x = -dip * 0.7;
  ch.group.position.y = (ch.group.userData.baseY || 0) - dip * 0.35;
}
