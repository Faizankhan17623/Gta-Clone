import * as THREE from 'three';
import { blockStart, BLOCK } from './city.js';
import { showToast, showNews } from './hud.js';
import { sfxMissionPass } from './sound.js';
import { addExplosion } from './effects.js';
import { addRep } from './economy.js';

// The UFO: on the darkest hours (midnight to 4am) a saucer circles the
// Spire, beaming up traffic. It can be shot down. Nobody believes the
// witnesses. $3000 and a headline if you do it.

export function initUfo(scene, world) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(
    new THREE.CylinderGeometry(6, 8, 1.6, 20),
    new THREE.MeshStandardMaterial({ color: 0x9aa4b5, metalness: 0.9, roughness: 0.25 })
  );
  g.add(hull);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(3, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x7cf78c, emissive: 0x2fd06a, emissiveIntensity: 0.8, transparent: true, opacity: 0.85 })
  );
  dome.position.y = 0.8;
  g.add(dome);
  for (let i = 0; i < 8; i++) {
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xff5ad0 })
    );
    const a = (i / 8) * Math.PI * 2;
    lamp.position.set(Math.sin(a) * 7, -0.6, Math.cos(a) * 7);
    g.add(lamp);
  }
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 5, 80, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x7cf78c, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false })
  );
  beam.position.y = -41;
  beam.visible = false;
  g.add(beam);
  g.visible = false;
  scene.add(g);

  const spire = new THREE.Vector3(blockStart(2) + BLOCK / 2, 0, blockStart(7) + BLOCK / 2);
  world.ufo = {
    mesh: g, beam, spire,
    up: false, hp: 250, a: 0,
    grabT: 6, victim: null,
    downForNight: false,
    target: null,
  };
  // shootable: register while it's up
  world.ufo.target = {
    pos: g.position, aimY: 0, r: 7,
    get dead() { return !world.ufo.up; },
    hit() {
      const u = world.ufo;
      u.hp -= 30;
      if (u.hp <= 0 && u.up) shotDown(world);
    },
  };
}

function shotDown(world) {
  const u = world.ufo;
  addExplosion(u.mesh.position.clone());
  addExplosion(u.mesh.position.clone().add(new THREE.Vector3(3, 2, -2)));
  world.shake = 0.6;
  hide(world);
  u.downForNight = true;
  world.money += 3000;
  addRep(world, 600);
  if (world.stats) world.stats.ufo = (world.stats.ufo || 0) + 1;
  sfxMissionPass();
  showToast('👽 UFO DOWN! +$3000');
  showNews('officials insist the falling lights were a weather balloon');
  world.onSave?.();
}

function hide(world) {
  const u = world.ufo;
  u.up = false;
  u.mesh.visible = false;
  u.beam.visible = false;
  u.victim = null;
  const ti = world.targets.indexOf(u.target);
  if (ti >= 0) world.targets.splice(ti, 1);
}

export function updateUfo(world, dt) {
  const u = world.ufo;
  const night = world.clock >= 0 && world.clock < 4;
  if (!night) { if (u.up) hide(world); u.downForNight = false; return; }
  if (u.downForNight) return;

  const player = world.player;
  const focus = player.inHeli ? player.inHeli.pos : player.pos;
  const nearSpire = Math.hypot(focus.x - u.spire.x, focus.z - u.spire.z) < 220;

  if (!u.up) {
    if (!nearSpire) return;
    u.up = true;
    u.hp = 250;
    u.mesh.visible = true;
    u.grabT = 5;
    world.targets.push(u.target);
    showNews('strange lights reported circling the spire');
    return;
  }

  // lazy circle around the spire
  u.a += dt * 0.25;
  u.mesh.position.set(
    u.spire.x + Math.sin(u.a) * 60,
    92 + Math.sin(world.time * 0.7) * 4,
    u.spire.z + Math.cos(u.a) * 60
  );
  u.mesh.rotation.y += dt * 2;

  // abduct a car now and then
  if (!u.victim) {
    u.grabT -= dt;
    u.beam.visible = false;
    if (u.grabT <= 0) {
      u.grabT = 8 + Math.random() * 6;
      for (const v of world.traffic) {
        if (v.dead || v === player.inCar) continue;
        if (Math.hypot(v.pos.x - u.mesh.position.x, v.pos.z - u.mesh.position.z) < 50) {
          u.victim = v;
          v.ai = null;
          showNews('a hatchback has been selected for further study');
          break;
        }
      }
    }
  } else {
    const v = u.victim;
    // drift the saucer over the victim, then reel it up the beam
    u.mesh.position.x += (v.pos.x - u.mesh.position.x) * Math.min(1, 2 * dt);
    u.mesh.position.z += (v.pos.z - u.mesh.position.z) * Math.min(1, 2 * dt);
    u.beam.visible = true;
    v.vel.set(0, 0, 0);
    v.pos.y += 9 * dt;
    v.mesh.rotation.y += dt * 3;
    if (v.pos.y > u.mesh.position.y - 6) {
      world.scene.remove(v.mesh);
      const ti = world.traffic.indexOf(v);
      if (ti >= 0) world.traffic.splice(ti, 1);
      u.victim = null;
      u.beam.visible = false;
    }
  }
}
