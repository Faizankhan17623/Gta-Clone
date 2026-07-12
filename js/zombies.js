import * as THREE from 'three';
import { resolveCircle, HALF } from './city.js';
import { createCharacter, animateWalk } from './characters.js';
import { showToast, showNews, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxMissionFail } from './sound.js';
import { addRep, addChaos } from './economy.js';
import { addFlash, addSparks } from './effects.js';

// Outbreak Night: some nights, around 22:00, the sirens wail and the city
// turns. Shambling citizens pour out of the dark in growing numbers — survive
// until dawn (06:00) for a payout, and every zombie dropped pays a little.
// Rare and random, or summon it yourself with the BRAINS cheat.

const OUTBREAK_CHANCE = 0.3; // rolled once per nightfall
const MAX_HORDE = 20;
const BOUNTY = 50;

const ZOMBIE_SKINS = ['#7a9a5a', '#6a8a52', '#8aa06a'];
const GROANS = ['GRRRAAA...', 'BRAAAINS...', 'HUNGRY...', 'RRRGH...'];

function makeZombie(world, x, z) {
  const ch = createCharacter({
    shirt: ['#3a4a32', '#4a3a30', '#38323e'][(Math.random() * 3) | 0],
    pants: '#262e22',
    skin: ZOMBIE_SKINS[(Math.random() * ZOMBIE_SKINS.length) | 0],
    hair: '#1a2014',
  });
  world.scene.add(ch.group);
  ch.group.position.set(x, 0, z);
  ch.group.rotation.x = 0.12; // the lean of the walking dead
  const zb = {
    ch,
    mesh: ch.group,
    pos: ch.group.position,
    animT: Math.random() * 6,
    hp: 40,
    dead: false,
    deadT: 0,
    lurch: Math.random() * Math.PI * 2, // desync the shamble
    biteT: 0,
  };
  zb.target = {
    pos: zb.pos, aimY: 1.0, r: 0.95, webbable: true,
    get dead() { return zb.dead; },
    hit(w) {
      zb.hp -= 34;
      addSparks(zb.pos.clone().setY(1.2), 4);
      if (zb.hp <= 0 && !zb.dead) killZombie(w, zb);
    },
    web() { zb.webT = 4; },
  };
  world.targets.push(zb.target);
  return zb;
}

function killZombie(world, zb) {
  if (zb.dead) return;
  zb.dead = true;
  zb.deadT = 0;
  zb.mesh.rotation.z = Math.PI / 2;
  zb.mesh.position.y = 0.25;
  const zs = world.zombies;
  zs.killed++;
  world.money += BOUNTY;
  if (world.stats) world.stats.zombies = (world.stats.zombies || 0) + 1;
  addChaos(world, 4);
  if (Math.random() < 0.2) showToast(`ZOMBIE DOWN +$${BOUNTY} (${zs.killed} tonight)`);
}

function removeZombie(world, i) {
  const zb = world.zombies.list[i];
  world.scene.remove(zb.mesh);
  const ti = world.targets.indexOf(zb.target);
  if (ti >= 0) world.targets.splice(ti, 1);
  world.zombies.list.splice(i, 1);
}

function spawnAroundPlayer(world) {
  const player = world.player;
  const a = Math.random() * Math.PI * 2;
  const d = 35 + Math.random() * 25; // out of the fog, never in your face
  const x = Math.max(-HALF + 4, Math.min(HALF - 4, player.pos.x + Math.sin(a) * d));
  const z = Math.max(-HALF + 4, Math.min(HALF - 4, player.pos.z + Math.cos(a) * d));
  world.zombies.list.push(makeZombie(world, x, z));
}

export function initZombies(scene, world) {
  world.zombies = { active: false, list: [], killed: 0, spawnT: 0, rolled: false, groanT: 3 };
}

export function startOutbreak(world) {
  const zs = world.zombies;
  if (zs.active) return;
  zs.active = true;
  zs.killed = 0;
  zs.spawnT = 0;
  zs.groanT = 2;
  for (let i = 0; i < 6; i++) spawnAroundPlayer(world);
  sfxMissionFail();
  showMissionMsg('☣ OUTBREAK', 'Something is wrong with the city tonight. Survive until dawn.', '#7cf78c');
  showNews('EMERGENCY BROADCAST — residents urged to stay indoors, avoid the bitten');
}

export function endOutbreak(world, survived) {
  const zs = world.zombies;
  if (!zs?.active) return;
  zs.active = false;
  for (let i = zs.list.length - 1; i >= 0; i--) removeZombie(world, i);
  if (survived) {
    const bonus = 2000 + zs.killed * 25;
    world.money += bonus;
    addRep(world, 400);
    if (world.stats) world.stats.outbreaks = (world.stats.outbreaks || 0) + 1;
    sfxMissionPass();
    showMissionMsg('DAWN BREAKS', `You survived the outbreak — +$${bonus} (${zs.killed} put down)`, '#ffd24a');
    showNews('officials blame last night\'s chaos on "contaminated street food"');
    world.onSave?.();
  } else {
    showNews('the horde disperses at first light, leaving only questions');
  }
}

const _zv = new THREE.Vector3();

export function updateZombies(world, dt) {
  const zs = world.zombies;
  if (!zs) return;
  const player = world.player;

  if (!zs.active) {
    // roll the dice once per nightfall (22:00), skip if something big is on
    if (world.clock >= 22 && !zs.rolled) {
      zs.rolled = true;
      const busy = world.mission?.active || world.finale?.active || world.prison?.inside || world.nemesis?.active;
      if (!busy && Math.random() < OUTBREAK_CHANCE) startOutbreak(world);
    }
    if (world.clock > 6 && world.clock < 21) zs.rolled = false;
    return;
  }

  // dawn ends it
  if (world.clock >= 6 && world.clock < 21) { endOutbreak(world, true); return; }

  world.zombieHint = `☣ OUTBREAK — survive until <b>06:00</b> · horde: ${zs.list.filter((z) => !z.dead).length} · down: ${zs.killed}`;

  // the horde grows as the night deepens
  zs.spawnT -= dt;
  const alive = zs.list.filter((z) => !z.dead).length;
  if (zs.spawnT <= 0 && alive < MAX_HORDE) {
    zs.spawnT = 3.2;
    spawnAroundPlayer(world);
  }

  // ambient groans drift out of the dark
  zs.groanT -= dt;
  if (zs.groanT <= 0) {
    zs.groanT = 4 + Math.random() * 4;
    const near = zs.list.find((z) => !z.dead && z.pos.distanceTo(player.pos) < 30);
    if (near) world.bark?.(near.pos, GROANS[(Math.random() * GROANS.length) | 0]);
  }

  const focus = player.inCar ? player.inCar.pos : player.pos;

  for (let i = zs.list.length - 1; i >= 0; i--) {
    const zb = zs.list[i];
    if (zb.dead) {
      zb.deadT += dt;
      if (zb.deadT > 10) removeZombie(world, i);
      continue;
    }
    if (zb.webT > 0) { zb.webT -= dt; continue; }

    zb.lurch += dt;
    const dx = focus.x - zb.pos.x;
    const dz = focus.z - zb.pos.z;
    const d = Math.hypot(dx, dz) || 1;

    // too far behind: shuffle it forward so the horde never thins out
    if (d > 90) {
      removeZombie(world, i);
      spawnAroundPlayer(world);
      continue;
    }

    // stagger toward you with a drunken weave
    const spd = 2.4 + Math.sin(zb.lurch * 1.7) * 0.5;
    _zv.set(dx / d + Math.sin(zb.lurch * 2.3) * 0.35, 0, dz / d + Math.cos(zb.lurch * 1.9) * 0.35).normalize();
    zb.pos.addScaledVector(_zv, spd * dt);
    resolveCircle(zb.pos, 0.4, world.city.colliders);
    zb.mesh.rotation.y = Math.atan2(_zv.x, _zv.z);
    zb.animT += spd * dt * 2.2;
    animateWalk(zb.ch, zb.animT, 0.5);
    zb.ch.lArm.rotation.x = -1.4; // arms out, classic
    zb.ch.rArm.rotation.x = -1.4;

    // bites: on foot they chew you, in a car they claw the panels
    zb.biteT -= dt;
    if (d < 1.8 && zb.biteT <= 0 && player.pos.y < 2.5) {
      zb.biteT = 0.9;
      if (player.inCar) {
        player.inCar.health -= 3;
        addSparks(zb.pos.clone().setY(1), 3);
      } else if (!(player.dodgeT > 0)) {
        player.health -= 8;
        world.damageFlash = Math.min(1, (world.damageFlash || 0) + 0.3);
        addFlash(player.pos.clone().setY(1.2), 0x7cf78c, 0.3);
      }
    }

    // run them down — it's the apocalypse, nobody's counting
    if (player.inCar && !player.inCar.dead && player.inCar.vel.lengthSq() > 20 && d < 1.9) {
      killZombie(world, zb);
    }
  }
}
