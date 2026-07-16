import * as THREE from 'three';
import { blockStart, BLOCK, pointBlocked } from './city.js';
import { createCharacter, animateWalk } from './characters.js';
import { showToast, showNews, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxMissionFail, sfxShot } from './sound.js';
import { addRep, addChaos } from './economy.js';
import { addTracer, addExplosion } from './effects.js';

// DRUG LAB RAID: a tip comes in on a hidden lab in an industrial block.
// Fight through the cookers, then torch the crates. Once a day.

const REWARD = 2200;

function makeCooker(world, x, z) {
  const ch = createCharacter({ shirt: '#5a5a3a', pants: '#2a2a1a', skin: '#c98e63' });
  world.scene.add(ch.group);
  ch.group.position.set(x, 0, z);
  const foe = { ch, mesh: ch.group, pos: ch.group.position, animT: Math.random() * 5, hp: 55, dead: false, shootT: 1 + Math.random() };
  foe.target = {
    pos: foe.pos, aimY: 1.05, r: 1, webbable: true,
    get dead() { return foe.dead; },
    hit() { foe.hp -= 30; if (foe.hp <= 0 && !foe.dead) { foe.dead = true; foe.mesh.rotation.z = Math.PI / 2; foe.mesh.position.y = 0.25; } },
    web() { foe.webT = 4; },
  };
  world.targets.push(foe.target);
  return foe;
}

export function initDruglab(scene, world, save) {
  const bx = blockStart(8) + 12;
  const bz = blockStart(1) + 12;
  const probe = new THREE.Vector3(bx, 1, bz);
  const pos = pointBlocked(probe, world.city.colliders, 4) ? new THREE.Vector3(bx + 10, 0, bz + 10) : new THREE.Vector3(bx, 0, bz);

  const shed = new THREE.Mesh(
    new THREE.BoxGeometry(6, 3, 5),
    new THREE.MeshStandardMaterial({ color: 0x3a3a2a, metalness: 0.2, roughness: 0.8 })
  );
  shed.position.copy(pos).setY(1.5);
  scene.add(shed);
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 4, 8), new THREE.MeshStandardMaterial({ color: 0x6a6a6a }));
  pipe.position.copy(pos).add(new THREE.Vector3(2, 3, -2));
  scene.add(pipe);

  const crates = [];
  for (let i = 0; i < 3; i++) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1, 1.2), new THREE.MeshStandardMaterial({ color: 0xc9a020 }));
    crate.position.copy(pos).add(new THREE.Vector3(-2 + i * 2, 0.5, 3.5));
    scene.add(crate);
    const c = { mesh: crate, pos: crate.position, hp: 40, dead: false };
    c.target = {
      pos: c.pos, aimY: 0.5, r: 0.85, passive: true,
      get dead() { return c.dead; },
      hit() { c.hp -= 30; if (c.hp <= 0 && !c.dead) { c.dead = true; c.mesh.visible = false; addExplosion(c.pos); } },
    };
    world.targets.push(c.target);
    crates.push(c);
  }

  world.druglab = { pos, foes: [], crates, active: false, doneDay: save?.druglabDay ?? -99 };
}

function clearFoes(world, dl) {
  for (const f of dl.foes) {
    world.scene.remove(f.mesh);
    const ti = world.targets.indexOf(f.target);
    if (ti >= 0) world.targets.splice(ti, 1);
  }
  dl.foes = [];
}

// wasted/busted mid-raid: the lab scatters, try again later the same day
export function endDruglab(world) {
  const dl = world.druglab;
  if (!dl?.active) return;
  clearFoes(world, dl);
  dl.active = false;
  world.druglabHint = null;
  world.druglabBlip = null;
}

export function updateDruglab(world, dt) {
  const dl = world.druglab;
  if (!dl) return;
  const player = world.player;
  world.druglabHint = null;
  world.druglabBlip = null;

  if (!dl.active) {
    if (dl.doneDay === world.dailyDay) return;
    const d = Math.hypot(player.pos.x - dl.pos.x, player.pos.z - dl.pos.z);
    if (d < 40) {
      world.druglabHint = 'A TIP came in on a drug lab nearby — get close to move in';
      world.druglabBlip = { x: dl.pos.x, z: dl.pos.z };
    }
    if (d < 14 && !player.inCar) {
      dl.active = true;
      clearFoes(world, dl); // corpses from an earlier raid day
      for (const c of dl.crates) { c.hp = 40; c.dead = false; c.mesh.visible = true; }
      dl.foes = [makeCooker(world, dl.pos.x + 3, dl.pos.z), makeCooker(world, dl.pos.x - 3, dl.pos.z + 2), makeCooker(world, dl.pos.x, dl.pos.z - 3)];
      sfxMissionFail();
      showMissionMsg('DRUG LAB RAID', 'Clear the cookers, then torch the crates', '#c9a020');
      showNews('gunfire reported at an industrial-block "storage facility"');
    }
    return;
  }

  world.druglabBlip = { x: dl.pos.x, z: dl.pos.z };
  const alive = dl.foes.filter((f) => !f.dead);
  for (const f of alive) {
    if (f.webT > 0) { f.webT -= dt; continue; }
    const dx = player.pos.x - f.pos.x, dz = player.pos.z - f.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    if (d < 30) {
      f.mesh.rotation.y = Math.atan2(dx, dz);
      f.shootT -= dt;
      if (f.shootT <= 0 && d < 24 && !player.inCar) {
        f.shootT = 1.4 + Math.random();
        sfxShot('pistol');
        addTracer(f.pos.clone().setY(1.4), player.pos.clone().setY(player.pos.y + 1.1));
        if (Math.random() < 0.3 && !(player.dodgeT > 0)) player.health -= 6;
      }
    }
  }
  if (alive.length) {
    world.druglabHint = `DRUG LAB — cookers left: <b>${alive.length}</b>`;
    return;
  }
  const liveCrates = dl.crates.filter((c) => !c.dead);
  if (liveCrates.length) {
    world.druglabHint = `Shoot the CRATES — ${liveCrates.length} left`;
    return;
  }
  dl.active = false;
  dl.doneDay = world.dailyDay;
  const pay = Math.round(REWARD * (world.payMult || 1));
  world.money += pay;
  addRep(world, 300);
  addChaos(world, 25);
  if (world.stats) world.stats.druglabs = (world.stats.druglabs || 0) + 1;
  sfxMissionPass();
  showMissionMsg('LAB SHUT DOWN', `+$${pay}`, '#c9a020');
  showNews('a chemical fire lights up an industrial block; nobody claims responsibility');
  world.onSave?.();
}
