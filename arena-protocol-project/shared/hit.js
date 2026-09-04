// Shared ray-vs-capsule hit test for authoritative hit detection (Step 72).
// Players are modeled as a vertical capsule: a segment from feet to head with a
// radius. We test the shot ray against each target's capsule (approximated as a
// vertical segment in world space) and return the closest hit within range.

const PLAYER_RADIUS = 0.5;
const PLAYER_BOTTOM = 0.0;
const PLAYER_TOP = 1.8;

// origin: {x,y,z}, dir: normalized {x,y,z}, target: {x,z} (capsule center column)
// Returns the ray distance to the hit, or null if no hit.
export function rayHitsPlayer(origin, dir, target, maxDist = 200) {
  // Closest approach between the ray and the target's vertical axis line.
  // We solve in 2D (XZ) for the ray vs. the infinite vertical column, then
  // verify the hit height is within the capsule's vertical extent.
  const ox = origin.x - target.x;
  const oz = origin.z - target.z;

  // Ray in XZ: P(t) = (ox,oz) + t*(dx,dz). Find t minimizing distance to origin column.
  const dx = dir.x;
  const dz = dir.z;
  const a = dx * dx + dz * dz;
  if (a < 1e-6) return null; // ray is vertical; ignore for simplicity

  const t = -(ox * dx + oz * dz) / a; // param of closest XZ approach
  if (t < 0 || t > maxDist) return null;

  // Distance from the column at the closest XZ point.
  const cx = ox + t * dx;
  const cz = oz + t * dz;
  const distXZ = Math.hypot(cx, cz);
  if (distXZ > PLAYER_RADIUS) return null;

  // Height of the ray at parameter t must fall within the capsule body.
  const hitY = origin.y + dir.y * t;
  if (hitY < PLAYER_BOTTOM - PLAYER_RADIUS || hitY > PLAYER_TOP + PLAYER_RADIUS) {
    return null;
  }

  return t; // ray distance to the hit
}

export const PLAYER_HITBOX = { PLAYER_RADIUS, PLAYER_BOTTOM, PLAYER_TOP };
