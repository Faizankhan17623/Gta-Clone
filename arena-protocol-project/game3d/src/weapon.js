import * as THREE from 'three';

// Step 31: a gun model in front of the camera. Built from primitives (a
// placeholder low-poly gun) so no asset download is required. Parented to the
// camera so it stays in view as you look around.
// Step 33: muzzle flash. Step 49: recoil kick on shoot.
export function createWeapon(camera) {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.5 });

  // Receiver / body.
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.5), bodyMat);
  body.position.set(0, 0, -0.25);
  group.add(body);

  // Barrel.
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.4), accentMat);
  barrel.position.set(0, 0.02, -0.55);
  group.add(barrel);

  // Grip.
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.1), bodyMat);
  grip.position.set(0, -0.13, -0.05);
  grip.rotation.x = 0.3;
  group.add(grip);

  // Step 33: muzzle flash — a small emissive plane at the barrel tip, hidden by default.
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffdd66, transparent: true, opacity: 0.9, side: THREE.DoubleSide,
  });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.25), flashMat);
  flash.position.set(0, 0.02, -0.78);
  flash.visible = false;
  group.add(flash);

  // Position the whole weapon in the lower-right of the view (hip/ADS-ish).
  group.position.set(0.18, -0.18, -0.3);
  camera.add(group);

  // Recoil state — the group kicks back and settles each frame.
  let recoil = 0;
  const baseZ = group.position.z;

  function showFlash() {
    flash.visible = true;
    flash.rotation.z = Math.random() * Math.PI; // vary the look
    setTimeout(() => { flash.visible = false; }, 45);
  }

  // Step 49: recoil kick applied on shoot.
  function kick() {
    recoil = 0.06;
    showFlash();
  }

  function update(delta) {
    // Ease recoil back to zero.
    recoil = THREE.MathUtils.damp(recoil, 0, 12, delta);
    group.position.z = baseZ + recoil;
    group.rotation.x = recoil * 1.5;
  }

  // World-space muzzle position (for spawning tracers).
  const muzzleLocal = new THREE.Vector3(0, 0.02, -0.78);
  function getMuzzleWorld(target) {
    return group.localToWorld(target.copy(muzzleLocal));
  }

  function setColor(color) { bodyMat.color.setHex(color); }
  return { group, kick, update, getMuzzleWorld, setColor };
}
