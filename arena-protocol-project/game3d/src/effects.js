import * as THREE from 'three';

// Step 36: bullet tracer — a brief glowing line from muzzle to hit point.
// Step 33: hit marker — a small crosshair flash on the HUD when you land a hit.
export function createEffects(scene) {
  const tracers = []; // { line, life }
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffee88, transparent: true });

  function spawnTracer(from, to) {
    const geometry = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const line = new THREE.Line(geometry, tracerMat.clone());
    scene.add(line);
    tracers.push({ line, life: 0.08 });
  }

  // A small impact puff at the hit point.
  function spawnImpact(point) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true });
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), mat);
    puff.position.copy(point);
    scene.add(puff);
    tracers.push({ line: puff, life: 0.12, isPuff: true });
  }

  function update(delta) {
    for (let i = tracers.length - 1; i >= 0; i--) {
      const t = tracers[i];
      t.life -= delta;
      const obj = t.line;
      obj.material.opacity = Math.max(0, t.life / 0.1);
      if (t.isPuff) obj.scale.multiplyScalar(1 + delta * 6);
      if (t.life <= 0) {
        scene.remove(obj);
        obj.geometry.dispose();
        obj.material.dispose();
        tracers.splice(i, 1);
      }
    }
  }

  return { spawnTracer, spawnImpact, update };
}

// Step 33 (HUD side): flash the crosshair when a hit lands.
export function hitMarker() {
  const ch = document.getElementById('crosshair');
  if (!ch) return;
  ch.classList.add('hit');
  setTimeout(() => ch.classList.remove('hit'), 90);
}
