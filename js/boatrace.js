import * as THREE from 'three';
import { HALF } from './city.js';
import { showToast, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxMissionFail, sfxPickup } from './sound.js';

// JET SKI CIRCUIT: a glowing start buoy floats off the south shore.
// Drive any boat through it and six water gates light up — the race
// grants a jet-ski burst of extra thrust while it runs. Beat the clock,
// then beat your own best.

const GATES = 6;
const TIME = 75;

export function initBoatrace(scene, world, save) {
  // the bay lives east of the seawall (water.js: x in HALF+6..HALF+260)
  const start = new THREE.Vector3(HALF + 30, 0, 40);
  const buoy = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 0.5, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x4af0c8, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false })
  );
  buoy.position.copy(start).setY(0.4);
  scene.add(buoy);

  // a weaving line of gates out into open water
  const gates = [];
  for (let i = 0; i < GATES; i++) {
    const pos = new THREE.Vector3(start.x + 24 + i * 30, 0, start.z + Math.sin(i * 1.15) * 55);
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 3.2, 0.5, 14, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xff9a3d, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.position.copy(pos).setY(0.4);
    ring.visible = false;
    scene.add(ring);
    gates.push({ pos, ring });
  }
  world.boatrace = { start, buoy, gates, on: false, idx: 0, t: 0, best: save?.boatBest ?? 0 };
}

export function endBoatrace(world) {
  const br = world.boatrace;
  if (!br?.on) return;
  br.on = false;
  world.boatBoost = 0;
  for (const gt of br.gates) gt.ring.visible = false;
  world.boatraceBlip = null;
}

export function updateBoatrace(world, dt) {
  const br = world.boatrace;
  if (!br) return;
  const player = world.player;
  world.boatraceHint = null;
  world.boatraceBlip = null;
  const boat = player.inBoat;
  br.buoy.rotation.y += dt;

  if (!br.on) {
    if (!boat) return;
    const d = Math.hypot(boat.pos.x - br.start.x, boat.pos.z - br.start.z);
    if (d < 40) world.boatraceHint = `JET SKI CIRCUIT — drive through the green buoy to start${br.best ? ` · best ${br.best.toFixed(1)}s` : ''}`;
    if (d < 3.5) {
      br.on = true;
      br.idx = 0;
      br.t = 0;
      world.boatBoost = 1;
      for (const gt of br.gates) gt.ring.visible = true;
      sfxPickup();
      showMissionMsg('JET SKI CIRCUIT', `${GATES} gates · ${TIME}s · the engine runs hot for you`, '#4af0c8');
    }
    return;
  }

  // race live
  br.t += dt;
  if (!boat) { endBoatrace(world); sfxMissionFail(); showToast('CIRCUIT VOID — you left the boat'); return; }
  if (br.t > TIME) { endBoatrace(world); sfxMissionFail(); showToast('CIRCUIT — out of time'); return; }

  // jet-ski burst: extra thrust straight off the bow while racing
  const fwdX = Math.sin(boat.heading), fwdZ = Math.cos(boat.heading);
  boat.vel.x += fwdX * 7 * dt;
  boat.vel.z += fwdZ * 7 * dt;

  const gate = br.gates[br.idx];
  world.boatraceBlip = { x: gate.pos.x, z: gate.pos.z };
  gate.ring.rotation.y += dt * 3;
  world.boatraceHint = `GATE ${br.idx + 1}/${GATES} — <b>${(TIME - br.t).toFixed(0)}s</b>`;
  if (Math.hypot(boat.pos.x - gate.pos.x, boat.pos.z - gate.pos.z) < 4.5) {
    gate.ring.visible = false;
    br.idx++;
    sfxPickup();
    if (br.idx >= GATES) {
      const t = br.t;
      const newBest = !br.best || t < br.best;
      if (newBest) br.best = t;
      const pay = Math.round((500 + Math.max(0, (TIME - t) * 20)) * (world.payMult || 1));
      world.money += pay;
      endBoatrace(world);
      sfxMissionPass();
      showMissionMsg('CIRCUIT COMPLETE', `${t.toFixed(1)}s${newBest ? ' — NEW BEST' : ''} · +$${pay}`, '#4af0c8');
      world.onSave?.();
    }
  }
}
