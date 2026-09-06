import * as THREE from 'three';
import { blockStart, roadCenter, N } from './city.js';
import { showToast, showNews, showMissionMsg, setHint } from './hud.js';
import { sfxPickup, sfxMissionPass, sfxMissionFail, sfxCrash } from './sound.js';
import { makeVehicle } from './car.js';

// AUTO BOUNTY: a repo-style board that posts a mark — a fleeing NPC car
// somewhere on the grid. Take a car, run the target down and wreck it (ram it
// until its health breaks) before it slips away or the time runs out. One
// bounty a day; the reward scales with how fast you close it. Separate from
// bounty.js, which is the on-foot contract on a human target.

const TIME = 90;             // seconds to bag the mark
const REWARD = 1400;
const FAST_BONUS = 600;      // full bonus if caught in the first third
const MARK_HP = 55;
const MARK_TOP = 46;

function board(scene, pos) {
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 2.4, 8),
    new THREE.MeshStandardMaterial({ color: 0x6b7280, metalness: 0.6, roughness: 0.4 })
  );
  post.position.copy(pos).setY(1.2);
  scene.add(post);

  const c = document.createElement('canvas');
  c.width = 128; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#2a1608'; g.fillRect(0, 0, 128, 96);
  g.strokeStyle = '#e8a04a'; g.lineWidth = 4; g.strokeRect(4, 4, 120, 88);
  g.fillStyle = '#e8a04a'; g.font = 'bold 20px Arial';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('AUTO', 64, 30);
  g.font = 'bold 14px Arial';
  g.fillText('BOUNTY', 64, 58);
  g.fillText('BOARD', 64, 76);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.5), new THREE.MeshBasicMaterial({ map: tex }));
  panel.position.copy(pos).setY(2.6);
  scene.add(panel);

  const ring = new THREE.Mesh(
    new THREE.CylinderGeometry(2.4, 2.4, 0.4, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xe8a04a, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.position.copy(pos).setY(0.4);
  scene.add(ring);
  return { panel, ring };
}

export function initBountyHunter(scene, world, save = {}) {
  const pos = new THREE.Vector3(blockStart(4) + 8, 0, blockStart(2) + 8);
  const { panel, ring } = board(scene, pos);

  // the mark, spawned far off-screen and parked until a hunt starts
  const mark = makeVehicle(scene, 0, -9999, 0, '#b23b3b', { top: MARK_TOP, accel: 20, health: MARK_HP });
  mark.mesh.visible = false;

  world.bhunt = {
    pos, panel, ring, mark,
    active: false, t: 0, day: -1, caughtDay: save.bhuntDay ?? -1,
    wp: new THREE.Vector3(),   // current flee waypoint
  };
}

function pickSpawn(world) {
  // a road intersection at least a few blocks from the player
  const p = world.player.pos;
  for (let i = 0; i < 20; i++) {
    const gi = (Math.random() * N) | 0;
    const gj = (Math.random() * N) | 0;
    const x = roadCenter(gi);
    const z = roadCenter(gj);
    if (Math.hypot(x - p.x, z - p.z) > 120) return new THREE.Vector3(x, 0, z);
  }
  return new THREE.Vector3(roadCenter(0), 0, roadCenter(0));
}

function newWaypoint(world) {
  const b = world.bhunt;
  const m = b.mark.pos;
  const p = world.player.pos;
  // flee: head to a random intersection biased away from the player
  const away = new THREE.Vector3(m.x - p.x, 0, m.z - p.z).normalize();
  const gx = Math.round((m.x + away.x * 120) / 76);
  const gz = Math.round((m.z + away.z * 120) / 76);
  b.wp.set(
    roadCenter(Math.max(0, Math.min(N, gx + ((Math.random() * 3) | 0) - 1))),
    0,
    roadCenter(Math.max(0, Math.min(N, gz + ((Math.random() * 3) | 0) - 1)))
  );
}

export function updateBountyHunter(world, dt, pressed) {
  const b = world.bhunt;
  if (!b) return;
  world.bhuntHint = null;
  b.ring.rotation.y += dt;

  const player = world.player;

  // ---- board interaction ----
  if (!b.active) {
    const d = Math.hypot(player.pos.x - b.pos.x, player.pos.z - b.pos.z);
    const onFoot = !player.inCar && !player.inHeli;
    if (d < 3.5 && onFoot) {
      if (b.caughtDay === world.dailyDay) {
        world.bhuntHint = 'AUTO BOUNTY — no marks left today';
      } else {
        world.bhuntHint = 'AUTO BOUNTY — press <b>E</b> to take a contract';
        if (pressed['KeyE']) startHunt(world);
      }
    }
    return;
  }

  // ---- active hunt ----
  const m = b.mark;
  b.t -= dt;

  // player abandoned the car -> forfeit
  if (!player.inCar) { failHunt(world, 'You need to give chase — get in a car'); return; }
  if (b.t <= 0) { failHunt(world, 'The mark got away'); return; }

  // drive the mark toward its waypoint
  if (Math.hypot(m.pos.x - b.wp.x, m.pos.z - b.wp.z) < 10) newWaypoint(world);
  const to = new THREE.Vector3(b.wp.x - m.pos.x, 0, b.wp.z - m.pos.z);
  const dist = to.length();
  if (dist > 0.5) {
    to.normalize();
    const targetHeading = Math.atan2(to.x, to.z);
    let dh = targetHeading - m.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    m.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, dh));
    const spd = MARK_TOP * (0.7 + 0.3 * Math.max(0, 1 - Math.abs(dh)));
    m.vel.set(Math.sin(m.heading) * spd, 0, Math.cos(m.heading) * spd);
  }
  m.pos.addScaledVector(m.vel, dt);
  m.mesh.position.copy(m.pos);
  m.mesh.rotation.y = m.heading;
  for (const w of m.wheels || []) w.rotation.x -= m.vel.length() * dt * 0.5;

  // ram damage: close + fast player car chips the mark's health
  const car = player.inCar;
  const gap = Math.hypot(car.pos.x - m.pos.x, car.pos.z - m.pos.z);
  const closing = car.vel.length();
  if (gap < 3.2 && closing > 8) {
    m.health -= (closing - 6) * 1.6 * dt * 10;
    world.shake = Math.min(0.4, closing * 0.02);
    if (Math.random() < dt * 6) sfxCrash(closing);
  }

  world.bhBlip = { x: m.pos.x, z: m.pos.z };
  setHint(`BOUNTY — wreck the mark · <b>${Math.ceil(b.t)}s</b> · target ${Math.max(0, Math.round(m.health))}%`);

  if (m.health <= 0) catchMark(world);
}

function startHunt(world) {
  const b = world.bhunt;
  const sp = pickSpawn(world);
  b.mark.pos.copy(sp);
  b.mark.heading = Math.random() * Math.PI * 2;
  b.mark.vel.set(0, 0, 0);
  b.mark.health = MARK_HP;
  b.mark.dead = false;
  b.mark.mesh.visible = true;
  b.mark.mesh.position.copy(sp);
  b.active = true;
  b.t = TIME;
  newWaypoint(world);
  sfxPickup();
  showMissionMsg('AUTO BOUNTY ACCEPTED', 'Track the mark on your radar', '#e8a04a');
  showNews('a repo driver is hunting a marked car across town');
}

function catchMark(world) {
  const b = world.bhunt;
  const frac = 1 - b.t / TIME;
  const bonus = frac < 0.34 ? FAST_BONUS : frac < 0.6 ? Math.round(FAST_BONUS / 2) : 0;
  const pay = REWARD + bonus;
  world.money += pay;
  world.addXP?.(180);
  b.active = false;
  b.caughtDay = world.dailyDay;
  b.mark.mesh.visible = false;
  b.mark.pos.set(0, -9999, 0);
  world.bhBlip = null;
  setHint(null);
  sfxMissionPass();
  showMissionMsg('BOUNTY CLAIMED', `+$${pay}${bonus ? ' · quick work!' : ''}`, '#ffd24a');
  world.onSave?.();
}

function failHunt(world, msg) {
  const b = world.bhunt;
  b.active = false;
  b.mark.mesh.visible = false;
  b.mark.pos.set(0, -9999, 0);
  world.bhBlip = null;
  setHint(null);
  sfxMissionFail();
  showMissionMsg('BOUNTY FAILED', msg, '#ff5a4a');
}
