import * as THREE from 'three';

// Step 25: collision so you can't walk through walls/obstacles.
// We model the player as a vertical cylinder (a circle of `radius` in the XZ
// plane) and resolve overlap against each obstacle's axis-aligned bounding box.
// This is simpler and more stable than raycasting for box-shaped cover.
export function createCollider(obstacles, { radius = 0.4 } = {}) {
  // Precompute each obstacle's world AABB once (obstacles are static).
  const boxes = obstacles.map((mesh) => new THREE.Box3().setFromObject(mesh));

  // Given a desired new XZ position, push it out of any box it overlaps.
  // Returns a corrected { x, z }. Y (vertical) is handled separately by gravity.
  function resolveXZ(x, z) {
    for (const box of boxes) {
      // Closest point on the box (in XZ) to the player center.
      const closestX = Math.max(box.min.x, Math.min(x, box.max.x));
      const closestZ = Math.max(box.min.z, Math.min(z, box.max.z));

      const dx = x - closestX;
      const dz = z - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < radius * radius) {
        const dist = Math.sqrt(distSq) || 0.00001;
        // Push the player out along the shortest direction.
        if (dist > 0.00001) {
          const push = (radius - dist) / dist;
          x += dx * push;
          z += dz * push;
        } else {
          // Center is inside the box: push out along the nearest face.
          const left = Math.abs(x - box.min.x);
          const right = Math.abs(box.max.x - x);
          const back = Math.abs(z - box.min.z);
          const front = Math.abs(box.max.z - z);
          const minPen = Math.min(left, right, back, front);
          if (minPen === left) x = box.min.x - radius;
          else if (minPen === right) x = box.max.x + radius;
          else if (minPen === back) z = box.min.z - radius;
          else z = box.max.z + radius;
        }
      }
    }
    return { x, z };
  }

  return { resolveXZ, boxes };
}
