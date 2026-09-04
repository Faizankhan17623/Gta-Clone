import * as THREE from 'three';

// Steps 7 & 8: a single lit cube that we rotate to confirm rendering + animation.
// This is the Phase 1 checkpoint object; later phases can remove it.
export function createDemoCube(scene) {
  const geometry = new THREE.BoxGeometry(2, 2, 2);
  const material = new THREE.MeshStandardMaterial({ color: 0xff5533 });
  const cube = new THREE.Mesh(geometry, material);
  cube.position.set(0, 3, 0);
  cube.castShadow = true;
  cube.receiveShadow = true;
  scene.add(cube);
  return cube;
}
