import * as THREE from 'three';

// Phase 7 — smooth remote players via ENTITY INTERPOLATION with a render delay.
// Step 61: interpolate between buffered snapshots so others move smoothly.
// Step 67: rendering ~100ms in the past tolerates jitter and minor packet loss
//          (we always have two snapshots to interpolate between).
//
// Each avatar keeps a small buffer of timestamped states {t, x, z, ry}. Every
// frame we pick a render time = now - RENDER_DELAY and find the two states that
// bracket it, then lerp between them.
const RENDER_DELAY = 100; // ms behind real time
const BUFFER_MS = 1000;   // keep at most ~1s of history

export function createRemotePlayers(scene) {
  const avatars = new Map(); // id -> { group, buffer: [{t,x,z,ry}], color }

  function makeAvatar(p) {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: p.color ?? 0x4f9dff });

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.0, 4, 8), mat);
    body.castShadow = true;
    body.position.y = 0.9;
    group.add(body);

    const nose = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.15, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x222222 })
    );
    nose.position.set(0, 1.2, -0.45);
    group.add(nose);

    group.position.set(p.x, 0, p.z);
    group.rotation.y = p.ry ?? 0;
    scene.add(group);

    avatars.set(p.id, {
      group,
      color: p.color,
      buffer: [{ t: performance.now(), x: p.x, z: p.z, ry: p.ry ?? 0 }],
    });
  }

  function add(p) {
    if (!avatars.has(p.id)) makeAvatar(p);
  }

  function remove(id) {
    const a = avatars.get(id);
    if (!a) return;
    scene.remove(a.group);
    a.group.traverse((o) => {
      if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); }
    });
    avatars.delete(id);
  }

  // Push a new authoritative state into each avatar's buffer.
  // `serverTime` is the timestamp the server stamped on the snapshot.
  function applySnapshot(players, selfId, serverTime) {
    const now = performance.now();
    const seen = new Set();

    for (const p of players) {
      if (p.id === selfId) continue;
      seen.add(p.id);
      if (!avatars.has(p.id)) makeAvatar(p);
      const a = avatars.get(p.id);

      // We index the buffer by local arrival time; the render delay smooths
      // over the fact that arrivals aren't perfectly spaced.
      a.buffer.push({ t: now, x: p.x, z: p.z, ry: p.ry ?? 0 });

      // Trim old history.
      const cutoff = now - BUFFER_MS;
      while (a.buffer.length > 2 && a.buffer[0].t < cutoff) a.buffer.shift();
    }

    for (const id of [...avatars.keys()]) {
      if (!seen.has(id)) remove(id);
    }
  }

  // Step 61: interpolate each avatar to (now - RENDER_DELAY).
  function update() {
    const renderTime = performance.now() - RENDER_DELAY;

    for (const a of avatars.values()) {
      const buf = a.buffer;
      if (buf.length === 0) continue;

      // Find the two states that bracket renderTime.
      let older = buf[0];
      let newer = buf[buf.length - 1];
      for (let i = 0; i < buf.length - 1; i++) {
        if (buf[i].t <= renderTime && buf[i + 1].t >= renderTime) {
          older = buf[i];
          newer = buf[i + 1];
          break;
        }
      }

      if (renderTime <= buf[0].t) {
        // Not enough history yet: sit at the oldest known state.
        place(a, buf[0]);
      } else if (renderTime >= newer.t) {
        // Step 67: no newer data (packet gap) — hold at the last known state.
        place(a, newer);
      } else {
        const span = newer.t - older.t || 1;
        const f = (renderTime - older.t) / span;
        a.group.position.x = older.x + (newer.x - older.x) * f;
        a.group.position.z = older.z + (newer.z - older.z) * f;
        a.group.rotation.y = lerpAngle(older.ry, newer.ry, f);
      }
    }
  }

  function place(a, s) {
    a.group.position.x = s.x;
    a.group.position.z = s.z;
    a.group.rotation.y = s.ry;
  }

  function clear() {
    for (const id of [...avatars.keys()]) remove(id);
  }

  return { add, remove, applySnapshot, update, clear, get count() { return avatars.size; } };
}

// Interpolate between two angles taking the shortest path (avoids spin-around).
function lerpAngle(a, b, t) {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}
