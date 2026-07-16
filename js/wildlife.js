import * as THREE from 'three';
import { blockStart } from './city.js';
import { showToast, showNews } from './hud.js';
import { sfxPickup, sfxMissionPass, sfxMissionFail } from './sound.js';
import { addSparks } from './effects.js';

// CITY WILDLIFE: a shark that takes an interest in long swims, rats that
// own an alley after dark, and butterflies over the park lawn because
// not everything in this city wants to hurt you.

export function initWildlife(scene, world) {
  // -- the shark: a gray fin, dormant until someone lingers in the bay
  const fin = new THREE.Mesh(
    new THREE.ConeGeometry(0.35, 1.1, 4),
    new THREE.MeshStandardMaterial({ color: 0x5a6570, roughness: 0.4 })
  );
  fin.visible = false;
  scene.add(fin);
  const shark = { fin, active: false, swimT: 0, hp: 80, dead: false, respawnT: 0, retreatT: 0 };
  shark.target = {
    pos: fin.position, aimY: 0.3, r: 1.2,
    get dead() { return !shark.active || shark.dead; },
    hit() {
      shark.hp -= 30;
      if (shark.hp <= 0 && !shark.dead) {
        shark.dead = true;
        shark.active = false;
        fin.visible = false;
        shark.respawnT = 120;
        world.money += 500;
        sfxMissionPass();
        showToast('SHARK DOWN — the harbor exhales (+$500)');
        showNews('swimmers report the bay feels lighter somehow');
      }
    },
  };
  world.targets.push(shark.target);

  // -- alley rats: four of them, strictly a night shift
  const rats = [];
  const ax = blockStart(3) + 10, az = blockStart(3) + 10;
  for (let i = 0; i < 4; i++) {
    const rat = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.14, 0.16),
      new THREE.MeshLambertMaterial({ color: 0x3a352f })
    );
    rat.position.set(ax + (i % 2) * 3, 0.08, az + Math.floor(i / 2) * 3);
    rat.visible = false;
    scene.add(rat);
    const r = { mesh: rat, home: rat.position.clone(), tx: rat.position.x, tz: rat.position.z, dead: false };
    r.target = {
      pos: rat.position, aimY: 0.1, r: 0.45, passive: true,
      get dead() { return r.dead || !rat.visible; },
      hit() {
        if (r.dead) return;
        r.dead = true;
        rat.visible = false;
        world.money += 10;
        if (world.stats) world.stats.rats = (world.stats.rats || 0) + 1;
        addSparks(rat.position.clone().setY(0.2), 4);
        sfxPickup();
        showToast('RAT DOWN — $10 says nobody misses it');
      },
    };
    world.targets.push(r.target);
    rats.push(r);
  }

  // -- butterflies: daylight decoration over the fortune-tent lawn
  const flock = [];
  const center = world.city.spawn.clone().add(new THREE.Vector3(-12, 0, 38));
  const colors = [0xf7c04a, 0xef6aa0, 0x7cd0f7, 0xb08af0];
  for (let i = 0; i < 8; i++) {
    const b = new THREE.Mesh(
      new THREE.PlaneGeometry(0.18, 0.14),
      new THREE.MeshBasicMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide })
    );
    scene.add(b);
    flock.push({ mesh: b, phase: i * 0.9, r: 1.5 + (i % 4), speed: 0.5 + (i % 3) * 0.25 });
  }
  world.wildlife = { shark, rats, flock, flockCenter: center, wasNight: false };
}

export function updateWildlife(world, dt) {
  const wl = world.wildlife;
  if (!wl) return;
  const player = world.player;
  const night = world.clock >= 21 || world.clock <= 5;

  // shark stalks long swims
  const sh = wl.shark;
  sh.respawnT = Math.max(0, sh.respawnT - dt);
  if (player.swim && !sh.dead) {
    sh.swimT += dt;
    if (!sh.active && sh.swimT > 8 && sh.respawnT <= 0) {
      sh.active = true;
      sh.fin.visible = true;
      const a = Math.random() * Math.PI * 2;
      sh.fin.position.set(player.pos.x + Math.cos(a) * 28, 0.35, player.pos.z + Math.sin(a) * 28);
      sfxMissionFail();
      showToast('Something is circling…');
    }
  } else {
    sh.swimT = 0;
    if (sh.active && !player.swim) { sh.active = false; sh.fin.visible = false; }
    if (sh.dead && sh.respawnT <= 0) { sh.dead = false; sh.hp = 80; }
  }
  if (sh.active) {
    sh.retreatT = Math.max(0, sh.retreatT - dt);
    const dx = player.pos.x - sh.fin.position.x, dz = player.pos.z - sh.fin.position.z;
    const d = Math.hypot(dx, dz) || 1;
    const dir = sh.retreatT > 0 ? -1 : 1;
    sh.fin.position.x += (dx / d) * 6 * dir * dt;
    sh.fin.position.z += (dz / d) * 6 * dir * dt;
    sh.fin.rotation.y = Math.atan2(dx, dz);
    if (d < 1.6 && sh.retreatT <= 0) {
      player.health -= 22;
      sh.retreatT = 3.5;
      addSparks(player.pos.clone().setY(0.3), 8);
      sfxMissionFail();
      showToast('SHARK BITE — get out of the water!');
    }
  }

  // rats clock in at night
  if (night !== wl.wasNight) {
    wl.wasNight = night;
    for (const r of wl.rats) {
      r.dead = false;
      r.mesh.visible = night;
      r.mesh.position.copy(r.home);
    }
  }
  if (night) {
    for (const r of wl.rats) {
      if (r.dead) continue;
      const dx = r.tx - r.mesh.position.x, dz = r.tz - r.mesh.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.3) {
        r.tx = r.home.x + (Math.random() - 0.5) * 10;
        r.tz = r.home.z + (Math.random() - 0.5) * 10;
      } else {
        r.mesh.position.x += (dx / d) * 3 * dt;
        r.mesh.position.z += (dz / d) * 3 * dt;
        r.mesh.rotation.y = Math.atan2(dx, dz) + Math.PI / 2;
      }
    }
  }

  // butterflies only bother with daylight
  const day = world.clock > 6.5 && world.clock < 19.5;
  const t = performance.now() * 0.001;
  for (const b of wl.flock) {
    b.mesh.visible = day;
    if (!day) continue;
    const a = t * b.speed + b.phase;
    b.mesh.position.set(
      wl.flockCenter.x + Math.cos(a) * b.r,
      0.9 + Math.sin(t * 2.2 + b.phase) * 0.35,
      wl.flockCenter.z + Math.sin(a * 1.3) * b.r
    );
    b.mesh.rotation.y = a;
    b.mesh.rotation.z = Math.sin(t * 14 + b.phase) * 0.7; // wingbeat
  }
}
