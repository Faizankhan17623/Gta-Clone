import * as THREE from 'three';
import { pointBlocked } from './city.js';
import { createCharacter, animateWalk, animateIdle } from './characters.js';
import { showToast } from './hud.js';
import { sfxShot, sfxMissionPass } from './sound.js';
import { addTracer } from './effects.js';

// THE BODYGUARD: a wall of a man in a gray suit, hired under an awning
// east of spawn. $5000 buys a shadow who walks where you walk and puts
// rounds into whatever the city throws at you.

const COST = 5000;

export function initBodyguard(scene, world, save) {
  let pos = world.city.spawn.clone().add(new THREE.Vector3(40, 0, 20));
  const probe = new THREE.Vector3(pos.x, 1, pos.z);
  if (pointBlocked(probe, world.city.colliders, 1.6)) pos = world.city.spawn.clone().add(new THREE.Vector3(44, 0, 16));

  const awning = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 0.2, 2),
    new THREE.MeshStandardMaterial({ color: 0x3a3a44, roughness: 0.7 })
  );
  awning.position.copy(pos).setY(2.6);
  scene.add(awning);
  const rep = createCharacter({ shirt: '#33343c', pants: '#22232a', skin: '#b9855c' });
  rep.group.position.copy(pos);
  scene.add(rep.group);

  const guard = { hirePos: pos, rep, hired: !!save?.guard, ch: null, animT: 0, shootT: 1 };
  world.guard = guard;
  if (guard.hired) spawnGuard(scene, world);
}

function spawnGuard(scene, world) {
  const g = world.guard;
  const ch = createCharacter({ shirt: '#3c3d46', pants: '#26272e', skin: '#c98e63', hair: '#111' });
  ch.group.position.copy(world.player.pos).add(new THREE.Vector3(1.5, 0, -1.5));
  scene.add(ch.group);
  g.ch = ch;
}

export function updateBodyguard(world, dt, pressed) {
  const g = world.guard;
  if (!g) return;
  const player = world.player;
  world.guardHint = null;
  animateIdle(g.rep);

  // the hiring awning
  const onFoot = !player.inCar && !player.inHeli && !player.inBoat;
  const dHire = Math.hypot(player.pos.x - g.hirePos.x, player.pos.z - g.hirePos.z);
  if (onFoot && dHire < 3.5) {
    world.guardHint = g.hired
      ? 'Press <b>E</b> to dismiss your BODYGUARD'
      : `Press <b>E</b> to hire a BODYGUARD — $${COST}, follows and fights`;
    if (pressed['KeyE']) {
      if (g.hired) {
        g.hired = false;
        if (g.ch) { world.scene.remove(g.ch.group); g.ch = null; }
        showToast('The bodyguard nods once and walks away');
      } else if (world.money < COST) {
        showToast('Not enough cash');
      } else {
        world.money -= COST;
        g.hired = true;
        spawnGuard(world.scene, world);
        sfxMissionPass();
        showToast('BODYGUARD HIRED — he doesn\'t talk much');
      }
      world.onSave?.();
    }
  }

  if (!g.hired || !g.ch) return;
  const ch = g.ch;
  const pos = ch.group.position;
  const dx = player.pos.x - pos.x, dz = player.pos.z - pos.z;
  const d = Math.hypot(dx, dz);

  if (d > 45) { // fell behind (or you drove off) — he catches up implausibly well
    pos.set(player.pos.x - 2, player.pos.y, player.pos.z - 2);
  } else if (d > 3.2) {
    const sp = Math.min(10, d * 1.4);
    pos.x += (dx / d) * sp * dt;
    pos.z += (dz / d) * sp * dt;
    pos.y = Math.max(0, player.pos.y < 2 ? 0 : pos.y);
    ch.group.rotation.y = Math.atan2(dx, dz);
    g.animT += sp * dt * 2;
    animateWalk(ch, g.animT, 0.8);
  } else {
    animateIdle(ch);
  }

  // covering fire: nearest live target in range eats a round
  g.shootT -= dt;
  if (g.shootT <= 0) {
    g.shootT = 1.5;
    let best = null, bestD = 22;
    for (const tg of world.targets) {
      if (tg.dead || tg.passive) continue; // props aren't threats, don't shoot the scenery
      const td = Math.hypot(tg.pos.x - pos.x, tg.pos.z - pos.z);
      if (td < bestD) { bestD = td; best = tg; }
    }
    if (best) {
      ch.group.rotation.y = Math.atan2(best.pos.x - pos.x, best.pos.z - pos.z);
      sfxShot('pistol');
      addTracer(pos.clone().setY(pos.y + 1.4), best.pos.clone().setY(best.pos.y + (best.aimY || 1)));
      best.hit();
    }
  }
}
