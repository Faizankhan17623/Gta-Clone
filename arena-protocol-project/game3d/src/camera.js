import * as THREE from 'three';

// Step 6: PerspectiveCamera.
export function createCamera() {
  const camera = new THREE.PerspectiveCamera(
    75, // field of view
    window.innerWidth / window.innerHeight, // aspect ratio
    0.1, // near clip
    1000 // far clip
  );
  // Stand a bit back and at roughly eye height so the scene is visible.
  camera.position.set(0, 2, 8);
  camera.lookAt(0, 1, 0);
  return camera;
}
