import * as THREE from 'three';
import { HALF, pointBlocked } from './city.js';
import { showToast, showMissionMsg } from './hud.js';
import { sfxPickup, sfxMissionPass } from './sound.js';

// BAYSIDE DRIVING RANGE: a tee on the south shore aimed at open water.
// E starts the swing, the power meter sweeps, E again strikes. Distance
// rings on the bay pay out; the 220m+ ring pays best, daily record kept.

export function initGolf(scene, world, save) {
  // tee on the east seawall verge, driving out over the actual bay
  let tee = new THREE.Vector3(HALF - 2, 0, -60);
  const probe = new THREE.Vector3(tee.x, 1, tee.z);
  if (pointBlocked(probe, world.city.colliders, 1.6)) tee = new THREE.Vector3(HALF - 2, 0, -90);

  const mat = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.06, 1.4),
    new THREE.MeshStandardMaterial({ color: 0x2a7a3a, roughness: 0.9 })
  );
  mat.position.copy(tee).setY(0.03);
  scene.add(mat);
  // distance rings floating on the bay
  for (const [dist, color] of [[80, 0xf0d24a], [150, 0xff9a3d], [220, 0xf04a4a]]) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(8, 0.4, 6, 20),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(tee.x + dist, 0.2, tee.z);
    scene.add(ring);
  }
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  ball.visible = false;
  scene.add(ball);

  world.golf = { tee, ball, state: 'idle', power: 0, dir: 1, flight: null, best: save?.golfBest ?? 0 };
}

export function updateGolf(world, dt, pressed) {
  const gf = world.golf;
  if (!gf) return;
  const player = world.player;
  world.golfHint = null;

  // ball in flight
  if (gf.flight) {
    const f = gf.flight;
    f.t += dt;
    f.vy -= 18 * dt;
    gf.ball.position.x += f.vz * dt; // out to sea, +x
    gf.ball.position.y += f.vy * dt;
    if (gf.ball.position.y <= 0.1) {
      const carry = gf.ball.position.x - gf.tee.x;
      gf.ball.visible = false;
      gf.flight = null;
      let pay = 0;
      if (carry >= 220) pay = 400;
      else if (carry >= 150) pay = 150;
      else if (carry >= 80) pay = 50;
      const best = carry > gf.best;
      if (best) gf.best = carry;
      if (pay) {
        world.money += pay;
        sfxMissionPass();
        showMissionMsg('SPLASH', `${carry.toFixed(0)}m${best ? ' — RANGE RECORD' : ''} · +$${pay}`, '#7cf78c');
        world.onSave?.();
      } else {
        showToast(`${carry.toFixed(0)}m — the bay accepts your offering`);
      }
    }
    return;
  }

  const onFoot = !player.inCar && !player.inHeli && !player.inBoat;
  const d = Math.hypot(player.pos.x - gf.tee.x, player.pos.z - gf.tee.z);
  if (d > 3 || !onFoot) { gf.state = 'idle'; return; }

  if (gf.state === 'idle') {
    world.golfHint = `BAYSIDE RANGE — Press <b>E</b> to tee up ($10)${gf.best ? ` · record ${gf.best.toFixed(0)}m` : ''}`;
    if (pressed['KeyE']) {
      if (world.money < 10) { showToast('Not enough for a bucket of balls'); return; }
      world.money -= 10;
      gf.state = 'swing';
      gf.power = 0;
      gf.dir = 1;
      sfxPickup();
    }
    return;
  }

  // the meter sweeps
  gf.power += gf.dir * dt * 1.4;
  if (gf.power > 1) { gf.power = 1; gf.dir = -1; }
  if (gf.power < 0) { gf.power = 0; gf.dir = 1; }
  const n = Math.round(gf.power * 20);
  world.golfHint = `SWING: [${'█'.repeat(n)}${'·'.repeat(20 - n)}] — <b>E</b> to strike`;
  if (pressed['KeyE']) {
    gf.state = 'idle';
    const p = gf.power;
    gf.ball.visible = true;
    gf.ball.position.copy(gf.tee).setY(0.3);
    gf.flight = { t: 0, vz: 14 + p * 32, vy: 9 + p * 9 };
    showToast(p > 0.92 ? 'CRUSHED IT' : p > 0.6 ? 'Clean contact' : 'A dignified dribbler');
  }
}
