import * as THREE from 'three';

// RACE GHOSTS: every finished street race leaves an echo. Your best run
// is recorded (a breadcrumb of positions) and replayed as a translucent
// blue car the next time you line up on the same course. Beat yourself.

const STEP = 0.4; // seconds between breadcrumbs
const KEYFOR = (def) => 'oc-ghost-' + (def.key ?? def.name ?? 'race');

export function initGhosts(scene, world) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(2, 1.1, 4),
    new THREE.MeshBasicMaterial({ color: 0x4ad2ff, transparent: true, opacity: 0.35, depthWrite: false })
  );
  mesh.visible = false;
  scene.add(mesh);
  world.ghosts = { mesh, wasActive: null, rec: [], recT: 0, play: null, playT: 0 };
}

export function updateGhosts(world, dt) {
  const gh = world.ghosts;
  const st = world.races;
  if (!gh || !st) return;
  const player = world.player;

  // race just started
  if (st.active && gh.wasActive !== st.active) {
    gh.wasActive = st.active;
    gh.rec = [];
    gh.recT = 0;
    gh.playT = 0;
    try {
      const raw = localStorage.getItem(KEYFOR(st.active));
      gh.play = raw ? JSON.parse(raw) : null;
    } catch { gh.play = null; }
    gh.mesh.visible = !!gh.play;
  }

  // race live: record yours, replay the echo
  if (st.active) {
    gh.recT += dt;
    if (gh.recT >= STEP && player.inCar) {
      gh.recT -= STEP;
      const p = player.inCar.pos;
      gh.rec.push([Math.round(p.x * 10) / 10, Math.round(p.z * 10) / 10, Math.round(player.inCar.heading * 100) / 100]);
      if (gh.rec.length > 600) gh.rec.shift(); // cap ~4 minutes
    }
    if (gh.play && gh.play.length > 1) {
      gh.playT += dt;
      const i = Math.min(gh.play.length - 2, Math.floor(gh.playT / STEP));
      const f = Math.min(1, gh.playT / STEP - i);
      const a = gh.play[i], b = gh.play[i + 1];
      gh.mesh.position.set(a[0] + (b[0] - a[0]) * f, 0.6, a[1] + (b[1] - a[1]) * f);
      gh.mesh.rotation.y = a[2];
      if (i >= gh.play.length - 2 && f >= 1) gh.mesh.visible = false; // the echo finished first
    }
    return;
  }

  // race just ended
  if (gh.wasActive && !st.active) {
    const def = gh.wasActive;
    gh.wasActive = null;
    gh.mesh.visible = false;
    // keep the shorter (faster) run as the ghost
    if (gh.rec.length > 5 && (!gh.play || gh.rec.length < gh.play.length)) {
      try { localStorage.setItem(KEYFOR(def), JSON.stringify(gh.rec)); } catch {}
    }
    gh.rec = [];
  }
}
