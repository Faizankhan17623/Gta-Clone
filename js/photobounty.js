// Photo challenges — rotating "photograph X" bounties that pay out.
//
// A board near spawn (reusing the news-kiosk pattern) lists up to 3 active
// targets: a landmark, an event (the kaiju, a police chopper, a 5-star chase),
// or a condition ("a wreck on fire", "a selfie at night"). When you take a
// photo (G / the existing capture path) with the subject in frame, it pays and
// rotates in a new one. Best captures are remembered for the day.
//
// Uses the existing photo capture (`world.captureNext`) — this module watches
// for the frame it fires on and tests the camera frustum. No other module
// changes; it only needs the camera passed in.

import * as THREE from 'three';
import { showToast } from './hud.js';

let world, camera;
let board = null;              // the pickup/marker in the world
const _frustum = new THREE.Frustum();
const _mat = new THREE.Matrix4();
const _p = new THREE.Vector3();
let armedPrev = false;

// Target definitions. `visible(world)` says whether it can currently be shot;
// `at(world)` returns the world position to frame (or null to use a flag).
function lm(w, name) {
  const m = (w._photoLandmarks || []).find((x) => x.name === name);
  return m ? m.pos : null;
}

const CATALOG = [
  { id: 'spire',   name: 'the Spire at its full height', pay: 400,
    visible: () => true, at: (w) => lm(w, 'THE SPIRE') },
  { id: 'stadium', name: 'the stadium from outside', pay: 350,
    visible: () => true, at: (w) => lm(w, 'THE STADIUM') },
  { id: 'park',    name: 'the central park fountain', pay: 300,
    visible: () => true, at: (w) => lm(w, 'CENTRAL PARK') },
  { id: 'harbor',  name: 'a boat out on the harbor', pay: 350,
    visible: (w) => (w.boats || []).some((b) => !b.dead),
    at: (w) => { const b = (w.boats || []).find((x) => !x.dead); return b ? b.pos : null; } },
  { id: 'chopper', name: 'a POLICE HELICOPTER in the air', pay: 700,
    visible: (w) => (w.policeHelis || []).some((h) => !h.dead),
    at: (w) => { const h = (w.policeHelis || []).find((x) => !x.dead); return h ? h.pos : null; } },
  { id: 'fire',    name: 'a vehicle on fire', pay: 500,
    visible: (w) => allVeh(w).some((v) => v.dead),
    at: (w) => { const v = allVeh(w).find((x) => x.dead); return v ? v.pos : null; } },
  { id: 'kaiju',   name: 'the KAIJU (if you dare)', pay: 2500,
    visible: (w) => !!w.kaiju?.active,
    at: (w) => w.kaiju?.mesh?.position || null },
  { id: 'tank',    name: 'an army TANK on the streets', pay: 1500,
    visible: (w) => (w.tanks || []).some((t) => !t.dead),
    at: (w) => { const t = (w.tanks || []).find((x) => !x.dead); return t ? t.pos : null; } },
  { id: 'night5',  name: 'a night selfie at 3+ stars', pay: 1200, selfie: true,
    visible: (w) => w.wanted >= 3 && (w.clock >= 20 || w.clock < 6),
    at: (w) => w.player.pos },
  { id: 'sunrise', name: 'the skyline at dawn (5–7am)', pay: 450,
    visible: (w) => w.clock >= 5 && w.clock < 7,
    at: () => new THREE.Vector3(0, 60, 0) },
];

function allVeh(w) {
  return [...(w.traffic || []), ...(w.parked || []), ...(w.cops || [])];
}

export function initPhotoBounty(scene, w, cam, save, landmarks) {
  world = w;
  camera = cam;
  world._photoLandmarks = landmarks || [];

  const day = dayNum();
  world.photoBounty = {
    active: [],
    done: new Set(save?.photoDone || []),
    day: save?.photoDay ?? day,
    earnedToday: 0,
  };
  if (world.photoBounty.day !== day) { world.photoBounty.done.clear(); world.photoBounty.day = day; }

  refillTargets();

  // a small camera-icon marker near spawn so the map shows it
  board = new THREE.Group();
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 2.0, 6),
    new THREE.MeshLambertMaterial({ color: 0x223040 })
  );
  post.position.y = 1;
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.8, 0.08),
    new THREE.MeshLambertMaterial({ color: 0x0e1622, emissive: 0x14324a, emissiveIntensity: 0.5 })
  );
  sign.position.y = 2.1;
  board.add(post, sign);
  const s = w.city?.spawn || new THREE.Vector3();
  board.position.set(s.x + 5, 0, s.z - 4);
  board.userData.dynamic = true;
  scene.add(board);
  world.photoBounty.boardPos = board.position.clone();
}

function dayNum() { return Math.floor(Date.now() / 86400000); }

function refillTargets() {
  const pb = world.photoBounty;
  const pool = CATALOG.filter((t) => !pb.done.has(t.id) && !pb.active.find((a) => a.id === t.id));
  while (pb.active.length < 3 && pool.length) {
    const i = (Math.random() * pool.length) | 0;
    pb.active.push({ ...pool[i], got: false });
    pool.splice(i, 1);
  }
}

// Called every frame from the main loop, AFTER updateCamera, BEFORE the
// composer render (so the frustum matches what the photo will contain).
export function updatePhotoBounty(dt) {
  if (!world?.photoBounty) return;

  // hint when you're at the board
  const pb = world.photoBounty;
  const near = world.player.pos.distanceTo(pb.boardPos) < 3.5;
  if (near) {
    const list = pb.active.filter((t) => !t.got).map((t) => `📷 ${t.name} — $${t.pay}`).join('   ·   ');
    world.photoBoardHint = list || 'all photo bounties done for today';
  } else {
    world.photoBoardHint = null;
  }

  // detect the capture frame: world.captureNext is set this frame and will be
  // consumed by the render in main.js. We peek at it here first.
  if (world.captureNext && !armedPrev) {
    evaluateShot();
  }
  armedPrev = world.captureNext;
}

function evaluateShot() {
  const pb = world.photoBounty;
  camera.updateMatrixWorld();
  _mat.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _frustum.setFromProjectionMatrix(_mat);

  let paid = 0;
  const names = [];
  for (const t of pb.active) {
    if (t.got || !t.visible(world)) continue;
    const pos = t.at(world);
    if (!pos) continue;

    let inShot = false;
    if (t.selfie) {
      // selfie = player near screen centre-ish; photo mode / any view counts
      _p.copy(world.player.pos); _p.y += 1.5;
      inShot = _frustum.containsPoint(_p) ||
               world.player.pos.distanceTo(camera.position) < 6; // close = selfie
    } else {
      _p.copy(pos);
      // give big subjects a sphere so you don't need the exact pixel
      inShot = _frustum.intersectsSphere(new THREE.Sphere(_p, 8));
      // and it must actually be reasonably close / prominent
      if (inShot && camera.position.distanceTo(_p) > 260) inShot = false;
    }

    if (inShot) {
      t.got = true;
      pb.done.add(t.id);
      paid += t.pay;
      names.push(t.name);
    }
  }

  if (paid > 0) {
    world.money += paid;
    pb.earnedToday += paid;
    world.cityNews?.post?.(`a freelance photographer sold a shot of ${names[0]}`);
    showToast(`📸 PHOTO BOUNTY +$${paid.toLocaleString()}`);
    refillTargets();
    world.onSave?.();
  }
}

// expose for the save blob
export function photoBountySave(world) {
  const pb = world.photoBounty;
  if (!pb) return {};
  return { photoDone: [...pb.done], photoDay: pb.day };
}
