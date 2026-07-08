import * as THREE from 'three';
import { showToast, showNews, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxMissionFail } from './sound.js';
import { addRep, addChaos } from './economy.js';

// Turf wars: once you own the Viper district, a rival crew (the Jackals)
// periodically rolls in to take it back. Wipe them out before the timer
// runs dry or the district flips back to hostile.

const ATTACK_TIME = 75;

function makeRival(world, zone) {
  const x = zone.x0 + 6 + Math.random() * (zone.x1 - zone.x0 - 12);
  const z = zone.z0 + 6 + Math.random() * (zone.z1 - zone.z0 - 12);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 1.8, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x5a2a80, metalness: 0.35, roughness: 0.6 })
  );
  mesh.position.set(x, 0.9, z);
  world.scene.add(mesh);
  const foe = { mesh, pos: mesh.position, hp: 40, dead: false };
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

function clearRivals(world) {
  const t = world.turf;
  for (const f of t.foes) {
    world.scene.remove(f.mesh);
    const ti = world.targets.indexOf(f.target);
    if (ti >= 0) world.targets.splice(ti, 1);
  }
  t.foes = [];
}

export function initTurfWar(scene, world) {
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(2.4, 3.4, 50, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xb04aff, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false })
  );
  beam.visible = false;
  scene.add(beam);
  world.turf = { active: false, t: 150, timer: 0, foes: [], beam };
}

export function updateTurfWar(world, dt) {
  const t = world.turf;
  const gang = world.gang;
  if (!gang) return;

  if (!t.active) {
    if (!gang.owned) return;
    t.t -= dt;
    if (t.t > 0) return;
    t.t = 220 + Math.random() * 140; // next raid window
    t.active = true;
    t.timer = ATTACK_TIME;
    const z = gang.zone;
    for (let i = 0; i < 6; i++) t.foes.push(makeRival(world, z));
    t.beam.position.set((z.x0 + z.x1) / 2, 25, (z.z0 + z.z1) / 2);
    t.beam.visible = true;
    sfxMissionFail();
    showMissionMsg('TURF UNDER ATTACK!', 'The Jackals are raiding your district', '#b04aff');
    showNews('rival crew spotted moving into viper territory');
    return;
  }

  t.timer -= dt;
  const alive = t.foes.filter((f) => !f.dead);
  world.turfHint = `TURF WAR — <b>${alive.length}</b> Jackals left · ${Math.ceil(t.timer)}s`;
  t.beam.rotation.y += dt;

  const player = world.player;
  const focus = player.inCar ? player.inCar.pos : player.pos;
  for (const f of alive) {
    const dx = focus.x - f.pos.x;
    const dz = focus.z - f.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    if (d < 40 && d > 1.8) { // they come for you when you show up
      f.pos.x += (dx / d) * 3.6 * dt;
      f.pos.z += (dz / d) * 3.6 * dt;
      f.mesh.rotation.y = Math.atan2(dx, dz);
    } else if (d <= 1.8 && Math.random() < dt * 1.2 && !player.inCar) {
      player.health -= 4;
    }
  }

  if (alive.length === 0) {
    t.active = false;
    world.turfHint = null;
    t.beam.visible = false;
    clearRivals(world);
    world.money += 500;
    addRep(world, 200);
    addChaos(world, 25);
    sfxMissionPass();
    showMissionMsg('TURF DEFENDED', '+$500 — the Jackals limp home', '#7cf78c');
    world.onSave?.();
  } else if (t.timer <= 0) {
    t.active = false;
    world.turfHint = null;
    t.beam.visible = false;
    clearRivals(world);
    gang.owned = false;
    gang.kills = Math.max(0, gang.kills - 5);
    sfxMissionFail();
    showMissionMsg('TURF LOST', 'The Jackals took the district — win it back', '#ff5a4a');
    showNews('the vipers lose their grip on the district');
    world.onSave?.();
  }
}
