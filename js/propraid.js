import * as THREE from 'three';
import { showToast, showNews, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxMissionFail } from './sound.js';
import { addRep, addChaos } from './economy.js';

// Property raids: once you own real estate, crooks come for it. Every few
// minutes a crew hits one of your properties — wipe them out before the
// timer dies or the place gets ransacked and pays no income for the day.

const ATTACK_TIME = 70;

function makeRaider(world, pos) {
  const a = Math.random() * Math.PI * 2;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 1.8, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x8a2a1a, metalness: 0.35, roughness: 0.6 })
  );
  mesh.position.set(pos.x + Math.sin(a) * (8 + Math.random() * 8), 0.9, pos.z + Math.cos(a) * (8 + Math.random() * 8));
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

function clearRaiders(world) {
  const r = world.propRaid;
  for (const f of r.foes) {
    world.scene.remove(f.mesh);
    const ti = world.targets.indexOf(f.target);
    if (ti >= 0) world.targets.splice(ti, 1);
  }
  r.foes = [];
}

export function initPropRaids(scene, world) {
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(2.4, 3.4, 50, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xff4a3d, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false })
  );
  beam.visible = false;
  scene.add(beam);
  world.propRaid = { active: false, t: 320 + Math.random() * 200, timer: 0, foes: [], beam, mark: null };
  world.propRansacked = {}; // key -> dailyDay it was hit
}

export function updatePropRaids(world, dt) {
  const r = world.propRaid;
  if (!r) return;

  if (!r.active) {
    const owned = world.propMarks?.filter((m) => world.props.owned[m.def.key]);
    if (!owned || !owned.length) return;
    if (world.turf?.active || world.heist?.state === 'drill') return; // one siege at a time
    r.t -= dt;
    if (r.t > 0) return;
    r.t = 320 + Math.random() * 240;
    r.mark = owned[(Math.random() * owned.length) | 0];
    r.timer = ATTACK_TIME;
    for (let i = 0; i < 5; i++) r.foes.push(makeRaider(world, r.mark.pos));
    r.beam.position.set(r.mark.pos.x, 25, r.mark.pos.z);
    r.beam.visible = true;
    r.active = true;
    sfxMissionFail();
    showMissionMsg('PROPERTY UNDER ATTACK!', `Crooks are hitting ${r.mark.def.name}`, '#ff5a4a');
    showNews(`armed crew spotted outside ${r.mark.def.name.toLowerCase()}`);
    return;
  }

  r.timer -= dt;
  r.beam.rotation.y += dt;
  const alive = r.foes.filter((f) => !f.dead);
  world.raidHint = `DEFEND ${r.mark.def.name} — <b>${alive.length}</b> crooks left · ${Math.ceil(r.timer)}s`;

  const player = world.player;
  const focus = player.inCar ? player.inCar.pos : player.pos;
  for (const f of alive) {
    const dx = focus.x - f.pos.x;
    const dz = focus.z - f.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    if (d < 40 && d > 1.8) { // they turn on you when you show up
      f.pos.x += (dx / d) * 3.6 * dt;
      f.pos.z += (dz / d) * 3.6 * dt;
      f.mesh.rotation.y = Math.atan2(dx, dz);
    } else if (d <= 1.8 && Math.random() < dt * 1.2 && !player.inCar) {
      player.health -= 4;
    }
  }

  if (alive.length === 0) {
    r.active = false;
    world.raidHint = null;
    r.beam.visible = false;
    clearRaiders(world);
    world.money += 400;
    addRep(world, 250);
    addChaos(world, 20);
    sfxMissionPass();
    showMissionMsg('PROPERTY DEFENDED', `+$400 — ${r.mark.def.name} stays yours`, '#7cf78c');
    showNews('security crew repels a raid downtown');
    world.onSave?.();
  } else if (r.timer <= 0) {
    r.active = false;
    world.raidHint = null;
    r.beam.visible = false;
    clearRaiders(world);
    world.propRansacked[r.mark.def.key] = world.dailyDay;
    sfxMissionFail();
    showMissionMsg('RANSACKED', `${r.mark.def.name} pays no income today`, '#ff5a4a');
    showNews(`${r.mark.def.name.toLowerCase()} looted while the owner was elsewhere`);
    showToast('Income from that property is lost until tomorrow');
  }
}
