import * as THREE from 'three';
import { blockStart } from './city.js';
import { showToast, showNews, showMissionMsg } from './hud.js';
import { sfxCrash, sfxMissionPass, sfxMissionFail } from './sound.js';
import { addSmoke, addSparks, addFlash } from './effects.js';

// WRECKING CRANE: a crane cab on a demolition site near the map edge. Climb
// in (E), swing the ball with A/D, and knock the panels off the condemned
// shell for a payout. A timer runs; clip the occupied tower next door and
// the job is scrubbed. The shell rebuilds between shifts.

const PANELS_X = 4;
const PANELS_Y = 5;
const PER_PANEL = 140;
const SHIFT_TIME = 75;

export function initDemolition(scene, world) {
  const site = new THREE.Vector3(blockStart(0) + 20, 0, blockStart(6) + 30);

  // the condemned shell
  const shell = new THREE.Group();
  const panels = [];
  const pw = 2.4, ph = 2.4;
  for (let x = 0; x < PANELS_X; x++) {
    for (let y = 0; y < PANELS_Y; y++) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(pw - 0.1, ph - 0.1, 0.4),
        new THREE.MeshStandardMaterial({ color: 0x7a7066, roughness: 0.9 })
      );
      m.position.set((x - (PANELS_X - 1) / 2) * pw, ph / 2 + y * ph, 0);
      m.castShadow = true;
      shell.add(m);
      panels.push({ mesh: m, gone: false });
    }
  }
  shell.position.copy(site);
  scene.add(shell);

  // the tower you must NOT hit — just behind
  const neighbour = new THREE.Mesh(
    new THREE.BoxGeometry(9, 34, 9),
    new THREE.MeshStandardMaterial({ color: 0x8892a0, roughness: 0.7 })
  );
  neighbour.position.copy(site).add(new THREE.Vector3(0, 17, -12));
  scene.add(neighbour);
  const warn = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 1),
    new THREE.MeshBasicMaterial({ color: 0xff5b52 })
  );
  warn.position.copy(site).add(new THREE.Vector3(0, 8, -7.4));
  scene.add(warn);

  // the crane
  const crane = new THREE.Group();
  const tower = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 22, 1.4),
    new THREE.MeshStandardMaterial({ color: 0xf2c94c, metalness: 0.4, roughness: 0.5 })
  );
  tower.position.y = 11;
  crane.add(tower);
  const jib = new THREE.Mesh(
    new THREE.BoxGeometry(16, 0.8, 0.8),
    new THREE.MeshStandardMaterial({ color: 0xf2c94c, metalness: 0.4, roughness: 0.5 })
  );
  jib.position.set(4, 22, 0);
  crane.add(jib);
  const cab = new THREE.Mesh(
    new THREE.BoxGeometry(2, 2, 2),
    new THREE.MeshStandardMaterial({ color: 0x2b3a46 })
  );
  cab.position.set(0, 20, 0);
  crane.add(cab);
  // cable + ball
  const cable = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 10, 5),
    new THREE.MeshBasicMaterial({ color: 0x14181d })
  );
  cable.position.set(9, 17, 0);
  crane.add(cable);
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(1.1, 14, 10),
    new THREE.MeshStandardMaterial({ color: 0x33383e, metalness: 0.7, roughness: 0.4 })
  );
  ball.position.set(9, 12, 0);
  crane.add(ball);
  crane.position.copy(site).add(new THREE.Vector3(-14, 0, 4));
  scene.add(crane);

  const ringPos = crane.position.clone().add(new THREE.Vector3(0, 0, 0));
  const ring = new THREE.Mesh(
    new THREE.CylinderGeometry(2.4, 2.4, 0.5, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xf2c94c, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.position.copy(ringPos).setY(0.4);
  scene.add(ring);

  world.demo = {
    site, shell, panels, crane, cable, ball, ring,
    cranePos: crane.position.clone(),
    neighbour,
    inCrane: false,
    swing: 0, swingV: 0,
    left: 0, earned: 0, hitNeighbour: false,
    cd: 0,
  };
}

function resetShell(demo) {
  for (const p of demo.panels) {
    p.gone = false;
    p.mesh.visible = true;
    p.mesh.rotation.set(0, 0, 0);
  }
}

export function updateDemolition(world, dt, keys, pressed) {
  const demo = world.demo;
  if (!demo) return;
  world.demoHint = null;
  demo.cd = Math.max(0, demo.cd - dt);
  demo.ring.rotation.y += dt;

  const player = world.player;
  const onFoot = !player.inCar && !player.inHeli && player.pos.y < 3;
  const dCrane = Math.hypot(player.pos.x - demo.cranePos.x, player.pos.z - demo.cranePos.z);

  if (!demo.inCrane) {
    if (onFoot && dCrane < 3) {
      if (demo.cd > 0) {
        world.demoHint = `WRECKING CRANE — resetting the site (${Math.ceil(demo.cd)}s)`;
      } else {
        world.demoHint = 'WRECKING CRANE — press <b>E</b> to start a demolition shift';
        if (pressed['KeyE']) {
          demo.inCrane = true;
          demo.left = SHIFT_TIME;
          demo.earned = 0;
          demo.hitNeighbour = false;
          resetShell(demo);
          player.mesh.visible = false;
          showMissionMsg('DEMOLITION SHIFT', 'A/D swings the ball — clear the shell', '#f2c94c');
        }
      }
    }
    return;
  }

  // --- in the crane ---
  player.pos.set(demo.cranePos.x, 20, demo.cranePos.z); // sit in the cab
  demo.left -= dt;

  // pendulum physics: A/D pushes, gravity + damping bring it back
  const push = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
  demo.swingV += push * 2.4 * dt;
  demo.swingV += -demo.swing * 3 * dt;      // restoring
  demo.swingV *= (1 - 0.6 * dt);            // damping
  demo.swing = THREE.MathUtils.clamp(demo.swing + demo.swingV * dt, -1.2, 1.2);

  // place the ball from the swing angle
  const jibX = demo.cranePos.x + 9;
  const bx = jibX + Math.sin(demo.swing) * 6;
  const by = 22 - Math.cos(demo.swing) * 10;
  const bz = demo.cranePos.z + Math.cos(demo.swing) * 0; // 2D swing in X
  demo.ball.position.set(bx - demo.cranePos.x, by, 0);
  demo.cable.position.set((demo.ball.position.x + 9) / 2, (by + 22) / 2, 0);
  demo.cable.rotation.z = demo.swing;

  const ballWorld = new THREE.Vector3(bx, by, demo.cranePos.z);

  // hit panels
  let smashed = 0;
  for (const p of demo.panels) {
    if (p.gone) continue;
    const wp = p.mesh.getWorldPosition(new THREE.Vector3());
    if (ballWorld.distanceTo(wp) < 1.9 && Math.abs(demo.swingV) > 0.4) {
      p.gone = true;
      p.mesh.visible = false;
      smashed++;
      demo.earned += PER_PANEL;
      addSmoke(wp, 0.8);
      addSparks(wp, 8);
    }
  }
  if (smashed) { sfxCrash(7); world.shake = Math.max(world.shake || 0, 0.1); }

  // hit the neighbour tower = job scrubbed
  const np = demo.neighbour.getWorldPosition(new THREE.Vector3());
  if (Math.abs(ballWorld.x - np.x) < 5.5 && ballWorld.z > np.z - 6 && Math.abs(demo.swingV) > 0.5) {
    demo.hitNeighbour = true;
  }

  const remaining = demo.panels.filter((p) => !p.gone).length;
  world.demoHint = `DEMO — ${remaining} panels left · $${demo.earned} · ${Math.ceil(Math.max(0, demo.left))}s`;

  const done = remaining === 0;
  if (done || demo.left <= 0 || demo.hitNeighbour || pressed['KeyF']) {
    demo.inCrane = false;
    demo.cd = 45;
    player.mesh.visible = true;
    player.pos.set(demo.cranePos.x + 3, 0, demo.cranePos.z + 3);
    player.vy = 0;
    if (demo.hitNeighbour) {
      sfxMissionFail();
      addFlash(np.clone().setY(10), 0xff5b52, 2);
      showMissionMsg('SHIFT SCRUBBED', 'You clipped the occupied tower — no pay', '#ff5b52');
      showNews('a demolition contractor hits the wrong building');
    } else {
      const bonus = done ? 600 : 0;
      const pay = demo.earned + bonus;
      world.money += pay;
      sfxMissionPass();
      showMissionMsg(done ? 'SITE CLEARED' : 'SHIFT OVER', `+$${pay}`, '#7cf78c');
      world.onSave?.();
    }
  }
}
