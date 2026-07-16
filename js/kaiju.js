import * as THREE from 'three';
import { HALF } from './city.js';
import { WATER_X0, WATER_Y } from './water.js';
import { showToast, showNews, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxMissionFail, sfxCrash } from './sound.js';
import { addRep, addChaos } from './economy.js';
import { addSmoke, addSparks, addExplosion, addFlash } from './effects.js';

// THE HARBOR THING RISES. On the right kind of stormy night the sonar
// contact stops being a rumor: twenty meters of it wade out of the bay and
// start renegotiating the skyline. Bring everything. The eyes glow for a
// reason — web them and it staggers. It returns to the deep at dawn whether
// you've won or not, and it remembers.

const HP = 1000;
const REWARD = 20000;
const NIGHT_CHANCE = 0.12;      // per stormy nightfall
const MYTH_BONUS_CHANCE = 0.22; // once you've met it, it wants a rematch

function buildBeast(scene) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x0e1f1c, metalness: 0.2, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(8, 14, 6), mat);
  body.position.y = 10;
  g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(5, 4.5, 5), mat);
  head.position.y = 19;
  g.add(head);
  const fin = new THREE.Mesh(new THREE.ConeGeometry(2.2, 6, 4), mat);
  fin.position.set(0, 20, -3.4);
  fin.rotation.x = -0.5;
  g.add(fin);
  const eyes = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(2.2, 10, 2.4), mat);
    arm.position.set(s * 5.4, 11, 0);
    g.add(arm);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(2.8, 7, 3), mat);
    leg.position.set(s * 2.2, 3.5, 0);
    g.add(leg);
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x5ef2a0 })
    );
    eye.position.set(s * 1.3, 19.6, 2.6);
    g.add(eye);
    eyes.push(eye);
  }
  return { group: g, eyes };
}

export function initKaiju(scene, world) {
  const { group, eyes } = buildBeast(scene);
  group.visible = false;
  scene.add(group);
  world.kaiju = {
    mesh: group, eyes,
    pos: group.position,
    active: false, hp: HP, stunT: 0, stepT: 0, swipeT: 0,
    rolled: false, t: 0,
  };
  world.kaiju.target = {
    pos: group.position, aimY: 14, r: 7, webbable: true,
    get dead() { return !world.kaiju.active; },
    hit() {
      const k = world.kaiju;
      k.hp -= 30 * (k.stunT > 0 ? 2 : 1); // staggered = soft
      addSparks(k.pos.clone().setY(12 + Math.random() * 8), 8);
      if (k.hp <= 0 && k.active) slain(world);
    },
    web() {
      const k = world.kaiju;
      k.stunT = 3;
      for (const e of k.eyes) e.material.color.set(0xf2f2ec); // webbed eyes
      showToast('IT\'S BLINDED — HIT IT NOW (2x damage)');
    },
  };
}

export function forceKaiju(world) {
  const k = world.kaiju;
  if (k.active) return;
  if (world.clock > 5 && world.clock < 21) world.clock = 22.4;
  rise(world);
}

function rise(world) {
  const k = world.kaiju;
  k.active = true;
  k.hp = HP;
  k.stunT = 0;
  k.t = 0;
  k.pos.set(WATER_X0 + 60, 0, 40);
  k.mesh.visible = true;
  world.targets.push(k.target);
  world.slowmoT = Math.max(world.slowmoT || 0, 1.4);
  world.shake = 0.6;
  sfxMissionFail();
  sfxCrash(20);
  showMissionMsg('⚠ THE HARBOR THING RISES', 'Twenty meters of myth just made landfall. The city is out of adults.', '#5ef2a0');
  showNews('EMERGENCY — SOMETHING IS WADING OUT OF THE BAY. THIS IS NOT A DRILL. THIS IS NOT A WEATHER BALLOON.');
}

function leave(world, slainIt) {
  const k = world.kaiju;
  k.active = false;
  k.mesh.visible = false;
  const ti = world.targets.indexOf(k.target);
  if (ti >= 0) world.targets.splice(ti, 1);
  for (const e of k.eyes) e.material.color.set(0x5ef2a0);
  if (!slainIt) showNews('the thing slides back beneath the harbor at first light, unhurried, unbeaten');
}

function slain(world) {
  const k = world.kaiju;
  for (let i = 0; i < 6; i++) {
    addExplosion(k.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 10, 4 + i * 3, (Math.random() - 0.5) * 8)));
  }
  world.shake = 0.8;
  leave(world, true);
  const pay = Math.round(REWARD * (world.payMult || 1));
  world.money += pay;
  addRep(world, 2000);
  addChaos(world, 60);
  if (world.stats) world.stats.kaiju = (world.stats.kaiju || 0) + 1;
  sfxMissionPass();
  showMissionMsg('THE HARBOR THING FALLS', `+$${pay} — the myth is a trophy now. The bay feels emptier.`, '#ffd24a');
  showNews('it fell across two city blocks and the harbor; the tide took the rest. statues are being discussed');
  world.onSave?.();
}

const _kv = new THREE.Vector3();

export function updateKaiju(world, dt) {
  const k = world.kaiju;
  if (!k) return;
  const player = world.player;
  world.kaijuHint = null;
  world.kaijuBlip = null;

  if (!k.active) {
    // stormy nightfall roll
    if (world.clock >= 22 && !k.rolled) {
      k.rolled = true;
      const stormy = (world.rainI || 0) > 0.4;
      const met = world.myths?.done?.has('seamonster');
      const chance = stormy ? (met ? MYTH_BONUS_CHANCE : NIGHT_CHANCE) : 0;
      const busy = world.zombies?.active || world.finale?.active || world.prison?.inside;
      if (!busy && Math.random() < chance) rise(world);
    }
    if (world.clock > 6 && world.clock < 21) k.rolled = false;
    return;
  }

  // dawn: it simply leaves
  if (world.clock >= 6 && world.clock < 21) { leave(world, false); return; }

  k.t += dt;
  world.kaijuBlip = { x: k.pos.x, z: k.pos.z };
  world.kaijuHint = `☢ THE HARBOR THING — <b>${Math.max(0, Math.round((k.hp / HP) * 100))}%</b> · web the eyes to stagger it`;

  if (k.stunT > 0) {
    k.stunT -= dt;
    k.mesh.rotation.z = Math.sin(world.time * 8) * 0.06; // reeling
    if (k.stunT <= 0) for (const e of k.eyes) e.material.color.set(0x5ef2a0);
    return;
  }
  k.mesh.rotation.z = 0;

  // it wades toward the thickest part of the city, drawn to the lights —
  // or toward you, if you've made yourself interesting
  const focus = player.inHeli ? player.inHeli.pos : player.inCar ? player.inCar.pos : player.pos;
  const interested = Math.hypot(focus.x - k.pos.x, focus.z - k.pos.z) < 90;
  const tx = interested ? focus.x : 0;
  const tz = interested ? focus.z : 0;
  _kv.set(tx - k.pos.x, 0, tz - k.pos.z);
  const d = _kv.length() || 1;
  _kv.multiplyScalar(1 / d);
  if (d > 12) {
    k.pos.addScaledVector(_kv, 3.2 * dt);
    k.pos.x = Math.max(-HALF + 30, Math.min(WATER_X0 + 100, k.pos.x));
    k.pos.z = Math.max(-HALF + 30, Math.min(HALF - 30, k.pos.z));
  }
  k.mesh.rotation.y = Math.atan2(_kv.x, _kv.z);

  // footsteps you can feel from anywhere downtown
  k.stepT -= dt;
  if (k.stepT <= 0) {
    k.stepT = 1.4;
    sfxCrash(10);
    const pd = Math.hypot(focus.x - k.pos.x, focus.z - k.pos.z);
    world.shake = Math.max(world.shake || 0, Math.min(0.5, 40 / Math.max(20, pd)));
    addSmoke(k.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, 0.5, (Math.random() - 0.5) * 6)), 1.4);
    // cars near the feet have a bad time
    for (const group of [world.traffic, world.parked]) {
      for (const v of group) {
        if (v.dead || v === player.inCar) continue;
        if (Math.hypot(v.pos.x - k.pos.x, v.pos.z - k.pos.z) < 9) {
          v.health -= 60;
          v.pos.y = 0;
          addSparks(v.pos.clone().setY(1), 8);
          if (v.health <= 0) { v.dead = true; v.ai = null; addExplosion(v.pos); }
        }
      }
    }
    world.lastShot = { pos: k.pos.clone(), t: world.time }; // the city runs
  }

  // the swipe: get within arm's reach and learn why the army stays home
  k.swipeT -= dt;
  const pd = Math.hypot(player.pos.x - k.pos.x, player.pos.z - k.pos.z);
  if (k.swipeT <= 0 && pd < 14 && player.pos.y < 22) {
    k.swipeT = 2.2;
    addFlash(player.pos.clone().setY(player.pos.y + 1), 0x5ef2a0, 0.5);
    if (!(player.dodgeT > 0)) {
      player.health -= 18;
      player.vel.x += _kv.x * 22;
      player.vel.z += _kv.z * 22;
      player.vy = Math.max(player.vy, 9);
      player.onGround = false;
      world.shake = 0.45;
    }
  }
}
