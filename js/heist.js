import * as THREE from 'three';
import { blockStart } from './city.js';
import { showToast, showNews, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxMissionFail } from './sound.js';
import { addRep, addChaos } from './economy.js';
import { addCrime } from './police.js';

// The CITY BANK job: hold the lobby while the drill runs, then lose the heat
// and reach the safehouse with the take. Once per in-game day.

const DRILL_TIME = 20;
const REWARD = 3000;

function makeGuard(world, x, z) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 1.8, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x1c2c50, metalness: 0.4, roughness: 0.6 })
  );
  mesh.position.set(x, 0.9, z);
  world.scene.add(mesh);
  const foe = { mesh, pos: mesh.position, hp: 50, dead: false };
  foe.target = {
    pos: foe.pos, aimY: 0.9, r: 1.0,
    get dead() { return foe.dead; },
    hit() {
      foe.hp -= 30;
      if (foe.hp <= 0 && !foe.dead) { foe.dead = true; foe.mesh.visible = false; }
    },
  };
  world.targets.push(foe.target);
  return foe;
}

function clearGuards(world) {
  const h = world.heist;
  for (const f of h.foes) {
    world.scene.remove(f.mesh);
    const ti = world.targets.indexOf(f.target);
    if (ti >= 0) world.targets.splice(ti, 1);
  }
  h.foes = [];
}

function spawnGuards(world, n) {
  const h = world.heist;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    h.foes.push(makeGuard(world, h.pos.x + Math.sin(a) * 10, h.pos.z + Math.cos(a) * 10));
  }
}

export function initHeist(scene, world, save) {
  const bx = blockStart(8) + 4;
  const bz = blockStart(5) + 4;

  // the bank: a squat marble box with a gold sign
  const bank = new THREE.Mesh(
    new THREE.BoxGeometry(4, 4.4, 4),
    new THREE.MeshStandardMaterial({ color: 0xd8d2c2, metalness: 0.1, roughness: 0.7 })
  );
  bank.position.set(bx, 2.2, bz);
  bank.castShadow = true;
  scene.add(bank);
  const c = document.createElement('canvas');
  c.width = 128; c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#0a0a10'; g.fillRect(0, 0, 128, 32);
  g.fillStyle = '#ffd24a'; g.font = 'bold 19px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('CITY BANK', 64, 17);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshBasicMaterial({ map: tex }));
  sign.position.set(bx, 4.2, bz + 2.05);
  scene.add(sign);
  world.city.colliders.push({ x0: bx - 2, z0: bz - 2, x1: bx + 2, z1: bz + 2, h: 4.6 });

  const ring = new THREE.Mesh(
    new THREE.CylinderGeometry(3.4, 3.4, 0.5, 22, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.position.set(bx, 0.4, bz + 5);
  scene.add(ring);

  // safehouse beacon (hidden until the escape leg)
  const safe = world.city.spawn.clone().add(new THREE.Vector3(14, 0, -10)); // the web den
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 2.2, 44, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x7cf78c, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false })
  );
  beam.position.set(safe.x, 22, safe.z);
  beam.visible = false;
  scene.add(beam);

  world.heist = {
    pos: new THREE.Vector3(bx, 0, bz + 5),
    ring, beam, safe,
    state: 'idle',
    holdT: 0,
    t: 0,
    wave2: false,
    foes: [],
    doneDay: save.heistDay ?? -99,
  };
}

export function failHeist(world) {
  const h = world.heist;
  if (!h || h.state === 'idle') return;
  h.state = 'idle';
  h.holdT = 0;
  clearGuards(world);
  h.beam.visible = false;
  sfxMissionFail();
  showMissionMsg('HEIST FAILED', 'The crew scattered — try tomorrow', '#ff5a4a');
}

export function updateHeist(world, dt, keys, pressed) {
  const h = world.heist;
  const player = world.player;
  world.heistHint = null;
  h.ring.rotation.y += dt;
  h.ring.visible = h.state === 'idle' && h.doneDay !== world.dailyDay;

  const d = Math.hypot(player.pos.x - h.pos.x, player.pos.z - h.pos.z);
  const onFoot = !player.inCar && !player.inHeli && !player.inBoat && player.pos.y < 2;

  if (h.state === 'idle') {
    if (!onFoot || d > 3.4) { h.holdT = 0; return; }
    if (h.doneDay === world.dailyDay) {
      world.heistHint = 'CITY BANK — vault already cleaned out today';
      return;
    }
    if (keys['KeyE']) {
      h.holdT += dt;
      world.heistHint = `CRACKING THE VAULT... ${Math.ceil((1.5 - h.holdT) * 10) / 10}s`;
      if (h.holdT >= 1.5) {
        h.holdT = 0;
        h.state = 'drill';
        h.t = DRILL_TIME;
        h.wave2 = false;
        spawnGuards(world, 4);
        addCrime(world, 3);
        sfxMissionPass();
        showMissionMsg('THE BANK JOB', 'Hold the lobby while the drill runs!', '#ffd24a');
        showNews('silent alarm tripped at the city bank');
      }
    } else {
      h.holdT = Math.max(0, h.holdT - dt * 2);
      world.heistHint = 'CITY BANK — hold <b>E</b> to crack the vault (crew job, big take)';
    }
    return;
  }

  if (h.state === 'drill') {
    if (d < 15) {
      h.t -= dt;
      world.heistHint = `VAULT DRILL — <b>${Math.ceil(h.t)}s</b> · hold the lobby!`;
    } else {
      world.heistHint = 'GET BACK TO THE BANK — the drill stalled!';
    }
    if (!h.wave2 && h.t < DRILL_TIME / 2) {
      h.wave2 = true;
      spawnGuards(world, 4);
      showToast('MORE GUARDS INBOUND!');
    }
    // guards close in and swing
    for (const f of h.foes) {
      if (f.dead) continue;
      const dx = player.pos.x - f.pos.x;
      const dz = player.pos.z - f.pos.z;
      const fd = Math.hypot(dx, dz) || 1;
      if (fd > 1.8) {
        f.pos.x += (dx / fd) * 3.8 * dt;
        f.pos.z += (dz / fd) * 3.8 * dt;
        f.mesh.rotation.y = Math.atan2(dx, dz);
      } else if (Math.random() < dt * 1.2) {
        player.health -= 5;
      }
    }
    if (h.t <= 0) {
      h.state = 'escape';
      clearGuards(world);
      h.beam.visible = true;
      world.wanted = Math.max(world.wanted, 4);
      world.wantedTimer = 0;
      addChaos(world, 40);
      sfxMissionPass();
      showMissionMsg('GRAB THE CASH!', 'Now lose them — get to the green beam', '#7cf78c');
      showNews('armed crew empties the city bank vault');
    }
    return;
  }

  // escape leg: reach the safehouse beam with the take
  world.heistHint = 'HEIST — escape to the <b>green beam</b> at the web den!';
  h.beam.rotation.y += dt;
  if (Math.hypot(player.pos.x - h.safe.x, player.pos.z - h.safe.z) < 5) {
    h.state = 'idle';
    h.doneDay = world.dailyDay;
    h.beam.visible = false;
    world.money += REWARD;
    addRep(world, 800);
    world.addXP?.(400);
    sfxMissionPass();
    showMissionMsg('HEIST COMPLETE!', `+$${REWARD} — the city will remember this`, '#ffd24a');
    showNews('bank robbers vanish without a trace');
    world.onSave?.();
  }
}
