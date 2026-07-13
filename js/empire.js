import * as THREE from 'three';
import { blockStart, BLOCK, pointBlocked, resolveCircle } from './city.js';
import { createCharacter, animateWalk } from './characters.js';
import { showToast, showNews, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxMissionFail } from './sound.js';
import { addRep, addChaos } from './economy.js';
import { addFlash } from './effects.js';

// Gang Empire: five flagged districts beyond your home turf. Take a flag by
// beating its defenders, collect district income every midnight — and hold
// what's yours, because the rival set WILL come back for it while you're
// busy playing cards. An empire is a chore. That's the point.

const ZONES = [
  { key: 'docksN', name: 'NORTH DOCKS', bi: 0, bj: 0 },
  { key: 'gasworks', name: 'GASWORKS', bi: 9, bj: 0 },
  { key: 'oldrow', name: 'OLD ROW', bi: 0, bj: 9 },
  { key: 'southgate', name: 'SOUTHGATE', bi: 9, bj: 9 },
  { key: 'midtown', name: 'MIDTOWN CUT', bi: 7, bj: 3 },
];
const INCOME = 250;      // per zone, per midnight
const RAID_EVERY = 260;  // seconds-ish between rival moves
const RAID_TIMER = 90;

function findOpen(colliders, x, z) {
  const probe = new THREE.Vector3(x, 1, z);
  for (let r = 0; r < 7; r++) {
    for (const [dx, dz] of [[0, 0], [r * 3, 0], [-r * 3, 0], [0, r * 3], [0, -r * 3]]) {
      probe.set(x + dx, 1, z + dz);
      if (!pointBlocked(probe, colliders, 1.2)) return [x + dx, z + dz];
    }
  }
  return [x, z];
}

function makeThug(world, x, z, raider) {
  const ch = createCharacter({
    shirt: raider ? '#7a2a22' : '#2a1216',
    pants: '#191014',
    skin: '#a97e5c',
  });
  world.scene.add(ch.group);
  ch.group.position.set(x, 0, z);
  const foe = { ch, mesh: ch.group, pos: ch.group.position, animT: Math.random() * 5, hp: 50, dead: false };
  foe.target = {
    pos: foe.pos, aimY: 1.0, r: 0.95, webbable: true,
    get dead() { return foe.dead; },
    hit() {
      foe.hp -= 30;
      if (foe.hp <= 0 && !foe.dead) {
        foe.dead = true;
        foe.mesh.rotation.z = Math.PI / 2;
        foe.mesh.position.y = 0.25;
      }
    },
    web() { foe.webT = 5; },
  };
  world.targets.push(foe.target);
  return foe;
}

function clearThugs(world, list) {
  for (const f of list) {
    world.scene.remove(f.mesh);
    const ti = world.targets.indexOf(f.target);
    if (ti >= 0) world.targets.splice(ti, 1);
  }
  list.length = 0;
}

function setFlagColor(zone, owned) {
  zone.cloth.material.color.set(owned ? 0x2fd06a : 0xa02020);
}

export function initEmpire(scene, world, save) {
  const owned = new Set(save?.empire || []);
  const zones = ZONES.map((def) => {
    const cx = blockStart(def.bi) + BLOCK / 2;
    const cz = blockStart(def.bj) + BLOCK / 2;
    const [fx, fz] = findOpen(world.city.colliders, blockStart(def.bi) + 4, blockStart(def.bj) + 4);
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.14, 7, 8),
      new THREE.MeshLambertMaterial({ color: 0x3a3f48 })
    );
    pole.position.set(fx, 3.5, fz);
    scene.add(pole);
    const cloth = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 1.2),
      new THREE.MeshLambertMaterial({ color: 0xa02020, side: THREE.DoubleSide })
    );
    cloth.position.set(fx + 1, 6.2, fz);
    scene.add(cloth);
    const zone = {
      ...def,
      rect: { x0: blockStart(def.bi), x1: blockStart(def.bi) + BLOCK, z0: blockStart(def.bj), z1: blockStart(def.bj) + BLOCK },
      flag: new THREE.Vector3(fx, 0, fz),
      cloth,
      owned: owned.has(def.key),
      fight: [],
    };
    setFlagColor(zone, zone.owned);
    return zone;
  });

  world.empire = {
    zones,
    raidT: RAID_EVERY,
    raid: null, // { zone, timeLeft, thugs }
    prevClock: world.clock,
  };
}

export function endEmpireFights(world) {
  const em = world.empire;
  if (!em) return;
  for (const z of em.zones) clearThugs(world, z.fight);
  if (em.raid) {
    // you went down mid-defense — the district changes hands
    loseZone(world, em.raid.zone, 'quietly, while the city watched something else');
    clearThugs(world, em.raid.thugs);
    em.raid = null;
  }
}

function loseZone(world, zone, how) {
  if (!zone.owned) return;
  zone.owned = false;
  setFlagColor(zone, false);
  sfxMissionFail();
  showMissionMsg('DISTRICT LOST', `${zone.name} fell to the rival set — ${how}.`, '#ff5a4a');
  showNews(`red bandanas fly over ${zone.name.toLowerCase()} again`);
  world.onSave?.();
}

export function updateEmpire(world, dt) {
  const em = world.empire;
  if (!em) return;
  const player = world.player;
  world.empireHint = null;
  world.empireBlip = null;

  const ownedCount = em.zones.filter((z) => z.owned).length;

  // midnight pays the boss
  if (world.clock < em.prevClock && ownedCount > 0) {
    const cut = Math.round(INCOME * ownedCount * (world.payMult || 1));
    world.money += cut;
    showToast(`EMPIRE INCOME +$${cut} (${ownedCount} district${ownedCount > 1 ? 's' : ''})`);
    world.onSave?.();
  }
  em.prevClock = world.clock;

  // ---- rival raid on an owned district ----
  if (em.raid) {
    const r = em.raid;
    r.timeLeft -= dt;
    world.empireBlip = { x: r.zone.flag.x, z: r.zone.flag.z, raid: true };
    const left = r.thugs.filter((f) => !f.dead).length;
    world.empireHint = `⚑ <b>${r.zone.name}</b> UNDER ATTACK — ${left} raiders · ${Math.max(0, Math.ceil(r.timeLeft))}s`;
    moveThugs(world, r.thugs, r.zone.flag, dt);
    if (left === 0) {
      clearThugs(world, r.thugs);
      em.raid = null;
      em.raidT = RAID_EVERY * (0.8 + Math.random() * 0.6);
      const bonus = Math.round(500 * (world.payMult || 1));
      world.money += bonus;
      addRep(world, 150);
      sfxMissionPass();
      showMissionMsg('DISTRICT HELD', `+$${bonus} — the rival set limps home`, '#2fd06a');
      world.onSave?.();
    } else if (r.timeLeft <= 0) {
      clearThugs(world, r.thugs);
      loseZone(world, r.zone, 'you never showed');
      em.raid = null;
      em.raidT = RAID_EVERY * (0.8 + Math.random() * 0.6);
    }
  } else if (ownedCount > 0) {
    const busy = world.mission?.active || world.finale?.active || world.prison?.inside || world.zombies?.active;
    if (!busy) em.raidT -= dt;
    if (em.raidT <= 0) {
      const targets = em.zones.filter((z) => z.owned);
      const zone = targets[(Math.random() * targets.length) | 0];
      const thugs = [];
      for (let i = 0; i < 3; i++) {
        thugs.push(makeThug(world, zone.flag.x + Math.sin(i * 2.1) * 4, zone.flag.z + Math.cos(i * 2.1) * 4, true));
      }
      em.raid = { zone, timeLeft: RAID_TIMER, thugs };
      sfxMissionFail();
      showMissionMsg('⚑ DISTRICT UNDER ATTACK', `${zone.name} — get there in ${RAID_TIMER}s or lose it.`, '#ff5a4a');
      showNews(`gunfire near the ${zone.name.toLowerCase()} flag — someone is redecorating`);
    }
  }

  // ---- takeovers ----
  for (const zone of em.zones) {
    if (zone.fight.length) {
      const left = zone.fight.filter((f) => !f.dead).length;
      world.empireHint = `⚑ TAKING <b>${zone.name}</b> — defenders left: ${left}`;
      world.empireBlip = { x: zone.flag.x, z: zone.flag.z };
      moveThugs(world, zone.fight, zone.flag, dt);
      if (left === 0) {
        clearThugs(world, zone.fight);
        zone.owned = true;
        setFlagColor(zone, true);
        addFlash(zone.flag.clone().setY(6), 0x2fd06a, 1);
        addRep(world, 250);
        addChaos(world, 20);
        if (world.stats) world.stats.districts = em.zones.filter((z) => z.owned).length;
        sfxMissionPass();
        showMissionMsg('DISTRICT TAKEN', `${zone.name} flies your colors — +$${INCOME}/night`, '#2fd06a');
        showNews(`the flag over ${zone.name.toLowerCase()} changed color overnight`);
        world.onSave?.();
      }
      continue;
    }
    if (zone.owned || em.raid) continue;
    const d = Math.hypot(player.pos.x - zone.flag.x, player.pos.z - zone.flag.z);
    if (d < 5 && !player.inCar && !player.inHeli) {
      world.empireHint = `Press <b>E</b> to take <b>${zone.name}</b> for the empire — 3 defenders`;
    }
  }
}

// E press handled here so main just forwards `pressed`
export function tryEmpireTakeover(world, pressed) {
  const em = world.empire;
  if (!em || em.raid || !pressed['KeyE']) return;
  const player = world.player;
  if (player.inCar || player.inHeli) return;
  for (const zone of em.zones) {
    if (zone.owned || zone.fight.length) continue;
    const d = Math.hypot(player.pos.x - zone.flag.x, player.pos.z - zone.flag.z);
    if (d < 5) {
      for (let i = 0; i < 3; i++) {
        zone.fight.push(makeThug(world, zone.flag.x + Math.sin(i * 2.1) * 5, zone.flag.z + Math.cos(i * 2.1) * 5, false));
      }
      sfxMissionFail();
      showMissionMsg('TAKEOVER', `${zone.name}: the local muscle objects. Overrule them.`, '#ffd24a');
      return;
    }
  }
}

const _ev = new THREE.Vector3();

function moveThugs(world, list, anchor, dt) {
  const player = world.player;
  const focus = player.inCar ? player.inCar.pos : player.pos;
  for (const f of list) {
    if (f.dead) continue;
    if (f.webT > 0) { f.webT -= dt; continue; }
    const toPlayer = Math.hypot(focus.x - f.pos.x, focus.z - f.pos.z);
    // chase the player when close, otherwise guard the flag
    const tgt = toPlayer < 30 ? focus : anchor;
    _ev.set(tgt.x - f.pos.x, 0, tgt.z - f.pos.z);
    const d = _ev.length() || 1;
    if (d > 2) {
      _ev.multiplyScalar(1 / d);
      f.pos.addScaledVector(_ev, 3.4 * dt);
      resolveCircle(f.pos, 0.4, world.city.colliders);
      f.mesh.rotation.y = Math.atan2(_ev.x, _ev.z);
      f.animT += dt * 6;
      animateWalk(f.ch, f.animT, 0.7);
    } else if (tgt === focus && !player.inCar && Math.random() < dt * 1.3 && !(player.dodgeT > 0)) {
      player.health -= 5;
    }
    // run them over, sure
    if (player.inCar && player.inCar.vel.lengthSq() > 25 && f.pos.distanceTo(player.inCar.pos) < 1.9) {
      f.dead = true;
      f.mesh.rotation.z = Math.PI / 2;
      f.mesh.position.y = 0.25;
    }
  }
}
