import * as THREE from 'three';
import { HALF, groundHeight } from './city.js';
import { showToast, showNews } from './hud.js';
import { sfxMissionPass } from './sound.js';

// HOT-AIR BALLOON: a launch pad at the park pays $200 for a slow, drifting
// ride — no destination, just altitude and a good look at the skyline.
// SPACE/C control the burner (up/down), WASD nudges drift. Land anywhere
// clear to end the ride and keep whatever you saw.

const COST = 200;

export function initBalloon(scene, world) {
  const padPos = world.city.spawn.clone().add(new THREE.Vector3(-8, 0, 40));
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(3, 3, 0.2, 20),
    new THREE.MeshLambertMaterial({ color: 0x3a3a42 })
  );
  pad.position.copy(padPos).setY(0.1);
  scene.add(pad);

  const g = new THREE.Group();
  const envelope = new THREE.Mesh(
    new THREE.SphereGeometry(3.4, 14, 10),
    new THREE.MeshStandardMaterial({ color: 0xff6a3d, roughness: 0.6 })
  );
  envelope.scale.y = 1.3;
  envelope.position.y = 5.5;
  g.add(envelope);
  const stripe = new THREE.Mesh(
    new THREE.SphereGeometry(3.45, 14, 10),
    new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.5, wireframe: true })
  );
  stripe.scale.copy(envelope.scale);
  stripe.position.copy(envelope.position);
  g.add(stripe);
  const basket = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 1, 1.4),
    new THREE.MeshLambertMaterial({ color: 0x6a4a28 })
  );
  basket.position.y = 1;
  g.add(basket);
  g.position.copy(padPos).setY(0);
  scene.add(g);

  world.balloon = { padPos, mesh: g, riding: false, cost: COST };
}

export function updateBalloonPad(world, dt, pressed) {
  const b = world.balloon;
  if (!b || b.riding) return;
  const player = world.player;
  world.balloonHint = null;
  const onFoot = !player.inCar && !player.inHeli && !player.inBoat;
  const d = Math.hypot(player.pos.x - b.padPos.x, player.pos.z - b.padPos.z);
  if (d < 4 && onFoot) {
    world.balloonHint = `Press <b>E</b> to ride the HOT-AIR BALLOON — $${COST}`;
    if (pressed['KeyE']) {
      if (world.money < COST) { showToast('Not enough cash'); return; }
      world.money -= COST;
      b.riding = true;
      player.pos.copy(b.padPos).setY(0.5);
      player.vel.set(0, 0, 0);
      player.vy = 2;
      player.onGround = false;
      showToast('ALOFT! SPACE climbs, C descends, WASD drifts');
      showNews('a very calm balloon lifts off the park, entirely uninterested in your wanted level');
    }
  }
}

export function updateBalloon(world, dt, keys, camYaw) {
  const b = world.balloon;
  const player = world.player;
  if (!b?.riding) return;

  const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
  let mx = 0, mz = 0;
  if (keys['KeyW']) { mx += fx; mz += fz; }
  if (keys['KeyS']) { mx -= fx; mz -= fz; }
  if (keys['KeyA']) { mx += fz; mz -= fx; }
  if (keys['KeyD']) { mx -= fz; mz += fx; }
  const m = Math.hypot(mx, mz);
  const tx = m ? (mx / m) * 6 : 0;
  const tz = m ? (mz / m) * 6 : 0;
  player.vel.x += (tx - player.vel.x) * Math.min(1, 1.2 * dt);
  player.vel.z += (tz - player.vel.z) * Math.min(1, 1.2 * dt);

  const targetVy = keys['Space'] ? 5 : keys['KeyC'] ? -5 : 0;
  player.vy += (targetVy - player.vy) * Math.min(1, 1.5 * dt);

  player.pos.x = Math.max(-HALF + 4, Math.min(HALF - 4, player.pos.x + player.vel.x * dt));
  player.pos.z = Math.max(-HALF + 4, Math.min(HALF - 4, player.pos.z + player.vel.z * dt));
  player.pos.y = Math.min(160, player.pos.y + player.vy * dt);
  b.mesh.position.set(player.pos.x, Math.max(0, player.pos.y - 6), player.pos.z);
  b.mesh.visible = player.pos.y > 1;

  world.balloonHint = `BALLOON — alt ${Math.round(player.pos.y)}m · land clear (near ground) to end the ride`;

  const g = groundHeight(player.pos, world.city.colliders, 0.3, player.pos.y);
  if (player.pos.y <= g + 1.5 && player.vy <= 0) {
    player.pos.y = g;
    player.vy = 0;
    player.onGround = true;
    b.riding = false;
    b.mesh.position.copy(b.padPos);
    b.mesh.visible = true;
    sfxMissionPass();
    showToast('Balloon lands — thanks for flying scenic');
  }
}
