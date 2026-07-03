import * as THREE from 'three';

// Spider-Man style web swinging: fire a strand at a building and pendulum
// around the anchor point; release to keep the momentum and fly.

// Tunable web stats — the upgrade den buffs these at runtime.
export const webCfg = {
  range: 110, // how far the web can reach — spans 2-3 buildings
  reel: 11,   // manual reel-in speed (m/s)
};
const MIN_ANCHOR_UP = 4;  // anchor must sit this far above the player
const G = 24;             // swing gravity, a touch heavier than the jump for punch

const _dir = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _toAnchor = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _cand = new THREE.Vector3();

export function initWeb(scene) {
  // thin pale strand, restretched every frame between hand and anchor
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 1, 5, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xf2f2ec })
  );
  mesh.visible = false;
  scene.add(mesh);
  return { mesh, attached: false, zip: false, attachT: 0, anchor: new THREE.Vector3(), len: 0, targetLen: 0, cooldown: 0, used: false };
}

// Ray vs one building AABB ({x0,z0,x1,z1,h}, y in 0..h) — slab method.
function rayBox(o, d, c) {
  let tmin = 0;
  let tmax = webCfg.range;
  let lo;
  let hi;

  if (Math.abs(d.x) < 1e-8) { if (o.x < c.x0 || o.x > c.x1) return Infinity; }
  else {
    lo = (c.x0 - o.x) / d.x;
    hi = (c.x1 - o.x) / d.x;
    tmin = Math.max(tmin, Math.min(lo, hi));
    tmax = Math.min(tmax, Math.max(lo, hi));
  }
  if (Math.abs(d.y) < 1e-8) { if (o.y < 0 || o.y > c.h) return Infinity; }
  else {
    lo = -o.y / d.y;
    hi = (c.h - o.y) / d.y;
    tmin = Math.max(tmin, Math.min(lo, hi));
    tmax = Math.min(tmax, Math.max(lo, hi));
  }
  if (Math.abs(d.z) < 1e-8) { if (o.z < c.z0 || o.z > c.z1) return Infinity; }
  else {
    lo = (c.z0 - o.z) / d.z;
    hi = (c.z1 - o.z) / d.z;
    tmin = Math.max(tmin, Math.min(lo, hi));
    tmax = Math.min(tmax, Math.max(lo, hi));
  }
  return tmin <= tmax ? tmin : Infinity;
}

// Cast a fan of rays around the crosshair (upward tilts + slight side sweeps)
// and pick the anchor best suited for travel: high AND ahead of the player,
// so swinging down a street latches onto the buildings flanking it.
export function fireWeb(web, player, camera, colliders) {
  camera.getWorldDirection(_dir);
  const baseYaw = Math.atan2(_dir.x, _dir.z);
  const aimPitch = Math.asin(Math.max(-1, Math.min(1, _dir.y)));
  _origin.copy(player.pos);
  _origin.y += 1.6;

  let bestScore = -Infinity;
  for (const dYaw of [0, -0.35, 0.35]) {
    const yaw = baseYaw + dYaw;
    for (const pitch of [aimPitch, 0.35, 0.65, 0.95]) {
      _dir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      let bestT = webCfg.range;
      for (const c of colliders) {
        if ((c.h ?? 0) < 10) continue; // buildings only — no trees
        const t = rayBox(_origin, _dir, c);
        if (t < bestT) bestT = t;
      }
      if (bestT >= webCfg.range) continue;
      _cand.copy(_origin).addScaledVector(_dir, bestT);
      if (_cand.y < player.pos.y + MIN_ANCHOR_UP) continue;
      const ahead = Math.hypot(_cand.x - player.pos.x, _cand.z - player.pos.z);
      // favor tall anchors far ahead: long ropes make wide multi-building arcs
      const score = _cand.y * 1.3 + ahead * 0.8 - Math.abs(dYaw) * 10;
      if (score > bestScore) {
        bestScore = score;
        web.anchor.copy(_cand);
      }
    }
  }
  if (bestScore === -Infinity) return false;

  web.len = Math.max(5, web.anchor.distanceTo(_origin) * 0.96); // slightly taut
  // winch toward a length that keeps the arc bottom off the asphalt — done
  // gradually in swingStep, never as an instant snap
  web.targetLen = Math.min(web.len, Math.max(6, web.anchor.y - 3.2));
  web.attached = true;
  web.mesh.visible = true;
  return true;
}

export function releaseWeb(web) {
  web.attached = false;
  web.zip = false;
  web.mesh.visible = false;
}

// One physics step of the pendulum: air control, gravity, reel, rope constraint.
export function swingStep(web, pos, vel, dt, ctl) {
  vel.x += ctl.move.x * 10 * dt;
  vel.z += ctl.move.z * 10 * dt;
  vel.y -= G * dt;

  // auto-winch: rise smoothly toward street-clearing rope length
  if (web.len > web.targetLen) web.len = Math.max(web.targetLen, web.len - 14 * dt);
  if (ctl.reelIn) {
    web.len = Math.max(4, web.len - webCfg.reel * dt);
    web.targetLen = Math.min(web.targetLen, web.len);
  }
  if (ctl.reelOut) {
    web.len = Math.min(webCfg.range, web.len + 9 * dt);
    web.targetLen = Math.max(web.targetLen, web.len);
  }

  pos.addScaledVector(vel, dt);

  _toAnchor.subVectors(pos, web.anchor);
  const d = _toAnchor.length();
  if (d > web.len && d > 1e-4) {
    _toAnchor.multiplyScalar(1 / d);
    pos.copy(web.anchor).addScaledVector(_toAnchor, web.len);
    const vr = vel.dot(_toAnchor);
    if (vr > 0) vel.addScaledVector(_toAnchor, -vr); // keep only the tangent part

    // Spidey pump: while hanging below the anchor, push along the direction
    // of travel so every swing gains speed — this is what carries you
    // across the city instead of leaving you dangling
    const hsp = Math.hypot(vel.x, vel.z);
    if (hsp > 2 && hsp < 40 && pos.y < web.anchor.y - 2) {
      const boost = ctl.pump ? 18 : 8; // much stronger while holding W
      vel.x += (vel.x / hsp) * boost * dt;
      vel.z += (vel.z / hsp) * boost * dt;
    }
  }
  vel.multiplyScalar(Math.max(0, 1 - 0.04 * dt)); // faint air drag

  // hard safety cap
  const sp = vel.length();
  if (sp > 55) vel.multiplyScalar(55 / sp);
}

// Stretch the strand between the player's hand and the anchor.
export function updateWebVisual(web, hand) {
  _mid.addVectors(hand, web.anchor).multiplyScalar(0.5);
  web.mesh.position.copy(_mid);
  web.mesh.scale.y = Math.max(0.1, hand.distanceTo(web.anchor));
  web.mesh.lookAt(web.anchor);
  web.mesh.rotateX(Math.PI / 2);
}

// web arm up, legs trailing behind
export function poseSwing(ch, t) {
  ch.rArm.rotation.x = Math.PI;
  ch.lArm.rotation.x = -0.6 + Math.sin(t * 2.2) * 0.15;
  ch.lLeg.rotation.x = 0.5 + Math.sin(t * 3) * 0.12;
  ch.rLeg.rotation.x = 0.15 + Math.cos(t * 3) * 0.12;
}

export function poseFall(ch) {
  ch.lArm.rotation.x = -0.9;
  ch.rArm.rotation.x = -0.9;
  ch.lLeg.rotation.x = 0.45;
  ch.rLeg.rotation.x = -0.25;
}
