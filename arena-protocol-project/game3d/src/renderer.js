import * as THREE from 'three';

// Step 6: WebGLRenderer attached to the canvas.
// Step 17: shadows enabled.
export function createRenderer() {
  const canvas = document.getElementById('app');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // Step 17: enable shadow mapping.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  return renderer;
}
