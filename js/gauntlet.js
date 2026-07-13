import * as THREE from 'three';
import { blockStart, BLOCK, pointBlocked } from './city.js';
import { showToast, showNews, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxMissionFail, sfxShot } from './sound.js';
import { addRep, addChaos } from './economy.js';
import { addTracer, addFlash, addExplosion, addSparks } from './effects.js';

// The Spire Gauntlet: a ring of light at the tower's base dares you to climb.
// Eight checkpoints spiral up the spire on a 90-second clock, and at the
// summit something is waiting — the WARDEN, a private gunship that considers
// the airspace its own. Web up, wall-run, heli-cheese if you must. The
// purse doesn't care how you got there.

const TIME_LIMIT = 90;
const REWARD = 8000;
const COOLDOWN = 300;
const BOSS_HP = 300;

export function initGauntlet(scene, world) {
  const spire = new THREE.Vector3(blockStart(2) + BLOCK / 2, 0, blockStart(7) + BLOCK / 2);

  // start ring at the base — probe outward for clear pavement (the spire's
  // block is crowded: tower footprint, the skyline-trial ring, planters...)
  const startRing = new THREE.Mesh(
    new THREE.CylinderGeometry(3, 3, 0.5, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x4ad2ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })
  );
  const startPos = spire.clone().add(new THREE.Vector3(18, 0, 18));
  const probe = new THREE.Vector3();
  outer:
  for (const r of [22, 27, 32, 38]) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.4;
      probe.set(spire.x + Math.sin(a) * r, 1, spire.z + Math.cos(a) * r);
      if (!pointBlocked(probe, world.city.colliders, 2.5)) {
        startPos.set(probe.x, 0, probe.z);
        break outer;
      }
    }
  }
  startRing.position.copy(startPos).setY(0.5);
  scene.add(startRing);

  // eight rings spiraling up the tower
  const rings = [];
  for (let i = 0; i < 8; i++) {
    const a = i * 1.05;
    const r = 26 - i * 1.6;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(4, 0.35, 8, 20),
      new THREE.MeshBasicMaterial({ color: 0x4ad2ff, transparent: true, opacity: 0.35 })
    );
    ring.position.set(
      spire.x + Math.sin(a) * r,
      16 + i * 15,
      spire.z + Math.cos(a) * r
    );
    // lift any ring the skyline swallowed
    while (pointBlocked(ring.position, world.city.colliders, 4) && ring.position.y < 140) {
      ring.position.y += 4;
    }
    ring.lookAt(spire.x, ring.position.y, spire.z);
    ring.visible = false;
    scene.add(ring);
    rings.push(ring);
  }

  world.gauntlet = {
    spire, startPos, startRing, rings,
    active: false, idx: 0, timeLeft: 0, cooldownT: 0,
    boss: null,
  };
}

function makeBoss(world) {
  const gt = world.gauntlet;
  const g = new THREE.Group();
  const hull = new THREE.Mesh(
    new THREE.BoxGeometry(4.5, 1.8, 6),
    new THREE.MeshStandardMaterial({ color: 0x1c222e, metalness: 0.7, roughness: 0.35 })
  );
  hull.position.y = 1;
  g.add(hull);
  const rotor = new THREE.Mesh(
    new THREE.BoxGeometry(9, 0.12, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x0c0f16, metalness: 0.6, roughness: 0.4 })
  );
  rotor.position.y = 2.2;
  g.add(rotor);
  const eye = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff3030 })
  );
  eye.position.set(0, 0.9, 3.1);
  g.add(eye);
  g.position.set(gt.spire.x, 158, gt.spire.z);
  world.scene.add(g);
  const boss = {
    mesh: g, rotor, pos: g.position,
    hp: BOSS_HP, dead: false, a: 0, shootT: 2, stunT: 0,
  };
  boss.target = {
    pos: boss.pos, aimY: 1, r: 3.4, webbable: true,
    get dead() { return boss.dead; },
    hit() {
      boss.hp -= 30;
      addSparks(boss.pos.clone(), 8);
      if (boss.hp <= 0 && !boss.dead) boss.dead = true;
    },
    web() { boss.stunT = 2.2; }, // webbed rotor: it wallows, fire at will
  };
  world.targets.push(boss.target);
  return boss;
}

function clearBoss(world) {
  const gt = world.gauntlet;
  if (!gt.boss) return;
  world.scene.remove(gt.boss.mesh);
  const ti = world.targets.indexOf(gt.boss.target);
  if (ti >= 0) world.targets.splice(ti, 1);
  gt.boss = null;
}

export function endGauntlet(world) {
  const gt = world.gauntlet;
  if (!gt?.active) return;
  gt.active = false;
  for (const r of gt.rings) r.visible = false;
  clearBoss(world);
  gt.cooldownT = COOLDOWN * 0.4;
}

export function updateGauntlet(world, dt, pressed) {
  const gt = world.gauntlet;
  if (!gt) return;
  const player = world.player;
  world.gauntletHint = null;
  world.gauntletBlip = null;
  gt.cooldownT = Math.max(0, gt.cooldownT - dt);
  gt.startRing.rotation.y += dt;

  if (!gt.active) {
    const d = Math.hypot(player.pos.x - gt.startPos.x, player.pos.z - gt.startPos.z);
    if (d < 4 && !player.inCar && !player.inBoat) {
      if (gt.cooldownT > 0) {
        world.gauntletHint = `SPIRE GAUNTLET — the tower rests for ${Math.ceil(gt.cooldownT)}s`;
      } else {
        world.gauntletHint = `Press <b>E</b> for the SPIRE GAUNTLET — 8 rings, ${TIME_LIMIT}s, and the thing at the top. $${REWARD}`;
        if (pressed['KeyE']) {
          gt.active = true;
          gt.idx = 0;
          gt.timeLeft = TIME_LIMIT;
          for (const r of gt.rings) { r.visible = true; r.material.opacity = 0.18; }
          sfxMissionFail();
          showMissionMsg('SPIRE GAUNTLET', 'Eight rings to the summit. The clock is not your friend. Neither is the summit.', '#4ad2ff');
          showNews('someone is racing the spire again — office workers press against the glass');
        }
      }
    }
    return;
  }

  // ---- climbing ----
  if (gt.idx < gt.rings.length) {
    gt.timeLeft -= dt;
    const ring = gt.rings[gt.idx];
    ring.material.opacity = 0.5 + Math.sin(world.time * 6) * 0.25;
    ring.rotation.z += dt * 1.5;
    world.gauntletBlip = { x: ring.position.x, z: ring.position.z };
    world.gauntletHint = `GAUNTLET — ring <b>${gt.idx + 1}/8</b> · ${Math.ceil(gt.timeLeft)}s`;
    if (gt.timeLeft <= 0) {
      endGauntlet(world);
      sfxMissionFail();
      showMissionMsg('GAUNTLET FAILED', 'The tower wins this round.', '#ff5a4a');
      return;
    }
    if (player.pos.distanceTo(ring.position) < 5.5) {
      ring.visible = false;
      gt.idx++;
      addFlash(ring.position.clone(), 0x4ad2ff, 0.8);
      world.addXP?.(20);
      if (gt.idx === gt.rings.length) {
        gt.boss = makeBoss(world);
        world.slowmoT = Math.max(world.slowmoT || 0, 0.8);
        sfxMissionFail();
        showMissionMsg('THE WARDEN', 'The summit has a landlord. Evict it.', '#ff3b3b');
        showNews('an unregistered gunship circles the spire\'s crown');
      } else {
        showToast(`RING ${gt.idx}/8`);
      }
    }
    return;
  }

  // ---- the WARDEN ----
  const boss = gt.boss;
  if (!boss) { endGauntlet(world); return; }
  world.gauntletBlip = { x: boss.pos.x, z: boss.pos.z };
  world.gauntletHint = `THE WARDEN — <b>${Math.max(0, Math.round((boss.hp / BOSS_HP) * 100))}%</b> · web the rotor to stall it`;

  if (boss.dead) {
    addExplosion(boss.pos.clone());
    addExplosion(boss.pos.clone().add(new THREE.Vector3(2, -1, 1)));
    world.shake = 0.5;
    const pay = Math.round(REWARD * (world.payMult || 1));
    world.money += pay;
    addRep(world, 600);
    addChaos(world, 30);
    if (world.stats) world.stats.gauntlets = (world.stats.gauntlets || 0) + 1;
    endGauntlet(world);
    gt.cooldownT = COOLDOWN;
    sfxMissionPass();
    showMissionMsg('SUMMIT CLEARED', `+$${pay} — the spire's crown is yours tonight`, '#ffd24a');
    showNews('debris rains politely off the spire; the city bills nobody');
    world.onSave?.();
    return;
  }

  boss.rotor.rotation.y += dt * (boss.stunT > 0 ? 4 : 22);
  if (boss.stunT > 0) {
    boss.stunT -= dt;
    boss.pos.y -= 2.5 * dt; // wallowing
  } else {
    boss.a += dt * 0.5;
    boss.pos.set(
      gt.spire.x + Math.sin(boss.a) * 14,
      156 + Math.sin(world.time * 0.9) * 3,
      gt.spire.z + Math.cos(boss.a) * 14
    );
    boss.mesh.rotation.y = boss.a + Math.PI / 2;
    boss.shootT -= dt;
    const d = boss.pos.distanceTo(player.pos);
    if (boss.shootT <= 0 && d < 60) {
      boss.shootT = 1.1;
      sfxShot('mg');
      const aim = player.pos.clone();
      aim.y += 1 + (Math.random() - 0.5);
      addTracer(boss.pos.clone(), aim);
      addFlash(aim, 0xff6a50, 0.25);
      if (Math.random() < 0.4 && !(player.dodgeT > 0)) player.health -= 7;
    }
  }
}
