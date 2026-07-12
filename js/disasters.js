import * as THREE from 'three';
import { HALF } from './city.js';
import { showToast, showNews, showMissionMsg } from './hud.js';
import { sfxCrash, sfxMissionFail } from './sound.js';
import { addChaos } from './economy.js';
import { addSmoke, addSparks, addFlash, addExplosion } from './effects.js';

// Natural disasters: every so often the city itself turns on you.
// EARTHQUAKE — the ground bucks, debris falls, cars crumple.
// TORNADO — a wandering funnel that flings traffic like toys.
// METEOR SHOWER — night skies only: fire falls near you, then a big one.

const CALM_MIN = 300; // seconds between events
const CALM_VAR = 300;

export function initDisasters(scene, world) {
  // the tornado funnel, built once and hidden
  const funnel = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x3a3f48, transparent: true, opacity: 0.55 });
  for (let i = 0; i < 5; i++) {
    const r0 = 1.5 + i * 2.4;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(r0 + 1.8, r0, 9, 12, 1, true), mat);
    seg.position.y = 4.5 + i * 9;
    funnel.add(seg);
  }
  funnel.visible = false;
  scene.add(funnel);
  world.disasters = { t: CALM_MIN + Math.random() * CALM_VAR, kind: null, left: 0, funnel, tick: 0, lifted: [] };
}

export function forceDisaster(world, kind) {
  const ds = world.disasters;
  if (ds.kind) return;
  ds.t = 0;
  ds.forced = kind || null;
}

function begin(world, kind) {
  const ds = world.disasters;
  ds.kind = kind;
  ds.tick = 0;
  sfxMissionFail();
  addChaos(world, 20);
  if (world.stats) world.stats.disasters = (world.stats.disasters || 0) + 1;
  if (kind === 'quake') {
    ds.left = 12;
    showMissionMsg('⚠ EARTHQUAKE', 'The ground is moving. Stay clear of the towers.', '#ff8a4a');
    showNews('a violent tremor rattles the entire grid');
  } else if (kind === 'tornado') {
    ds.left = 42;
    ds.funnel.visible = true;
    const a = Math.random() * Math.PI * 2;
    ds.funnel.position.set(world.player.pos.x + Math.sin(a) * 120, 0, world.player.pos.z + Math.cos(a) * 120);
    ds.wanderA = Math.random() * Math.PI * 2;
    ds.lifted = [];
    showMissionMsg('🌪 TORNADO', 'A funnel is on the ground and heading downtown.', '#8fd0ff');
    showNews('TORNADO WARNING — funnel cloud confirmed inside city limits');
  } else {
    ds.left = 24;
    ds.meteorT = 0.5;
    showMissionMsg('☄ METEOR SHOWER', 'The sky is falling. Literally. Keep moving.', '#ffd24a');
    showNews('astronomers apologize for calling it "a light show worth watching"');
  }
}

function endEvent(world) {
  const ds = world.disasters;
  if (ds.kind === 'quake') showNews('the tremors fade — surveyors report the towers held');
  if (ds.kind === 'tornado') showNews('the funnel lifts, leaving a trail of very confused insurance agents');
  if (ds.kind === 'meteor') showNews('the last embers cool — collectors are already hunting fragments');
  ds.funnel.visible = false;
  for (const v of ds.lifted) if (!v.dead) v.pos.y = 0; // anything still airborne comes down
  ds.lifted = [];
  ds.kind = null;
  ds.t = CALM_MIN + Math.random() * CALM_VAR;
  showToast('ALL CLEAR');
}

const _dv = new THREE.Vector3();

export function updateDisasters(world, dt, hooks) {
  const ds = world.disasters;
  if (!ds) return;
  const player = world.player;
  world.disasterBlip = null;

  if (!ds.kind) {
    ds.t -= dt;
    if (ds.t <= 0) {
      const night = world.clock >= 20 || world.clock < 5;
      let kind = ds.forced || ['quake', 'tornado', 'meteor'][(Math.random() * 3) | 0];
      if (kind === 'meteor' && !night && !ds.forced) kind = 'quake'; // meteors want a dark sky
      ds.forced = null;
      // never stack a disaster on top of a boss fight or the finale
      if (world.finale?.active || world.prison?.inside) { ds.t = 60; return; }
      begin(world, kind);
    }
    return;
  }

  ds.left -= dt;
  if (ds.left <= 0) { endEvent(world); return; }
  ds.tick -= dt;

  if (ds.kind === 'quake') {
    world.shake = Math.max(world.shake || 0, 0.22 + Math.sin(world.time * 9) * 0.1);
    world.lastShot = { pos: player.pos.clone(), t: world.time }; // everyone panics
    if (ds.tick <= 0) {
      ds.tick = 0.35;
      sfxCrash(6 + Math.random() * 6);
      // debris puffs off nearby rooftops, cars take a beating
      for (let i = 0; i < 2; i++) {
        _dv.set(
          player.pos.x + (Math.random() - 0.5) * 70,
          2 + Math.random() * 20,
          player.pos.z + (Math.random() - 0.5) * 70
        );
        addSmoke(_dv.clone(), 0.8);
        if (Math.random() < 0.4) addSparks(_dv.clone().setY(1), 6);
      }
      for (const v of world.traffic) {
        if (v.dead || v === player.inCar) continue;
        if (v.pos.distanceTo(player.pos) < 60 && Math.random() < 0.12) {
          v.health -= 8;
          addSparks(v.pos.clone().setY(0.8), 4);
          if (v.health <= 0) hooks?.explode?.(v);
        }
      }
      if (!player.inHeli && player.onGround && Math.random() < 0.25) {
        player.vy = 3; // the ground literally throws you
        player.onGround = false;
      }
    }
  } else if (ds.kind === 'tornado') {
    const f = ds.funnel;
    // wander with a drunk bias toward the player — close enough to scare
    ds.wanderA += (Math.random() - 0.5) * 1.6 * dt;
    _dv.set(player.pos.x - f.position.x, 0, player.pos.z - f.position.z);
    const dp = _dv.length() || 1;
    const chase = dp > 90 ? 0.65 : 0.25; // stalks you from afar, meanders up close
    _dv.multiplyScalar(chase / dp);
    _dv.x += Math.sin(ds.wanderA) * (1 - chase);
    _dv.z += Math.cos(ds.wanderA) * (1 - chase);
    f.position.x += _dv.x * 9 * dt;
    f.position.z += _dv.z * 9 * dt;
    f.position.x = Math.max(-HALF + 20, Math.min(HALF - 20, f.position.x));
    f.position.z = Math.max(-HALF + 20, Math.min(HALF - 20, f.position.z));
    f.rotation.y += dt * 6;
    world.disasterBlip = { x: f.position.x, z: f.position.z };

    // vacuum up loose vehicles
    if (ds.tick <= 0) {
      ds.tick = 0.5;
      for (const group of [world.traffic, world.parked]) {
        for (const v of group) {
          if (v.dead || v === player.inCar || ds.lifted.includes(v)) continue;
          if (Math.hypot(v.pos.x - f.position.x, v.pos.z - f.position.z) < 14 && ds.lifted.length < 6) {
            v.ai = null;
            ds.lifted.push(v);
          }
        }
      }
    }
    for (let i = ds.lifted.length - 1; i >= 0; i--) {
      const v = ds.lifted[i];
      if (v.dead) { ds.lifted.splice(i, 1); continue; }
      const a = world.time * 3 + i * 2.1;
      const r = 8 + i * 1.5;
      v.pos.x += (f.position.x + Math.sin(a) * r - v.pos.x) * Math.min(1, 4 * dt);
      v.pos.z += (f.position.z + Math.cos(a) * r - v.pos.z) * Math.min(1, 4 * dt);
      v.pos.y = Math.min(v.pos.y + 7 * dt, 16 + i * 2);
      v.mesh.rotation.y += dt * 5;
      if (Math.random() < dt * 0.25) { // spat out
        ds.lifted.splice(i, 1);
        v.pos.y = 0;
        v.mesh.rotation.y = 0;
        v.health -= 70;
        sfxCrash(14);
        addSparks(v.pos.clone().setY(1), 10);
        if (v.health <= 0) hooks?.explode?.(v);
      }
    }
    // it grabs at you too
    const pd = Math.hypot(player.pos.x - f.position.x, player.pos.z - f.position.z);
    if (pd < 12 && !player.inHeli) {
      if (player.inCar) {
        player.inCar.health -= 12 * dt;
        _dv.set(player.inCar.pos.x - f.position.x, 0, player.inCar.pos.z - f.position.z).normalize();
        player.inCar.vel.addScaledVector(_dv, 14 * dt); // shoved outward
      } else {
        player.health -= 6 * dt;
        player.vy = Math.max(player.vy, 6);
        player.onGround = false;
        _dv.set(player.pos.x - f.position.x, 0, player.pos.z - f.position.z).normalize();
        player.vel.addScaledVector(_dv, 20 * dt);
        world.shake = Math.max(world.shake || 0, 0.2);
      }
    }
  } else if (ds.kind === 'meteor') {
    ds.meteorT -= dt;
    if (ds.meteorT <= 0) {
      ds.meteorT = ds.left < 4 ? 99 : 1.4 + Math.random() * 1.2;
      const big = ds.left < 5; // the finale rock
      const ox = (Math.random() - 0.5) * (big ? 30 : 120);
      const oz = (Math.random() - 0.5) * (big ? 30 : 120);
      const hit = new THREE.Vector3(
        Math.max(-HALF + 10, Math.min(HALF - 10, player.pos.x + ox)), 0.6,
        Math.max(-HALF + 10, Math.min(HALF - 10, player.pos.z + oz))
      );
      // streak: flash trail down to the impact point, then the real boom
      for (let i = 0; i < 5; i++) {
        addFlash(hit.clone().add(new THREE.Vector3(i * 3, 30 - i * 6, i * 2)), 0xffa050, 0.4);
        addSmoke(hit.clone().add(new THREE.Vector3(i * 3, 30 - i * 6, i * 2)), 0.6);
      }
      if (big) {
        showToast('☄ INCOMING — THE BIG ONE');
        addExplosion(hit.clone());
        world.shake = 0.7;
      }
      hooks?.boom?.(hit);
    }
  }
}
