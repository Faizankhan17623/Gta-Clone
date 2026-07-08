import * as THREE from 'three';
import { blockStart, BLOCK } from './city.js';
import { showToast, showNews, showMissionMsg } from './hud.js';
import { sfxMissionPass } from './sound.js';
import { addRep, addChaos } from './economy.js';

// Wave-survival arena at the stadium: step into the ring, fight escalating
// waves of the enemies we already have (gang -> SWAT -> drones -> mech).
// Score = waves cleared; cash + rep on each wave. Reuses world.targets so
// every existing weapon/web works.

export function initArena(scene, world, save) {
  // the central park lawn: open, walkable ground around the fountain
  // (the stadium bowl itself is a solid collider — nothing can stand inside it)
  const cx = blockStart(5) + BLOCK / 2;
  const cz = blockStart(5) + BLOCK / 2;
  const ring = new THREE.Mesh(
    new THREE.CylinderGeometry(20, 20, 0.4, 32, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xff5a3c, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.position.set(cx, 0.3, cz);
  scene.add(ring);

  world.arena = {
    pos: new THREE.Vector3(cx, 0, cz),
    ring,
    active: false,
    wave: 0,
    best: save.arenaBest | 0,
    foes: [],
    spawnT: 0,
  };
}

function makeFoe(world, kind, cx, cz) {
  const a = Math.random() * Math.PI * 2;
  const x = cx + Math.sin(a) * 16;
  const z = cz + Math.cos(a) * 16;
  // lightweight foe reusing the gang-member visual path via a simple box
  const mat = new THREE.MeshStandardMaterial({
    color: kind === 'drone' ? 0x181c24 : kind === 'swat' ? 0x20293d : 0xa02020,
    metalness: 0.5, roughness: 0.5,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.8, 0.5), mat);
  const y = kind === 'drone' ? 6 : 0.9;
  mesh.position.set(x, y, z);
  world.scene.add(mesh);
  const foe = { mesh, pos: mesh.position, hp: kind === 'swat' ? 60 : kind === 'drone' ? 40 : 40, dead: false, kind };
  foe.target = {
    pos: foe.pos, aimY: kind === 'drone' ? 0 : 0.9, r: 1.0,
    get dead() { return foe.dead; },
    hit(w) {
      foe.hp -= 30;
      if (foe.hp <= 0 && !foe.dead) { foe.dead = true; foe.mesh.visible = false; }
    },
  };
  world.targets.push(foe.target);
  world.arena.foes.push(foe);
}

function spawnWave(world) {
  const a = world.arena;
  a.wave++;
  const n = 2 + a.wave;
  const kinds = a.wave >= 6 ? ['gang', 'swat', 'drone'] : a.wave >= 3 ? ['gang', 'swat'] : ['gang'];
  for (let i = 0; i < n; i++) {
    makeFoe(world, kinds[(Math.random() * kinds.length) | 0], a.pos.x, a.pos.z);
  }
  showMissionMsg(`WAVE ${a.wave}`, `${n} incoming`, '#ff5a3c');
}

function clearArena(world) {
  const a = world.arena;
  for (const f of a.foes) {
    world.scene.remove(f.mesh);
    const ti = world.targets.indexOf(f.target);
    if (ti >= 0) world.targets.splice(ti, 1);
  }
  a.foes = [];
}

export function endArena(world, quit) {
  const a = world.arena;
  if (!a.active) return;
  a.active = false;
  clearArena(world);
  const score = a.wave;
  if (score > a.best) { a.best = score; world.onSave?.(); }
  showMissionMsg(quit ? 'ARENA LEFT' : 'ARENA OVER', `Reached wave ${score} · best ${a.best}`, '#ffd24a');
  world.money += score * 200;
  addRep(world, score * 100);
}

export function updateArena(world, dt) {
  const a = world.arena;
  const player = world.player;
  const focus = player.inCar ? player.inCar.pos : player.pos;
  const near = Math.hypot(focus.x - a.pos.x, focus.z - a.pos.z) < 18;

  a.ring.material.opacity = 0.25 + Math.sin(world.time * 3) * 0.1;

  if (!a.active) {
    if (near && !player.inCar && !player.inHeli) {
      world.arenaHint = `Press <b>H</b> to start the ARENA (best: wave ${a.best})`;
      if (world._startArena) {
        world._startArena = false;
        a.active = true;
        a.wave = 0;
        a.spawnT = 0;
        world.money += 0;
        showNews('the arena challenge begins');
        spawnWave(world);
      }
    } else {
      world.arenaHint = null;
    }
    return;
  }

  world.arenaHint = `ARENA — WAVE ${a.wave} · foes ${a.foes.filter((f) => !f.dead).length}`;

  // leaving the ring or dying ends it
  if (!near) { endArena(world, true); return; }

  // simple foe pursuit
  for (const f of a.foes) {
    if (f.dead) continue;
    const dx = focus.x - f.pos.x;
    const dz = focus.z - f.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    if (f.kind === 'drone') {
      f.pos.x += (dx / d) * 5 * dt;
      f.pos.z += (dz / d) * 5 * dt;
      f.pos.y = 5 + Math.sin(world.time * 2) * 0.5;
    } else if (d > 2) {
      f.pos.x += (dx / d) * 3.5 * dt;
      f.pos.z += (dz / d) * 3.5 * dt;
      f.mesh.rotation.y = Math.atan2(dx, dz);
      if (d < 2.5 && Math.random() < dt) player.health -= 4;
    }
  }

  // next wave when all cleared
  if (a.foes.every((f) => f.dead)) {
    world.money += a.wave * 120;
    addRep(world, a.wave * 40);
    addChaos(world, 20);
    showToast(`WAVE ${a.wave} CLEAR +$${a.wave * 120}`);
    a.spawnT += dt;
    if (a.spawnT > 1.5) {
      a.spawnT = 0;
      clearArena(world);
      spawnWave(world);
    }
  }
}
