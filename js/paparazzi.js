import * as THREE from 'three';
import { blockStart, BLOCK, roadCenter, HALF, pointBlocked } from './city.js';
import { createCharacter, animateWalk, animateIdle } from './characters.js';
import { makeVehicle } from './car.js';
import { showToast, showNews, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxPickup } from './sound.js';
import { addRep } from './economy.js';

// The Daily Grind tabloid pays for photographs nobody should be taking.
// Take a contract at the kiosk, find the subject, frame them and press G.
// Closer shots pay better. Yes, the actual screenshot still saves — you
// keep the evidence, they keep the front page.

const COOLDOWN = 45;

const CELEB_SPOTS = [
  { name: 'outside the spire', x: blockStart(2) + BLOCK / 2 + 14, z: blockStart(7) + BLOCK / 2 + 14 },
  { name: 'by the park fountain', x: blockStart(5) + BLOCK / 2 + 10, z: blockStart(5) + BLOCK / 2 - 12 },
  { name: 'near the Lucky 7', x: 0, z: 0, spawnRel: true },
  { name: 'on the boardwalk', x: HALF - 8, z: -40 },
];

export function initPaparazzi(scene, world) {
  // tabloid kiosk: a newsstand with a screaming headline
  const kioskPos = world.city.spawn.clone().add(new THREE.Vector3(26, 0, -18));
  const probe = new THREE.Vector3(kioskPos.x, 1, kioskPos.z);
  if (pointBlocked(probe, world.city.colliders, 1)) kioskPos.add(new THREE.Vector3(-6, 0, 6));
  const stand = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 2, 1.4),
    new THREE.MeshLambertMaterial({ color: 0x3a3040 })
  );
  stand.position.copy(kioskPos).setY(1);
  scene.add(stand);
  const c = document.createElement('canvas');
  c.width = 128; c.height = 48;
  const g = c.getContext('2d');
  g.fillStyle = '#f2e8d8'; g.fillRect(0, 0, 128, 48);
  g.fillStyle = '#a01020'; g.font = 'bold 15px Arial'; g.textAlign = 'center';
  g.fillText('DAILY GRIND', 64, 18);
  g.fillStyle = '#111'; g.font = 'bold 9px Arial';
  g.fillText('"WHO WEBBED THE MAYOR?"', 64, 36);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.85), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  sign.position.copy(kioskPos).setY(2.5);
  scene.add(sign);

  world.pap = { kioskPos, job: null, cooldownT: 0 };
}

function clearJob(world) {
  const job = world.pap.job;
  if (!job) return;
  for (const m of job.meshes) world.scene.remove(m);
  world.pap.job = null;
}

function startJob(world) {
  const pap = world.pap;
  const kind = ['celeb', 'exotic', 'rooftop'][(Math.random() * 3) | 0];
  const meshes = [];
  let subject, brief, spotName;

  if (kind === 'celeb') {
    const spot = CELEB_SPOTS[(Math.random() * CELEB_SPOTS.length) | 0];
    const x = spot.spawnRel ? world.city.spawn.x - 16 : spot.x;
    const z = spot.spawnRel ? world.city.spawn.z + 18 : spot.z;
    const ch = createCharacter({ shirt: '#f2f2f2', pants: '#14181d', skin: '#e6b88f', hair: '#d8c050' });
    const shades = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.08, 0.06),
      new THREE.MeshBasicMaterial({ color: 0x101014 })
    );
    shades.position.set(0, 1.78, 0.18);
    ch.group.add(shades);
    ch.group.position.set(x, 0, z);
    world.scene.add(ch.group);
    meshes.push(ch.group);
    subject = { pos: ch.group.position, ch, walkA: Math.random() * 6, aimY: 1.2 };
    spotName = spot.name;
    brief = `a certain SOMEBODY was seen ${spot.name}. We pay for proof.`;
  } else if (kind === 'exotic') {
    const road = roadCenter(2 + ((Math.random() * 6) | 0));
    const v = makeVehicle(world.scene, road + 4, -HALF + 30, 0, '#ff2a8a', { accel: 0, top: 0 });
    meshes.push(v.mesh);
    subject = { pos: v.pos, car: v, dirZ: 1, road, aimY: 0.8 };
    spotName = 'cruising the grid';
    brief = 'a pink prototype supercar is doing laps. Shoot it before the cops impound it.';
  } else {
    // two figures having a meeting on a rooftop they don't own
    const c = world.city.colliders.find((c) => c.h > 12 && c.h < 26 && c.x1 - c.x0 > 8);
    const cx = (c.x0 + c.x1) / 2;
    const cz = (c.z0 + c.z1) / 2;
    const top = c.h - 0.3;
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
      const fig = createCharacter({ shirt: s < 0 ? '#23303d' : '#43302a', pants: '#181f28', skin: '#c98e63' });
      fig.group.position.set(s * 1.2, 0, 0);
      fig.group.rotation.y = s < 0 ? Math.PI / 2 : -Math.PI / 2;
      g.add(fig.group);
    }
    g.position.set(cx, top, cz);
    world.scene.add(g);
    meshes.push(g);
    subject = { pos: g.position, aimY: 1.2, roof: true };
    spotName = 'a rooftop meeting';
    brief = 'two suits are meeting on a roof at ' + Math.round(top) + 'm. Get the shot they think is impossible.';
  }

  pap.job = { kind, subject, meshes, spotName };
  showMissionMsg('📸 PAPARAZZI', brief + ' Frame them and press G.', '#ff4ad2');
  showNews('the Daily Grind wires cash to "a freelance photographic asset"');
}

const _ndc = new THREE.Vector3();

export function updatePaparazzi(world, dt, pressed, camera) {
  const pap = world.pap;
  if (!pap) return;
  const player = world.player;
  world.papHint = null;
  world.papBlip = null;
  pap.cooldownT = Math.max(0, pap.cooldownT - dt);

  if (!pap.job) {
    const d = Math.hypot(player.pos.x - pap.kioskPos.x, player.pos.z - pap.kioskPos.z);
    if (d < 3.6 && !player.inCar && !player.inHeli) {
      if (pap.cooldownT > 0) {
        world.papHint = `DAILY GRIND — next contract in ${Math.ceil(pap.cooldownT)}s`;
      } else {
        world.papHint = 'Press <b>E</b> for a PAPARAZZI CONTRACT — get the shot, get paid';
        if (pressed['KeyE']) startJob(world);
      }
    }
    return;
  }

  const job = pap.job;
  const s = job.subject;
  world.papBlip = { x: s.pos.x, z: s.pos.z };
  world.papHint = `📸 ${job.spotName.toUpperCase()} — frame the subject and press <b>G</b> (closer pays more)`;

  // subjects live their little lives
  if (s.ch) {
    s.walkA += dt * 0.7;
    s.pos.x += Math.sin(s.walkA) * 1.1 * dt;
    s.pos.z += Math.cos(s.walkA * 0.8) * 1.1 * dt;
    s.ch.group.rotation.y = Math.atan2(Math.sin(s.walkA), Math.cos(s.walkA * 0.8));
    animateWalk(s.ch, s.walkA * 5, 0.4);
  } else if (s.car) {
    s.pos.z += s.dirZ * 14 * dt;
    if (Math.abs(s.pos.z) > HALF - 24) s.dirZ *= -1;
    s.car.heading = s.dirZ > 0 ? 0 : Math.PI;
    s.car.mesh.rotation.y = s.car.heading;
    for (const w of s.car.wheels) w.rotation.x += dt * 30;
  }

  // the snap: G while the subject is close AND in frame
  if (pressed['KeyG']) {
    const focus = player.inHeli ? player.inHeli.pos : player.pos;
    const d = Math.hypot(s.pos.x - focus.x, s.pos.z - focus.z);
    _ndc.set(s.pos.x, s.pos.y + (s.aimY || 1), s.pos.z).project(camera);
    const framed = _ndc.z < 1 && Math.abs(_ndc.x) < 0.85 && Math.abs(_ndc.y) < 0.85;
    if (d < 30 && framed) {
      const base = 300;
      const bonus = Math.round((1 - Math.min(1, d / 30)) * 500);
      const pay = Math.round((base + bonus) * (world.payMult || 1));
      world.money += pay;
      addRep(world, 80);
      if (world.stats) world.stats.photosSold = (world.stats.photosSold || 0) + 1;
      clearJob(world);
      pap.cooldownT = COOLDOWN;
      sfxMissionPass();
      showMissionMsg('FRONT PAGE', `+$${pay}${bonus > 350 ? ' — RIGHT IN THEIR FACE. Shameless. Perfect.' : ''}`, '#ff4ad2');
      showNews('tomorrow\'s Daily Grind: a photo everyone will deny posing for');
      world.onSave?.();
    } else if (d < 60) {
      sfxPickup();
      showToast(framed ? 'TOO FAR — get closer' : 'NOT IN FRAME — point the camera at them');
    }
  }
}
