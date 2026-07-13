import * as THREE from 'three';
import { resolveCircle, pointBlocked, HALF } from './city.js';
import { createCharacter, animateWalk } from './characters.js';
import { showToast, showNews, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxMissionFail, sfxShot } from './sound.js';
import { addRep, addChaos } from './economy.js';
import { addTracer, addFlash, addExplosion, addSparks } from './effects.js';

// The Nemesis: a rival kingpin who never forgets. He ambushes you when you
// least expect it — mid-stroll, mid-race, mid-anything — and every time you
// put him down he crawls back meaner, with a fresh scar and a bigger crew.
// Put him down five times and the feud ends for good.

const NAMES = ['VIPER', 'VIPER — SCARRED', 'VIPER — FURIOUS', 'VIPER — UNHINGED', 'VIPER — THE LAST DANCE'];
const TAUNTS = [
  'You should have finished me.',
  'Every scar has your name on it.',
  'This city is not big enough for us both.',
  'I dream about this moment. Every night.',
  'One of us dies tonight. For real this time.',
];
const ESCAPE_LINES = [
  'a black car screeches away — this is not over',
  'the rival vanishes into the night, nursing a grudge',
  'witnesses say he was laughing as he fled',
];
const AMBUSH_MIN = 210; // seconds of play before he first shows up
const AMBUSH_VAR = 180;

function makeScarredFace(ch, lvl) {
  // one pale scar across the head per defeat — he wears the history
  for (let i = 0; i < lvl - 1 && i < 4; i++) {
    const scar = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.035, 0.05),
      new THREE.MeshBasicMaterial({ color: 0xe8d8c8 })
    );
    scar.position.set(0, 1.78 - i * 0.07, 0.18);
    scar.rotation.z = (i % 2 ? -1 : 1) * 0.35;
    ch.group.add(scar);
  }
}

function makeNemesisFoe(world, lvl, x, z) {
  const ch = createCharacter({ shirt: '#4a0d14', pants: '#14090b', skin: '#b98a6a', hair: '#0a0a0a' });
  ch.group.scale.setScalar(1.18); // bigger than any street thug
  makeScarredFace(ch, lvl);
  world.scene.add(ch.group);
  ch.group.position.set(x, 0, z);
  const foe = {
    ch,
    mesh: ch.group,
    pos: ch.group.position,
    heading: 0,
    animT: 0,
    hp: 140 + lvl * 90,
    maxHp: 140 + lvl * 90,
    dead: false,
    shootT: 2,
    lungeT: 0,
  };
  foe.target = {
    pos: foe.pos, aimY: 1.1, r: 1.1, webbable: true,
    get dead() { return foe.dead; },
    hit() {
      foe.hp -= 30;
      addSparks(foe.pos.clone().setY(1.4), 5);
      if (foe.hp <= 0 && !foe.dead) foe.dead = true;
    },
    web() { foe.webT = 2.5; }, // he tears free fast — he's learned about the webs
  };
  world.targets.push(foe.target);
  return foe;
}

function makeHench(world, x, z) {
  const ch = createCharacter({ shirt: '#2a1216', pants: '#191014', skin: '#a97e5c' });
  world.scene.add(ch.group);
  ch.group.position.set(x, 0, z);
  const foe = { ch, mesh: ch.group, pos: ch.group.position, heading: 0, animT: Math.random() * 5, hp: 50, dead: false, shootT: 1 + Math.random() * 2 };
  foe.target = {
    pos: foe.pos, aimY: 1.0, r: 0.95, webbable: true,
    get dead() { return foe.dead; },
    hit() {
      foe.hp -= 30;
      if (foe.hp <= 0 && !foe.dead) foe.dead = true;
    },
    web() { foe.webT = 5; },
  };
  world.targets.push(foe.target);
  return foe;
}

function clearFight(world) {
  const nm = world.nemesis;
  for (const f of [nm.foe, ...nm.crew]) {
    if (!f) continue;
    world.scene.remove(f.mesh);
    const ti = world.targets.indexOf(f.target);
    if (ti >= 0) world.targets.splice(ti, 1);
  }
  nm.foe = null;
  nm.crew = [];
  nm.active = false;
}

export function initNemesis(scene, world, save) {
  world.nemesis = {
    // prestige stars mean he never comes back soft
    lvl: Math.min(5, Math.max(save?.nemLvl || 1, 1 + (world.prestige | 0))),
    beaten: save?.nemBeaten | 0,
    active: false,
    foe: null,
    crew: [],
    ambushT: AMBUSH_MIN * 0.5 + Math.random() * AMBUSH_VAR,
    fleeT: 0,
  };
}

// cheat / debug: he shows up right now
export function forceNemesis(world) {
  if (world.nemesis.beaten >= 5) { showToast('The feud is over. He is not coming back.'); return; }
  if (!world.nemesis.active) world.nemesis.ambushT = 0;
}

// called when the player goes down — he gloats and slips away
export function endNemesisFight(world) {
  const nm = world.nemesis;
  if (!nm?.active) return;
  clearFight(world);
  nm.ambushT = AMBUSH_MIN * 0.4 + Math.random() * AMBUSH_VAR * 0.5; // back soon, smelling blood
  showNews('the rival walks away from a body, satisfied — for now');
}

function startAmbush(world) {
  const nm = world.nemesis;
  const player = world.player;
  // spawn the pack on open ground 22-30m out, roughly ahead of the camera
  let x = player.pos.x;
  let z = player.pos.z;
  const probe = new THREE.Vector3();
  for (let i = 0; i < 24; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = 22 + Math.random() * 8;
    x = player.pos.x + Math.sin(a) * d;
    z = player.pos.z + Math.cos(a) * d;
    x = Math.max(-HALF + 6, Math.min(HALF - 6, x));
    z = Math.max(-HALF + 6, Math.min(HALF - 6, z));
    probe.set(x, 1, z);
    if (!pointBlocked(probe, world.city.colliders)) break;
  }
  nm.foe = makeNemesisFoe(world, nm.lvl, x, z);
  nm.crew = [];
  for (let i = 0; i < nm.lvl; i++) {
    nm.crew.push(makeHench(world, x + Math.sin(i * 2.3) * 3.5, z + Math.cos(i * 2.3) * 3.5));
  }
  nm.active = true;
  nm.fleeT = 0;
  world.slowmoT = Math.max(world.slowmoT || 0, 1.1); // the dread moment
  sfxMissionFail();
  showMissionMsg('AMBUSH — ' + NAMES[nm.lvl - 1], `"${TAUNTS[nm.lvl - 1]}"`, '#ff3b3b');
  showNews('gunmen pour out of a black car downtown');
}

function defeated(world) {
  const nm = world.nemesis;
  clearFight(world);
  nm.beaten++;
  const final = nm.beaten >= 5;
  const reward = final ? 10000 : 800 * nm.lvl;
  world.money += reward;
  addRep(world, 300 * nm.lvl);
  addChaos(world, 25);
  if (world.stats) world.stats.nemesis = nm.beaten;
  sfxMissionPass();
  if (final) {
    showMissionMsg('THE FEUD IS OVER', `+$${reward} — five falls. He is not getting up again.`, '#ffd24a');
    showNews('an era of gang warfare ends in a single night');
  } else {
    nm.lvl = Math.min(5, nm.lvl + 1);
    nm.ambushT = AMBUSH_MIN + Math.random() * AMBUSH_VAR;
    showMissionMsg('NEMESIS DOWN', `+$${reward} — but you know he'll be back. Meaner.`, '#ff8a4a');
    showNews(ESCAPE_LINES[(Math.random() * ESCAPE_LINES.length) | 0]);
  }
  world.onSave?.();
}

const _nv = new THREE.Vector3();

export function updateNemesis(world, dt) {
  const nm = world.nemesis;
  if (!nm || nm.beaten >= 5) return;
  const player = world.player;

  if (!nm.active) {
    // he bides his time — but never during your own showdowns
    const busy = world.mission?.active || world.arena?.active || world.race?.active ||
      world.heist?.active || world.finale?.active || world.prison?.inside || world.zombies?.active;
    if (!busy && !player.inHeli && !player.inBoat) nm.ambushT -= dt;
    if (nm.ambushT <= 0) startAmbush(world);
    return;
  }

  const foe = nm.foe;
  world.nemesisBlip = { x: foe.pos.x, z: foe.pos.z };
  const hpPct = Math.max(0, Math.round((foe.hp / foe.maxHp) * 100));
  const crewLeft = nm.crew.filter((f) => !f.dead).length;
  world.nemesisHint = `<b>${NAMES[nm.lvl - 1]}</b> — ${hpPct}% · crew: ${crewLeft}`;

  const focus = player.inCar ? player.inCar.pos : player.pos;
  const dist = Math.hypot(focus.x - foe.pos.x, focus.z - foe.pos.z);

  // fly or drive far enough for long enough and he melts away, unfinished
  if (dist > 130 || player.inHeli) nm.fleeT += dt;
  else nm.fleeT = 0;
  if (nm.fleeT > 10) {
    clearFight(world);
    world.nemesisHint = null;
    world.nemesisBlip = null;
    nm.ambushT = AMBUSH_MIN * 0.5 + Math.random() * AMBUSH_VAR * 0.5;
    showToast('HE SLIPPED AWAY — this isn\'t finished');
    showNews('the rival melts into traffic, denied his moment');
    return;
  }

  // the man himself: relentless pursuit, lunges up close, shoots at range
  if (!foe.dead) {
    if (foe.webT > 0) {
      foe.webT -= dt;
    } else {
      const spd = 5.2 + nm.lvl * 0.5;
      _nv.set(focus.x - foe.pos.x, 0, focus.z - foe.pos.z);
      const d = _nv.length() || 1;
      _nv.multiplyScalar(1 / d);
      foe.heading = Math.atan2(_nv.x, _nv.z);
      foe.mesh.rotation.y = foe.heading;
      if (d > 2.2) {
        foe.lungeT -= dt;
        const lunging = foe.lungeT > -0.5 && foe.lungeT < 0; // brief burst
        if (foe.lungeT < -3 && d < 14 && Math.random() < dt * 0.7) foe.lungeT = 0.4;
        const s = foe.lungeT > 0 ? spd * 2.6 : spd;
        if (foe.lungeT > 0) foe.lungeT -= dt;
        foe.pos.addScaledVector(_nv, s * dt);
        resolveCircle(foe.pos, 0.5, world.city.colliders);
        foe.animT += s * dt * 1.8;
        animateWalk(foe.ch, foe.animT, 0.9);
      } else if (!player.inCar && Math.random() < dt * 2.2 && !(player.dodgeT > 0)) {
        player.health -= 9 + nm.lvl * 2; // haymaker
        world.shake = 0.2;
        addFlash(player.pos.clone().setY(1.4), 0xff5040, 0.3);
      }
      // gunfire when he can't reach you
      foe.shootT -= dt;
      if (foe.shootT <= 0 && d > 6 && d < 46) {
        foe.shootT = Math.max(0.7, 1.8 - nm.lvl * 0.2);
        sfxShot('pistol');
        const from = foe.pos.clone().setY(1.5);
        const aim = focus.clone();
        aim.y += 1.1 + (Math.random() - 0.5) * 0.8;
        addTracer(from, aim);
        if (Math.random() < 0.4 && !(player.dodgeT > 0)) {
          if (player.inCar) player.inCar.health -= 5;
          else player.health -= 6;
        }
      }
    }
  }

  // the crew closes ranks like bounty bodyguards
  for (const f of nm.crew) {
    if (f.dead) {
      if (!f.felled) { f.felled = true; f.mesh.rotation.z = Math.PI / 2; f.mesh.position.y = 0.25; }
      continue;
    }
    if (f.webT > 0) { f.webT -= dt; continue; }
    const dx = focus.x - f.pos.x;
    const dz = focus.z - f.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    if (d > 60) continue;
    if (d > 2) {
      f.pos.x += (dx / d) * 3.6 * dt;
      f.pos.z += (dz / d) * 3.6 * dt;
      resolveCircle(f.pos, 0.4, world.city.colliders);
      f.mesh.rotation.y = Math.atan2(dx, dz);
      f.animT += dt * 6;
      animateWalk(f.ch, f.animT, 0.7);
    } else if (!player.inCar && Math.random() < dt * 1.4 && !(player.dodgeT > 0)) {
      player.health -= 5;
    }
  }

  // run over the crew — VIPER himself sidesteps cars like he's seen it all
  if (player.inCar && player.inCar.vel.lengthSq() > 25) {
    for (const f of nm.crew) {
      if (!f.dead && f.pos.distanceTo(player.inCar.pos) < 1.9) { f.dead = true; }
    }
  }

  if (foe.dead) {
    addExplosion(foe.pos.clone().setY(0.8)); // he goes down loud
    defeated(world);
    world.nemesisHint = null;
    world.nemesisBlip = null;
  }
}
