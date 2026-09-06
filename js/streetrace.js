import * as THREE from 'three';
import { roadCenter } from './city.js';
import { showToast, showNews, showMissionMsg, setHint } from './hud.js';
import { sfxPickup, sfxMissionPass, sfxMissionFail } from './sound.js';
import { makeVehicle } from './car.js';
import { addCrime } from './police.js';

// STREET RACE: illegal grid races with a cash buy-in and a single rival AI car.
// Roll your car into a start ring, pay the stake, beat the rival to the last
// checkpoint. Win and you take the pot (your stake plus the rival's); lose it
// and the stake is gone. Winning near a cop draws heat. Separate from races.js,
// which is the sanctioned checkpoint-medal circuit.

const rc = roadCenter;

const CIRCUITS = [
  {
    key: 'nightloop', name: 'NIGHT LOOP', stake: 500,
    start: [rc(2) + 8, rc(2)],
    cps: [[rc(6), rc(2)], [rc(6), rc(6)], [rc(2), rc(6)], [rc(2) + 8, rc(2)]],
    rivalTop: 50,
  },
  {
    key: 'dockdash', name: 'DOCK DASH', stake: 800,
    start: [rc(8), rc(8) - 8],
    cps: [[rc(8), rc(3)], [rc(4), rc(3)], [rc(4), rc(8)], [rc(8), rc(8) - 8]],
    rivalTop: 54,
  },
  {
    key: 'crosscut', name: 'CROSSCUT SPRINT', stake: 1200,
    start: [rc(1), rc(5)],
    cps: [[rc(5), rc(5)], [rc(5), rc(1)], [rc(9), rc(1)]],
    rivalTop: 58,
  },
];

function ring(color, r) {
  return new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, 1.2, 22, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })
  );
}

export function initStreetRace(scene, world, save) {
  world.streetRaceWins = { ...(save.streetRaces || {}) };
  const defs = [];
  for (const def of CIRCUITS) {
    const start = ring(0xff3d7a, 4.5);
    start.position.set(def.start[0], 0.7, def.start[1]);
    scene.add(start);
    defs.push({ def, start });
  }
  const cp = ring(0xff8adf, 6);
  cp.visible = false;
  scene.add(cp);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.8, 1.3, 60, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xff8adf, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false })
  );
  beam.visible = false;
  scene.add(beam);

  const rival = makeVehicle(scene, 0, -9999, 0, '#1a1a22', { top: 55, accel: 22 });
  rival.mesh.visible = false;

  world.streetRace = {
    scene, defs, cp, beam, rival,
    active: null, idx: 0, rivalIdx: 0, t: 0, countdown: 0, cdT: 0,
  };
}

function moveCp(sr) {
  const c = sr.active.cps[sr.idx];
  sr.cp.position.set(c[0], 1.6, c[1]);
  sr.cp.visible = true;
  sr.beam.position.set(c[0], 30, c[1]);
  sr.beam.visible = true;
}

function placeRival(sr, def) {
  const s = def.start;
  sr.rival.pos.set(s[0] + 3, 0, s[1]);
  sr.rival.heading = 0;
  sr.rival.vel.set(0, 0, 0);
  sr.rival.mesh.visible = true;
  sr.rival.mesh.position.copy(sr.rival.pos);
  sr.rivalIdx = 0;
}

export function updateStreetRace(world, dt, pressed) {
  const sr = world.streetRace;
  if (!sr) return;
  world.streetRaceHint = null;
  const player = world.player;

  // ---------- idle: waiting at a start ring ----------
  if (!sr.active) {
    sr.cdT = Math.max(0, sr.cdT - dt);
    if (sr.cdT > 0 || world.mission?.active || player.inHeli) return;
    for (const { def, start } of sr.defs) {
      start.rotation.y += dt;
      const focus = player.inCar ? player.inCar.pos : player.pos;
      const d = Math.hypot(focus.x - def.start[0], focus.z - def.start[1]);
      if (d > 20) continue;
      const wins = world.streetRaceWins[def.key] || 0;
      if (d > 4.5 || !player.inCar) {
        world.streetRaceHint = `${def.name} — bring a car to the ring · buy-in $${def.stake}` +
          (wins ? ` · ${wins} win${wins > 1 ? 's' : ''}` : '');
        continue;
      }
      if (player.inCar.tank || player.inCar.bike) {
        world.streetRaceHint = `${def.name} — needs a road car`;
        continue;
      }
      world.streetRaceHint = `${def.name} — press <b>E</b> to race (buy-in $${def.stake})`;
      if (pressed['KeyE']) {
        if (world.money < def.stake) { showToast('Not enough cash for the buy-in'); break; }
        world.money -= def.stake;
        sr.active = def;
        sr.idx = 0;
        sr.t = 0;
        sr.countdown = 3;
        moveCp(sr);
        placeRival(sr, def);
        showMissionMsg(def.name, 'Money down. Get ready...', '#ff8adf');
      }
      break;
    }
    return;
  }

  const def = sr.active;

  // ---------- countdown ----------
  if (sr.countdown > 0) {
    const before = Math.ceil(sr.countdown);
    sr.countdown -= dt;
    const after = Math.ceil(sr.countdown);
    if (after !== before && after > 0) showMissionMsg(def.name, `${after}...`, '#ff8adf');
    if (sr.countdown <= 0) { showMissionMsg('GO!', '', '#7cf78c'); sfxPickup(); }
    return;
  }

  sr.t += dt;

  // bail conditions
  if (!player.inCar || player.inCar.dead) { endStreetRace(world, false, 'You wrecked out'); return; }
  if (sr.t > 180) { endStreetRace(world, false, 'Too slow'); return; }

  // ---------- drive the rival along the checkpoint chain ----------
  const r = sr.rival;
  const rc2 = def.cps[sr.rivalIdx];
  const to = new THREE.Vector3(rc2[0] - r.pos.x, 0, rc2[1] - r.pos.z);
  const rdist = to.length();
  if (rdist < 7) {
    sr.rivalIdx++;
    if (sr.rivalIdx >= def.cps.length) { endStreetRace(world, false, 'The rival took it'); return; }
  } else {
    to.normalize();
    const targetHeading = Math.atan2(to.x, to.z);
    let dh = targetHeading - r.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    r.heading += Math.max(-2.6 * dt, Math.min(2.6 * dt, dh));
    const spd = def.rivalTop * (0.68 + 0.32 * Math.max(0, 1 - Math.abs(dh)));
    r.vel.set(Math.sin(r.heading) * spd, 0, Math.cos(r.heading) * spd);
  }
  r.pos.addScaledVector(r.vel, dt);
  r.mesh.position.copy(r.pos);
  r.mesh.rotation.y = r.heading;
  for (const w of r.wheels || []) w.rotation.x -= r.vel.length() * dt * 0.5;

  // ---------- player checkpoints ----------
  const focus = player.inCar.pos;
  const c = def.cps[sr.idx];
  sr.cp.rotation.y += dt * 2;
  world.streetRaceBlip = { x: c[0], z: c[1] };
  const lead = sr.idx - sr.rivalIdx;
  setHint(`${def.name} — gate ${sr.idx + 1}/${def.cps.length} · ${lead >= 0 ? 'LEADING' : 'BEHIND'} · <b>${sr.t.toFixed(1)}s</b>`);

  if (Math.hypot(focus.x - c[0], focus.z - c[1]) < 7) {
    sr.idx++;
    if (sr.idx >= def.cps.length) { endStreetRace(world, true); return; }
    sfxPickup();
    moveCp(sr);
  }
}

export function endStreetRace(world, won, failMsg) {
  const sr = world.streetRace;
  if (!sr || !sr.active) return;
  const def = sr.active;
  sr.active = null;
  sr.cdT = 5;
  sr.cp.visible = false;
  sr.beam.visible = false;
  sr.rival.mesh.visible = false;
  sr.rival.pos.set(0, -9999, 0);
  world.streetRaceBlip = null;
  setHint(null);

  if (!won) {
    sfxMissionFail();
    showMissionMsg('RACE LOST', failMsg || 'Better luck next time', '#ff5a4a');
    return;
  }

  const pot = def.stake * 2;
  world.money += pot;
  world.streetRaceWins[def.key] = (world.streetRaceWins[def.key] || 0) + 1;
  world.addXP?.(200);
  // racing hot in traffic gets you noticed
  if (world.wanted === 0 && Math.random() < 0.5) addCrime(world, 1);
  sfxMissionPass();
  showMissionMsg('RACE WON', `+$${pot} pot · ${def.t?.toFixed?.(1) ?? sr.t.toFixed(1)}s`, '#7cf78c');
  showNews('an illegal street race tears through the district after dark');
  world.onSave?.();
}
