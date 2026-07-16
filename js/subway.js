import * as THREE from 'three';
import { blockStart, BLOCK, N } from './city.js';
import { showToast, showNews, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxPickup } from './sound.js';
import { addCrime } from './police.js';

// THE METRO: five station entrances (stairwells down to a platform that
// only exists as a destination, not a place you actually walk around in —
// the ride itself is a fade). Pay the fare and pick a line on the kiosk map
// for a clean teleport; hop the turnstile instead and you ride free but a
// transit cop clocks you 40% of the time.

const FARE = 60;
const DODGE_CHANCE = 0.4;

const STATIONS = [
  { key: 'downtown', name: 'DOWNTOWN', bi: 2, bj: 2 },
  { key: 'harbor', name: 'HARBOR JCT', bi: 8, bj: 2 },
  { key: 'uptown', name: 'UPTOWN', bi: 2, bj: 8 },
  { key: 'stadium', name: 'STADIUM', bi: 8, bj: 8 },
  { key: 'central', name: 'CENTRAL', bi: 5, bj: 5 },
];

function stationMesh(color) {
  const g = new THREE.Group();
  const canopy = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 0.3, 3.4),
    new THREE.MeshStandardMaterial({ color: 0x2a2f38, metalness: 0.6, roughness: 0.4 })
  );
  canopy.position.y = 2.6;
  g.add(canopy);
  for (const [sx, sz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.6, 6), new THREE.MeshStandardMaterial({ color: 0x1c2026 }));
    post.position.set(sx, 1.3, sz);
    g.add(post);
  }
  const glow = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.4, 0.15), new THREE.MeshBasicMaterial({ color }));
  glow.position.set(0, 2.35, 1.7);
  g.add(glow);
  const hole = new THREE.Mesh(
    new THREE.CylinderGeometry(1.3, 1.3, 0.15, 16),
    new THREE.MeshLambertMaterial({ color: 0x0a0a0d })
  );
  hole.position.y = 0.08;
  g.add(hole);
  return g;
}

export function initSubway(scene, world) {
  const stations = STATIONS.map((def) => {
    const x = blockStart(def.bi) + BLOCK / 2;
    const z = blockStart(def.bj) + BLOCK / 2;
    const mesh = stationMesh(0x4ad2ff);
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    return { ...def, pos: new THREE.Vector3(x, 0, z), mesh };
  });
  world.subway = { stations, menu: null };
}

export function updateSubway(world, dt, pressed) {
  const sub = world.subway;
  if (!sub) return;
  const player = world.player;
  world.subwayHint = null;

  if (sub.menu) {
    // simple numeric picker: 1-5 rides that line, Escape backs out
    const st = sub.stations[sub.menu.idx];
    world.subwayHint = `${st.name} — <b>1</b> pay fare $${FARE} · <b>2</b> jump the turnstile (free, risky) · <b>3</b> cancel`;
    if (pressed['Digit1']) { rideTo(world, sub.menu.dest, true); sub.menu = null; }
    else if (pressed['Digit2']) { rideTo(world, sub.menu.dest, false); sub.menu = null; }
    else if (pressed['Digit3'] || pressed['Escape']) { sub.menu = null; }
    return;
  }

  const onFoot = !player.inCar && !player.inHeli && !player.inBoat;
  if (!onFoot) return;

  for (const st of sub.stations) {
    const d = Math.hypot(player.pos.x - st.pos.x, player.pos.z - st.pos.z);
    if (d < 3) {
      const others = sub.stations.filter((s) => s.key !== st.key);
      const dest = others[(Math.random() * others.length) | 0];
      world.subwayHint = `Press <b>E</b> at the ${st.name} stairwell — ride the METRO`;
      if (pressed['KeyE']) {
        sub.menu = { idx: sub.stations.indexOf(st), dest };
        showToast(`Pick a fare option for ${dest.name}`);
      }
      return;
    }
  }
}

function rideTo(world, dest, paid) {
  const player = world.player;
  if (paid) {
    if (world.money < FARE) { showToast('Not enough for the fare'); return; }
    world.money -= FARE;
    sfxPickup();
    showMissionMsg('METRO', `Rode the line to ${dest.name}`, '#4ad2ff');
  } else if (Math.random() < DODGE_CHANCE) {
    addCrime(world, 1);
    showToast('TRANSIT COP CLOCKED YOU — fare dodging noted');
    showNews('a turnstile-jumper gets a stern look from a transit cop with a citation book');
  } else {
    showToast('Rode free — nobody saw a thing');
  }
  player.pos.set(dest.pos.x + 2, 0, dest.pos.z + 2);
  player.vel.set(0, 0, 0);
  player.onGround = true;
  sfxMissionPass();
  if (world.stats) world.stats.metroRides = (world.stats.metroRides || 0) + 1;
}
