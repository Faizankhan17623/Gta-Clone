// Instant Replay — a rolling buffer of the last ~20 seconds of play.
//
// Every frame we push a tiny snapshot (camera transform + a handful of moving
// object transforms). Press O to freeze the game and scrub that buffer with a
// free-fly camera; export it as a sequence you can turn into a clip, or just
// watch it back. Zero gameplay risk: recording is passive, playback is a
// frozen overlay like the pause menu.
//
// It does NOT rewind the simulation — only the visuals of tracked objects.
// Anything not tracked (distant traffic, particles) just holds its last pose.

import * as THREE from 'three';

const SECONDS = 20;
const HZ = 30;                 // snapshots per second (independent of frame rate)
const MAX = SECONDS * HZ;

let world, camera, renderer;
let buf = [];                  // ring of snapshots
let accum = 0;
let active = false;            // in playback mode
let playhead = 0;              // snapshot index while scrubbing
let playing = true;            // auto-advancing vs paused scrub
let onEnter, onExit;
let hud;
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

// The objects we snapshot each tick. Kept short so a snapshot is a few hundred
// bytes. `key` is stable across frames; `get` returns the live Object3D or null.
function trackedObjects() {
  const p = world.player;
  const list = [
    { key: 'player', obj: p.mesh },
    { key: 'cam', obj: camera },
  ];
  if (p.inCar) list.push({ key: 'car', obj: p.inCar.mesh });
  if (p.inHeli) list.push({ key: 'heli', obj: p.inHeli.mesh });
  if (p.inBoat) list.push({ key: 'boat', obj: p.inBoat.mesh });
  for (let i = 0; i < Math.min(8, world.cops.length); i++) {
    if (world.cops[i] && !world.cops[i].dead) list.push({ key: 'cop' + i, obj: world.cops[i].mesh });
  }
  for (let i = 0; i < Math.min(10, world.traffic.length); i++) {
    if (world.traffic[i]) list.push({ key: 'traf' + i, obj: world.traffic[i].mesh });
  }
  return list;
}

function snapshot() {
  const frame = { t: world.time, obj: {} };
  for (const { key, obj } of trackedObjects()) {
    if (!obj) continue;
    obj.updateWorldMatrix(true, false);
    obj.getWorldPosition(_v);
    obj.getWorldQuaternion(_q);
    frame.obj[key] = [
      +_v.x.toFixed(2), +_v.y.toFixed(2), +_v.z.toFixed(2),
      +_q.x.toFixed(3), +_q.y.toFixed(3), +_q.z.toFixed(3), +_q.w.toFixed(3),
    ];
  }
  return frame;
}

export function initReplay(w, cam, rend, hooks) {
  world = w; camera = cam; renderer = rend;
  onEnter = hooks.onEnter; onExit = hooks.onExit;
  buildHud();
}

// Called every gameplay frame from the main loop.
export function recordReplay(dt) {
  if (active) return;
  accum += dt;
  const step = 1 / HZ;
  while (accum >= step) {
    accum -= step;
    buf.push(snapshot());
    if (buf.length > MAX) buf.shift();
  }
}

export function replayActive() { return active; }

// Live transforms saved on open, restored on close — applyFrame() mutates the
// real Object3D transforms (and player.pos / v.pos are the SAME references),
// so without this, closing the replay would teleport everything to the last
// previewed frame.
let saved = null;

function stashLive() {
  saved = [];
  for (const { key, obj } of trackedObjects()) {
    if (!obj || key === 'cam') continue;
    saved.push({ obj, p: obj.position.clone(), q: obj.quaternion.clone() });
  }
}

function restoreLive() {
  if (!saved) return;
  for (const { obj, p, q } of saved) { obj.position.copy(p); obj.quaternion.copy(q); obj.updateMatrix(); }
  saved = null;
}

export function openReplay() {
  if (active || buf.length < HZ) return; // need at least a second of footage
  active = true;
  playhead = 0;
  playing = true;
  camInit = false; // free-cam re-seeds from the first snapshot
  stashLive();
  onEnter?.();
  hud.root.style.display = 'flex';
  applyFrame(buf[0]);
}

export function closeReplay() {
  if (!active) return;
  active = false;
  hud.root.style.display = 'none';
  restoreLive();
  onExit?.();
}

// Drive playback + the free camera. Called from the main loop while active.
// `input` = { keys, pressed, mouse }
export function updateReplay(dt, input) {
  if (!active) return;
  const { keys, pressed, mouse } = input;

  if (pressed['KeyO'] || pressed['Escape']) { closeReplay(); return; }
  if (pressed['Space']) playing = !playing;
  if (pressed['KeyR']) { playhead = 0; playing = true; }

  const last = buf.length - 1;
  if (playing) {
    playhead += dt * HZ;
    if (playhead >= last) { playhead = last; playing = false; }
  }
  // scrub with A/D or arrows while paused
  if (!playing) {
    if (keys['KeyD'] || keys['ArrowRight']) playhead = Math.min(last, playhead + dt * HZ * 2);
    if (keys['KeyA'] || keys['ArrowLeft']) playhead = Math.max(0, playhead - dt * HZ * 2);
  }

  const idx = Math.round(playhead);
  applyFrame(buf[idx]);
  freeCam(dt, keys, mouse, buf[idx]);

  hud.scrub.value = String((playhead / last) * 1000 | 0);
  hud.time.textContent = `${(idx / HZ).toFixed(1)}s / ${(last / HZ).toFixed(1)}s` + (playing ? '  ▶' : '  ❚❚');
}

// Put every tracked object where the snapshot says it was.
function applyFrame(frame) {
  if (!frame) return;
  for (const { key, obj } of trackedObjects()) {
    const rec = frame.obj[key];
    if (!obj || !rec || key === 'cam') continue;
    obj.position.set(rec[0], rec[1], rec[2]);
    obj.quaternion.set(rec[3], rec[4], rec[5], rec[6]);
    obj.updateMatrix();
  }
}

// A detached camera the viewer flies with WASD/mouse; starts from where the
// gameplay camera was at this snapshot, then the user takes over.
let camYaw = 0, camPitch = 0, camInit = false;
const camPos = new THREE.Vector3();
function freeCam(dt, keys, mouse, frame) {
  const rec = frame?.obj.cam;
  if (rec && !camInit) {
    camPos.set(rec[0], rec[1], rec[2]);
    _q.set(rec[3], rec[4], rec[5], rec[6]);
    const e = new THREE.Euler().setFromQuaternion(_q, 'YXZ');
    camYaw = e.y; camPitch = e.x;
    camInit = true;
  }
  camYaw -= (mouse.dx || 0) * 0.0022;
  camPitch = Math.max(-1.4, Math.min(1.4, camPitch - (mouse.dy || 0) * 0.0018));
  const dir = _v.set(
    Math.sin(camYaw) * Math.cos(camPitch),
    Math.sin(camPitch),
    Math.cos(camYaw) * Math.cos(camPitch)
  );
  const spd = (keys['ShiftLeft'] ? 46 : 18) * dt;
  if (keys['KeyW']) camPos.addScaledVector(dir, spd);
  if (keys['KeyS']) camPos.addScaledVector(dir, -spd);
  const right = new THREE.Vector3(Math.cos(camYaw), 0, -Math.sin(camYaw));
  if (keys['KeyD']) camPos.addScaledVector(right, -spd);
  if (keys['KeyA']) camPos.addScaledVector(right, spd);
  if (keys['KeyE']) camPos.y += spd * 0.7;
  if (keys['KeyQ']) camPos.y -= spd * 0.7;
  camPos.y = Math.max(0.5, camPos.y);
  camera.position.copy(camPos);
  camera.lookAt(camPos.clone().add(dir));
}

// ---------- export ----------
// The DOM sandbox blocks script-driven multi-file downloads, so we hand the
// viewer one JSON file with the whole buffer. A companion note explains it can
// be replayed here or fed to an offline renderer.
function exportBuffer() {
  const payload = {
    format: 'open-city-replay-v1',
    hz: HZ,
    recordedAt: new Date().toISOString(),
    frames: buf,
  };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(payload)], { type: 'application/json' }));
  a.download = `open-city-replay-${Date.now()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// Snap the currently-shown frame straight to a PNG via the shared capture path.
function exportStill() {
  world.captureNext = true;
}

function buildHud() {
  const root = document.createElement('div');
  root.id = 'replayui';
  root.style.cssText =
    'position:fixed;left:0;right:0;bottom:0;z-index:45;display:none;flex-direction:column;' +
    'align-items:center;gap:8px;padding:14px 0 18px;pointer-events:none;' +
    'background:linear-gradient(180deg,transparent,rgba(6,11,18,.82) 40%);';
  root.innerHTML =
    '<div style="font:900 13px Consolas,monospace;letter-spacing:.3em;color:#55e6ff">◀ INSTANT REPLAY ▶</div>' +
    '<div id="rp-time" style="font:700 12px Consolas,monospace;color:#eef4fb"></div>' +
    '<input id="rp-scrub" type="range" min="0" max="1000" value="0" ' +
    'style="pointer-events:auto;width:min(70vw,520px);accent-color:#55e6ff">' +
    '<div style="display:flex;gap:8px;pointer-events:auto">' +
    '<button id="rp-play" style="' + BTN + '">SPACE ▶/❚❚</button>' +
    '<button id="rp-restart" style="' + BTN + '">R RESTART</button>' +
    '<button id="rp-still" style="' + BTN + '">📸 STILL</button>' +
    '<button id="rp-export" style="' + BTN + '">⬇ EXPORT</button>' +
    '<button id="rp-close" style="' + BTN + ';background:#ff8a6a">O CLOSE</button>' +
    '</div>' +
    '<div style="font:600 10px Consolas,monospace;color:#9fb2c8;letter-spacing:.1em">' +
    'WASD + mouse fly the camera · E/Q up-down · Shift faster · A/D scrub when paused</div>';
  document.body.appendChild(root);
  hud = {
    root,
    scrub: root.querySelector('#rp-scrub'),
    time: root.querySelector('#rp-time'),
  };
  const last = () => buf.length - 1;
  hud.scrub.addEventListener('input', () => {
    playing = false;
    playhead = (hud.scrub.value / 1000) * last();
  });
  root.querySelector('#rp-play').onclick = () => { playing = !playing; };
  root.querySelector('#rp-restart').onclick = () => { playhead = 0; playing = true; };
  root.querySelector('#rp-still').onclick = exportStill;
  root.querySelector('#rp-export').onclick = exportBuffer;
  root.querySelector('#rp-close').onclick = closeReplay;
}

const BTN =
  'pointer-events:auto;cursor:pointer;font:800 11px Consolas,monospace;letter-spacing:.1em;' +
  'color:#06131a;background:#55e6ff;border:none;padding:9px 13px;' +
  'clip-path:polygon(6px 0,100% 0,100% calc(100% - 6px),calc(100% - 6px) 100%,0 100%,0 6px);';
