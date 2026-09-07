import * as THREE from 'three';

// Shared solid-world query for shoulder cameras and muzzle-origin fire.
export function solidDistance(origin, direction, colliders, range, padding = 0) {
  let nearest = range;
  for (const c of colliders) {
    let lo = 0, hi = nearest;
    for (const [axis, min, max] of [['x', c.x0 - padding, c.x1 + padding], ['y', (c.y0 ?? 0) - padding, c.h + padding], ['z', c.z0 - padding, c.z1 + padding]]) {
      if (Math.abs(direction[axis]) < 1e-8) {
        if (origin[axis] < min || origin[axis] > max) { hi = -1; break; }
      } else {
        const a = (min - origin[axis]) / direction[axis], b = (max - origin[axis]) / direction[axis];
        lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b));
      }
    }
    if (lo <= hi) nearest = Math.min(nearest, lo);
  }
  return nearest;
}

const box = new THREE.BoxGeometry(1, 1, 1);
const metal = new THREE.MeshStandardMaterial({ color: '#30363b', metalness: .7, roughness: .38 });
const grip = new THREE.MeshStandardMaterial({ color: '#191c20', roughness: .95 });
const flashMat = new THREE.MeshBasicMaterial({ color: '#ffda7a', transparent: true, opacity: .85 });
const flashGeo = new THREE.SphereGeometry(1, 6, 4);

// Replaceable placeholder models: +Z barrel axis, grip at local origin.
export function createWeaponModel(index = 0) {
  const group = new THREE.Group(); group.name = 'weapon';
  const part = (mat, x,y,z, sx,sy,sz) => {
    const m = new THREE.Mesh(box, mat); m.position.set(x,y,z); m.scale.set(sx,sy,sz); group.add(m); return m;
  };
  const long = index > 0 && index < 5;
  const length = long ? (index === 3 ? .95 : .7) : .3;
  if (index === 5) part(grip, 0,0,0, .12,.17,.12);
  else {
    part(metal, 0,.055,length*.3, .095,.10,length);
    part(grip, 0,-.085,0, .085,.20,.09);
    part(metal, 0,.07,length*.8, .045,.045,.12);
    if (long) {
      part(grip, 0,.015,-.22, .09,.14,.24);
      part(grip, 0,-.1,.18, .07,.23,.12);
    }
    if (index === 3) part(metal, 0,.15,.18, .055,.065,.28);
    if (index === 4) group.scale.set(1.65,1.65,1.2);
  }
  const muzzle = new THREE.Object3D(); muzzle.position.set(0,.07, index === 5 ? .1 : length*.8+.07); group.add(muzzle);
  const flash = new THREE.Mesh(flashGeo, flashMat); flash.scale.set(.07,.07,.16); muzzle.add(flash); flash.visible = false;
  return { group, muzzle, flash, index, kick: 0 };
}

export function equipCharacter(ch, index = 0) {
  if (ch.weapon?.index === index) return ch.weapon;
  if (ch.weapon) ch.weapon.group.removeFromParent();
  const weapon = createWeaponModel(index);
  weapon.group.position.set(0,-.30,.015);
  weapon.group.rotation.x = Math.PI / 2;
  (ch.rElbow || ch.rArm).add(weapon.group);
  ch.weapon = weapon;
  return weapon;
}

export function poseWeapon(ch, raised, recoil = 0) {
  if (!ch.weapon) return;
  if (raised) {
    ch.rArm.rotation.set(-Math.PI / 2 - recoil*.15, 0, 0);
    if (ch.rElbow) ch.rElbow.rotation.x = 0;
  }
}

export function muzzlePosition(ch, out = new THREE.Vector3()) {
  ch.group.updateWorldMatrix(true, true);
  return ch.weapon.muzzle.getWorldPosition(out);
}

export function enemyShot(ch, aim, city, addTracer, addFlash) {
  equipCharacter(ch);
  poseWeapon(ch, true);
  const from = muzzlePosition(ch), dir = aim.clone().sub(from);
  const length = dir.length(); dir.normalize();
  const distance = solidDistance(from, dir, city.colliders, length);
  addFlash(from, 0xffd080, .2);
  addTracer(from, from.clone().addScaledVector(dir, distance));
  return distance >= length - .01;
}
