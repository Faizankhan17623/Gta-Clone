import * as THREE from 'three';
import { createCharacter, animateWalk, animateIdle } from './characters.js';
import { blockStart, BLOCK, N, resolveCircle } from './city.js';
import { showToast, showMissionMsg, showNews } from './hud.js';
import { addTracer, addFlash } from './effects.js';
import { sfxShot, sfxMissionPass } from './sound.js';
import { makeVehicle, physStep } from './car.js';

// Gang territory: the north-east corner district belongs to the Vipers.
// Walk in and they open fire. Put down ten of them to seize the turf —
// it stops being hostile and pays protection money forever after.

const MEMBERS = 10;
const KILLS_TO_OWN = 10;

const _v = new THREE.Vector3();

function randomZonePoint(zone) {
  return {
    x: zone.x0 + 4 + Math.random() * (zone.x1 - zone.x0 - 8),
    z: zone.z0 + 4 + Math.random() * (zone.z1 - zone.z0 - 8),
  };
}

export function initGang(scene, world, saved) {
  // two blocks in the NE corner
  const zone = {
    x0: blockStart(N - 2),
    x1: blockStart(N - 1) + BLOCK,
    z0: blockStart(0),
    z1: blockStart(0) + BLOCK,
  };

  const quad = new THREE.Mesh(
    new THREE.PlaneGeometry(zone.x1 - zone.x0, zone.z1 - zone.z0),
    new THREE.MeshBasicMaterial({ color: 0xc03030, transparent: true, opacity: 0.09, depthWrite: false })
  );
  quad.rotation.x = -Math.PI / 2;
  quad.position.set((zone.x0 + zone.x1) / 2, 0.3, (zone.z0 + zone.z1) / 2);
  scene.add(quad);

  const members = [];
  for (let i = 0; i < MEMBERS; i++) {
    const ch = createCharacter({ shirt: '#a02020', pants: '#181f28', skin: '#c98e63' });
    scene.add(ch.group);
    const p = randomZonePoint(zone);
    ch.group.position.set(p.x, 0, p.z);
    members.push({
      ch,
      mesh: ch.group,
      pos: ch.group.position,
      heading: Math.random() * Math.PI * 2,
      animT: Math.random() * 5,
      dead: false,
      deadT: 0,
      shootT: 1 + Math.random() * 2,
      tgt: randomZonePoint(zone),
    });
  }

  const gang = {
    zone,
    quad,
    members,
    owned: !!saved?.owned,
    kills: saved?.kills | 0,
    incomeT: 0,
    // drive-bys until the turf is yours, bounty hunters after
    driveBys: [],
    driveByT: 45 + Math.random() * 45,
    hunters: [],
    hunterT: 90 + Math.random() * 60,
  };
  if (gang.owned) {
    quad.material.color.set(0x2faf4e);
    for (const m of members) m.mesh.visible = false;
  }
  world.gang = gang;
  world.gangPeds = members; // exposed so player bullets/rockets can hit them
  return gang;
}

// A confirmed Viper kill from any source (bullet, rocket, exploded drive-by car).
function countTurfKill(world) {
  const gang = world.gang;
  if (gang.owned) return;
  gang.kills++;
  if (gang.kills >= KILLS_TO_OWN) {
    gang.owned = true;
    gang.quad.material.color.set(0x2faf4e);
    world.money += 700;
    sfxMissionPass();
    showMissionMsg('TERRITORY SEIZED!', '+$700 · the district pays you now', '#7cf78c');
    showNews('the Viper territory has fallen');
    world.onSave?.();
  } else {
    showToast(`VIPERS DOWN: ${gang.kills}/${KILLS_TO_OWN}`);
  }
}

export function killGangMember(world, m) {
  if (m.dead) return;
  m.dead = true;
  m.deadT = 0;
  m.mesh.rotation.z = Math.PI / 2;
  m.mesh.position.y = 0.25;
  countTurfKill(world);
}

// ---------------- drive-bys (while the Vipers still rule) ----------------

function spawnDriveBy(world) {
  const gang = world.gang;
  const p = world.player.inCar ? world.player.inCar.pos : world.player.pos;
  const ang = Math.random() * Math.PI * 2;
  const car = makeVehicle(world.scene, p.x + Math.sin(ang) * 70, p.z + Math.cos(ang) * 70, ang + Math.PI, '#8a1a1a');
  car.viper = true;
  world.traffic.push(car); // shootable/explodable through the normal paths
  gang.driveBys.push({ car, life: 20, shootT: 1.5, counted: false });
  showNews('Viper drive-by spotted near your location');
}

function updateDriveBys(world, dt) {
  const gang = world.gang;
  const player = world.player;
  const focus = player.inCar ? player.inCar.pos : player.pos;

  if (!gang.owned && gang.driveBys.length === 0) {
    gang.driveByT -= dt;
    if (gang.driveByT <= 0) {
      gang.driveByT = 70 + Math.random() * 60;
      spawnDriveBy(world);
    }
  }

  for (let i = gang.driveBys.length - 1; i >= 0; i--) {
    const db = gang.driveBys[i];
    const car = db.car;
    db.life -= dt;

    if (car.dead) { // blowing it up counts as a Viper down
      if (!db.counted) {
        db.counted = true;
        countTurfKill(world);
      }
      if (db.life <= 0) {
        world.scene.remove(car.mesh);
        const ti = world.traffic.indexOf(car);
        if (ti >= 0) world.traffic.splice(ti, 1);
        gang.driveBys.splice(i, 1);
      }
      continue;
    }

    if (db.life <= 0) { // rolled off into the night
      world.scene.remove(car.mesh);
      const ti = world.traffic.indexOf(car);
      if (ti >= 0) world.traffic.splice(ti, 1);
      gang.driveBys.splice(i, 1);
      continue;
    }

    // cruise past the player
    const dx = focus.x - car.pos.x;
    const dz = focus.z - car.pos.z;
    const dist = Math.hypot(dx, dz);
    let err = Math.atan2(dx, dz) - car.heading;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;
    physStep(car, {
      steer: Math.max(-1, Math.min(1, err * 2)),
      throttle: dist > 10 ? 0.8 : 0.4, // keeps rolling, never parks
      handbrake: false,
    }, dt, world.city.colliders);

    // the passenger sprays at you
    db.shootT -= dt;
    if (db.shootT <= 0 && dist < 30 && !player.inHeli) {
      db.shootT = 0.9;
      const from = car.pos.clone();
      from.y = 1.2;
      const aim = focus.clone();
      aim.y += 1 + (Math.random() - 0.5);
      aim.x += (Math.random() - 0.5) * 3;
      aim.z += (Math.random() - 0.5) * 3;
      addTracer(from, aim);
      addFlash(aim, 0xffd080, 0.2);
      sfxShot('mg');
      if (Math.random() < 0.4) {
        if (player.inCar) player.inCar.health -= 4;
        else player.health -= 4;
      }
    }
  }
}

// ---------------- bounty hunters (after you take the turf) ----------------

function spawnHunters(world) {
  const gang = world.gang;
  const p = world.player.pos;
  for (let i = 0; i < 2; i++) {
    const ch = createCharacter({ shirt: '#101014', pants: '#101014', skin: '#d9a06e' });
    world.scene.add(ch.group);
    const a = Math.random() * Math.PI * 2;
    ch.group.position.set(p.x + Math.sin(a) * 28, 0, p.z + Math.cos(a) * 28);
    resolveCircle(ch.group.position, 0.5, world.city.colliders);
    const h = {
      ch,
      mesh: ch.group,
      pos: ch.group.position,
      heading: 0,
      animT: 0,
      dead: false,
      deadT: 0,
      shootT: 1.5 + Math.random(),
    };
    h.target = {
      pos: h.pos, aimY: 1.1, r: 0.9,
      get dead() { return h.dead; },
      hit(w) { killHunter(w, h); },
    };
    world.targets.push(h.target);
    gang.hunters.push(h);
  }
  showToast('BOUNTY HUNTERS! The Vipers want their turf back');
  showNews('hitmen contracted against the new district boss');
}

function killHunter(world, h) {
  if (h.dead) return;
  h.dead = true;
  h.deadT = 0;
  h.mesh.rotation.z = Math.PI / 2;
  h.mesh.position.y = 0.25;
  if (world.gang.hunters.every((x) => x.dead)) {
    world.money += 300;
    showToast('BOUNTY SQUAD DOWN +$300');
    world.onSave?.();
  }
}

const _hv = new THREE.Vector3();

function updateHunters(world, dt) {
  const gang = world.gang;
  const player = world.player;

  if (gang.owned && gang.hunters.length === 0) {
    gang.hunterT -= dt;
    if (gang.hunterT <= 0) {
      gang.hunterT = 110 + Math.random() * 70;
      if (!player.inHeli) spawnHunters(world);
    }
  }

  for (let i = gang.hunters.length - 1; i >= 0; i--) {
    const h = gang.hunters[i];
    if (h.dead) {
      h.deadT += dt;
      if (h.deadT > 12) {
        world.scene.remove(h.mesh);
        const ti = world.targets.indexOf(h.target);
        if (ti >= 0) world.targets.splice(ti, 1);
        gang.hunters.splice(i, 1);
      }
      continue;
    }
    const focus = player.inCar ? player.inCar.pos : player.pos;
    const d = Math.hypot(focus.x - h.pos.x, focus.z - h.pos.z);
    h.heading = Math.atan2(focus.x - h.pos.x, focus.z - h.pos.z);
    h.mesh.rotation.y = h.heading;
    if (d > 12) {
      _hv.set(Math.sin(h.heading), 0, Math.cos(h.heading));
      h.pos.addScaledVector(_hv, 3.4 * dt);
      resolveCircle(h.pos, 0.4, world.city.colliders);
      h.animT += dt * 6;
      animateWalk(h.ch, h.animT, 0.7);
    }
    h.ch.rArm.rotation.x = -Math.PI / 2;
    h.shootT -= dt;
    if (h.shootT <= 0 && d < 30 && !player.inHeli && player.pos.y < 10) {
      h.shootT = 1.5 + Math.random() * 0.7;
      const from = h.pos.clone();
      from.y = 1.4;
      const aim = focus.clone();
      aim.y += 1.1 + (Math.random() - 0.5) * 0.5;
      addTracer(from, aim);
      addFlash(aim, 0xffd080, 0.25);
      sfxShot('pistol');
      if (Math.random() < 0.5) {
        if (player.inCar) player.inCar.health -= 5;
        else player.health -= 6;
      }
    }
  }
}

export function updateGang(world, dt) {
  const gang = world.gang;
  const player = world.player;

  updateDriveBys(world, dt);
  updateHunters(world, dt);

  // owned: quiet district, protection money ticks in
  if (gang.owned) {
    gang.incomeT += dt;
    if (gang.incomeT > 60) {
      gang.incomeT = 0;
      world.money += 40;
      showToast('TERRITORY INCOME +$40');
    }
    return;
  }

  const focus = player.inCar ? player.inCar.pos : player.pos;
  const inZone =
    focus.x > gang.zone.x0 - 20 && focus.x < gang.zone.x1 + 20 &&
    focus.z > gang.zone.z0 - 20 && focus.z < gang.zone.z1 + 20;

  for (const m of gang.members) {
    if (m.dead) {
      m.deadT += dt;
      if (m.deadT > 25) { // reinforcements arrive, but the kill count stands
        m.dead = false;
        m.mesh.rotation.z = 0;
        m.mesh.position.y = 0;
        const p = randomZonePoint(gang.zone);
        m.pos.set(p.x, 0, p.z);
      }
      continue;
    }

    // webbed up: can't move or shoot
    if (m.webT > 0) {
      m.webT -= dt;
      if (m.webT <= 0 && m.webWrap) m.webWrap.visible = false;
      continue;
    }

    const dToPlayer = Math.hypot(focus.x - m.pos.x, focus.z - m.pos.z);

    if (inZone && dToPlayer < 34 && !player.inHeli) {
      // face the intruder and shoot
      m.heading = Math.atan2(focus.x - m.pos.x, focus.z - m.pos.z);
      m.mesh.rotation.y = m.heading;
      m.ch.rArm.rotation.x = -Math.PI / 2; // aiming
      animateIdle(m.ch);
      m.ch.rArm.rotation.x = -Math.PI / 2;
      m.shootT -= dt;
      if (m.shootT <= 0) {
        m.shootT = 1.4 + Math.random() * 0.8;
        const from = m.pos.clone();
        from.y = 1.4;
        const aim = focus.clone();
        aim.y = focus.y + 1.2 + (Math.random() - 0.5);
        aim.x += (Math.random() - 0.5) * 3;
        aim.z += (Math.random() - 0.5) * 3;
        addTracer(from, aim);
        addFlash(aim, 0xffd080, 0.25);
        sfxShot('pistol');
        if (Math.random() < 0.5 && dToPlayer < 30) {
          if (player.inCar) player.inCar.health -= 5;
          else player.health -= 5;
        }
      }
    } else {
      // patrol the turf
      _v.set(m.tgt.x - m.pos.x, 0, m.tgt.z - m.pos.z);
      const d = _v.length();
      if (d < 1) {
        m.tgt = randomZonePoint(gang.zone);
      } else {
        _v.normalize();
        m.heading = Math.atan2(_v.x, _v.z);
        m.pos.addScaledVector(_v, 1.5 * dt);
        resolveCircle(m.pos, 0.4, world.city.colliders);
      }
      m.animT += dt * 3.4;
      animateWalk(m.ch, m.animT, 0.5);
      m.mesh.rotation.y = m.heading;
    }
  }
}
