import * as THREE from 'three';
import { blockStart, BLOCK, HALF, pointBlocked } from './city.js';
import { showToast, showNews, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxMissionFail, sfxPickup } from './sound.js';
import { addRep } from './economy.js';
import { addFlash } from './effects.js';

// Swing Races: the city's rooftop kids chalk rings in the sky and dare you
// to thread them on a stopwatch. Three courses, three medal times — webs,
// wall-runs and sheer nerve. Vehicles are for people who've given up.

const COURSES = [
  {
    key: 'downtown', name: 'DOWNTOWN DASH', gold: 45, silver: 65,
    anchor: () => new THREE.Vector3(blockStart(4) + 30, 0, blockStart(4) + 30),
    build(a) {
      const pts = [];
      for (let i = 0; i < 8; i++) {
        const t = i * 0.85;
        pts.push(new THREE.Vector3(
          a.x + Math.sin(t) * (40 + i * 10),
          16 + Math.sin(i * 1.7) * 8 + i * 2,
          a.z + Math.cos(t) * (40 + i * 10)
        ));
      }
      return pts;
    },
  },
  {
    key: 'harbor', name: 'HARBOR RUN', gold: 50, silver: 72,
    anchor: () => new THREE.Vector3(HALF - 20, 0, -140),
    build(a) {
      const pts = [];
      for (let i = 0; i < 8; i++) {
        pts.push(new THREE.Vector3(
          a.x - 14 + Math.sin(i * 2.2) * 20,
          12 + Math.abs(Math.sin(i * 1.3)) * 14,
          a.z + i * 38
        ));
      }
      return pts;
    },
  },
  {
    key: 'spire', name: 'SPIRE CIRCUIT', gold: 70, silver: 100,
    anchor: () => new THREE.Vector3(blockStart(2) + BLOCK / 2, 0, blockStart(7) + BLOCK / 2),
    build(a) {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const t = i * 0.63;
        pts.push(new THREE.Vector3(
          a.x + Math.sin(t) * 55,
          30 + Math.sin(i * 0.9) * 12 + i * 3,
          a.z + Math.cos(t) * 55
        ));
      }
      return pts;
    },
  },
];
const MEDAL_PAY = { gold: 1500, silver: 800, bronze: 400 };

export function initSwingRaces(scene, world, save) {
  const courses = COURSES.map((def, ci) => {
    const anchor = def.anchor();
    // any ring the city grew a tower into gets lifted above the roofline
    const pts = def.build(anchor).map((p) => {
      const q = p.clone();
      for (let i = 0; i < 20 && pointBlocked(q, world.city.colliders, 4); i++) q.y += 4;
      return q;
    });
    const rings = pts.map((p) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(3.4, 0.3, 8, 18),
        new THREE.MeshBasicMaterial({ color: 0xff9a3d, transparent: true, opacity: 0.3 })
      );
      ring.position.copy(p);
      ring.visible = false;
      scene.add(ring);
      return ring;
    });
    // start pad on the ground under the first ring
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(2.6, 2.6, 0.4, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xff9a3d, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false })
    );
    const padPos = new THREE.Vector3(pts[0].x, 0, pts[0].z);
    pad.position.copy(padPos).setY(0.4);
    scene.add(pad);
    return { ...def, rings, padPos, pad, best: save?.swingBest?.[def.key] ?? null };
  });

  world.swing = { courses, active: null, idx: 0, t: 0 };
}

export function endSwingRace(world) {
  const sw = world.swing;
  if (!sw?.active) return;
  for (const r of sw.active.rings) r.visible = false;
  sw.active = null;
}

export function updateSwingRaces(world, dt, pressed) {
  const sw = world.swing;
  if (!sw) return;
  const player = world.player;
  world.swingHint = null;
  world.swingBlip = null;

  if (!sw.active) {
    if (player.inCar || player.inHeli || player.inBoat) return;
    for (const c of sw.courses) {
      c.pad.rotation.y += dt;
      const d = Math.hypot(player.pos.x - c.padPos.x, player.pos.z - c.padPos.z);
      if (d < 3.6) {
        const bestTxt = c.best ? ` · best ${c.best.toFixed(1)}s` : '';
        world.swingHint = `Press <b>E</b> for SWING RACE: <b>${c.name}</b> — gold ${c.gold}s / silver ${c.silver}s${bestTxt}`;
        if (pressed['KeyE']) {
          sw.active = c;
          sw.idx = 0;
          sw.t = 0;
          for (const r of c.rings) { r.visible = true; r.material.opacity = 0.16; }
          sfxMissionFail();
          showMissionMsg('SWING RACE — ' + c.name, 'Thread every ring. On foot, on webs, on nerve.', '#ff9a3d');
        }
        return;
      }
    }
    return;
  }

  // ---- racing ----
  const c = sw.active;
  sw.t += dt;
  if (player.inCar || player.inHeli || player.inBoat) {
    endSwingRace(world);
    showToast('RACE VOID — no vehicles, swinger');
    return;
  }
  const ring = c.rings[sw.idx];
  ring.material.opacity = 0.55 + Math.sin(world.time * 7) * 0.25;
  ring.rotation.y += dt * 2;
  world.swingBlip = { x: ring.position.x, z: ring.position.z };
  world.swingHint = `${c.name} — ring <b>${sw.idx + 1}/${c.rings.length}</b> · ${sw.t.toFixed(1)}s`;

  if (player.pos.distanceTo(ring.position) < 4.6) {
    ring.visible = false;
    addFlash(ring.position.clone(), 0xff9a3d, 0.7);
    sfxPickup();
    sw.idx++;
    world.style = (world.style || 0) + 8;
    if (sw.idx >= c.rings.length) {
      const t = sw.t;
      const medal = t <= c.gold ? 'gold' : t <= c.silver ? 'silver' : 'bronze';
      const pay = Math.round(MEDAL_PAY[medal] * (world.payMult || 1));
      world.money += pay;
      addRep(world, medal === 'gold' ? 250 : 120);
      if (world.stats) world.stats.swingRaces = (world.stats.swingRaces || 0) + 1;
      if (c.best == null || t < c.best) {
        c.best = t;
        showNews(`a new ghost time on the ${c.name.toLowerCase()} — chalk rings updated overnight`);
      }
      endSwingRace(world);
      sfxMissionPass();
      showMissionMsg(
        `${medal.toUpperCase()} — ${t.toFixed(1)}s`,
        `+$${pay}${medal === 'gold' ? ' — the rooftop kids salute you' : ''}`,
        medal === 'gold' ? '#ffd24a' : '#ff9a3d'
      );
      world.onSave?.();
    }
  }
}
