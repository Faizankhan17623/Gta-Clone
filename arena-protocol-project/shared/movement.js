// Shared movement physics — used by BOTH the client (prediction) and the
// server (authority) so they produce identical results (Steps 63-65).
//
// Deterministic given the same input + dt. Operates on a flat {x, z, ry} state.
// Vertical/jump is kept client-side for feel; the server is authoritative for
// the horizontal plane, which is what matters for hit detection (Phase 8).

export const MOVE = {
  WALK_SPEED: 26,
  SPRINT_SPEED: 30,
};

// input: { forward, back, left, right, sprint, yaw, dt }
//   yaw  = the player's facing angle (radians) at the time of the input
//   dt   = seconds this input covers
// Returns the new { x, z } (caller keeps ry = yaw).
export function applyInput(state, input) {
  const speed = input.sprint ? MOVE.SPRINT_SPEED : MOVE.WALK_SPEED;

  // Forward/right unit vectors on the ground plane derived from yaw.
  // yaw is atan2(dir.x, dir.z): forward = (sin yaw, cos yaw).
  const fx = Math.sin(input.yaw);
  const fz = Math.cos(input.yaw);
  // Right = up × forward  ->  (fz, -fx) in the XZ plane.
  const rx = fz;
  const rz = -fx;

  let mx = 0, mz = 0;
  if (input.forward) { mx += fx; mz += fz; }
  if (input.back)    { mx -= fx; mz -= fz; }
  if (input.right)   { mx += rx; mz += rz; }
  if (input.left)    { mx -= rx; mz -= rz; }

  const len = Math.hypot(mx, mz);
  if (len > 0) {
    mx = (mx / len) * speed * input.dt;
    mz = (mz / len) * speed * input.dt;
  }

  return { x: state.x + mx, z: state.z + mz };
}
