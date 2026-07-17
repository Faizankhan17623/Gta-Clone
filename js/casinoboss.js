import { createCharacter } from './characters.js';
import { showToast, showMissionMsg, showNews } from './hud.js';
import { sfxMissionPass, sfxMissionFail, sfxShot } from './sound.js';
import { addTracer } from './effects.js';

// HOUSE MONEY: once you own the Lucky 7 (it's on the property market),
// the house edge is yours — a daily take collected at the door. But a
// full till attracts crews: some nights three gunmen hit the floor, and
// if you don't put them down, they leave with your cut.

export function initCasinoboss(scene, world, save) {
  world.casinoboss = {
    takeDay: save?.casinoTakeDay ?? -99,
    robbers: [], raidT: 0, raidArmed: false,
  };
}

function casinoPos(world) {
  return world.propMarks?.find((m) => m.def.key === 'casino')?.pos || null;
}

function spawnRobbers(world, pos) {
  const cb = world.casinoboss;
  for (let i = 0; i < 3; i++) {
    const ch = createCharacter({ shirt: '#2a2a2e', pants: '#1a1a1e', hair: '#000' });
    world.scene.add(ch.group);
    ch.group.position.set(pos.x + 4 + i * 2, 0, pos.z + 4 - i * 2);
    const foe = { ch, pos: ch.group.position, hp: 70, dead: false, shootT: 1 + i * 0.4, webT: 0 };
    foe.target = {
      pos: foe.pos, aimY: 1.05, r: 1, webbable: true,
      get dead() { return foe.dead; },
      hit() { foe.hp -= 30; if (foe.hp <= 0 && !foe.dead) { foe.dead = true; foe.ch.group.rotation.z = Math.PI / 2; foe.ch.group.position.y = 0.25; } },
      web() { foe.webT = 4; },
    };
    world.targets.push(foe.target);
    cb.robbers.push(foe);
  }
}

function clearRobbers(world) {
  const cb = world.casinoboss;
  for (const f of cb.robbers) {
    world.scene.remove(f.ch.group);
    const ti = world.targets.indexOf(f.target);
    if (ti >= 0) world.targets.splice(ti, 1);
  }
  cb.robbers = [];
}

export function endCasinoRaid(world) {
  const cb = world.casinoboss;
  if (!cb || !cb.robbers.length) return;
  clearRobbers(world);
  world.casinoHint2 = null;
}

export function updateCasinoboss(world, dt, pressed) {
  const cb = world.casinoboss;
  if (!cb) return;
  const player = world.player;
  world.casinoHint2 = null;
  const owned = world.props?.owned?.casino;
  if (!owned) return;
  const pos = casinoPos(world);
  if (!pos) return;

  // live raid on the floor
  if (cb.robbers.length) {
    const alive = cb.robbers.filter((f) => !f.dead);
    if (!alive.length) {
      clearRobbers(world);
      const save = 900;
      world.money += save;
      sfxMissionPass();
      showMissionMsg('HOUSE DEFENDED', `The crew is carried out the back · +$${save} recovered`, '#c9b458');
      showNews('an attempted casino job ends the way casino jobs end');
      world.onSave?.();
      return;
    }
    cb.raidT -= dt;
    world.casinoHint2 = `THE LUCKY 7 IS BEING HIT — <b>${alive.length}</b> gunmen · ${Math.max(0, cb.raidT).toFixed(0)}s`;
    for (const f of alive) {
      if (f.webT > 0) { f.webT -= dt; continue; }
      const dx = player.pos.x - f.pos.x, dz = player.pos.z - f.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d < 28) {
        f.ch.group.rotation.y = Math.atan2(dx, dz);
        f.shootT -= dt;
        if (f.shootT <= 0 && !player.inCar) {
          f.shootT = 1.5 + Math.random();
          sfxShot('pistol');
          addTracer(f.pos.clone().setY(1.4), player.pos.clone().setY(player.pos.y + 1.1));
          if (Math.random() < 0.3 && !(player.dodgeT > 0)) player.health -= 8;
        }
      }
    }
    if (cb.raidT <= 0) {
      clearRobbers(world);
      sfxMissionFail();
      showMissionMsg('CLEANED OUT', 'The crew walks with tonight\'s take', '#c9b458');
      cb.takeDay = world.dailyDay; // nothing left to collect today
      return;
    }
    return;
  }

  // occasional raid alarm at night while the take is uncollected
  const night = world.clock >= 21 || world.clock <= 5;
  if (night && cb.takeDay !== world.dailyDay && !cb.raidArmed && Math.random() < dt * 0.01) {
    cb.raidArmed = true;
    cb.raidT = 90;
    spawnRobbers(world, pos);
    sfxMissionFail();
    showMissionMsg('SILENT ALARM', 'A crew just walked into YOUR casino', '#c9b458');
    return;
  }
  if (!night) cb.raidArmed = false;

  // collecting the daily take at the door
  const d = Math.hypot(player.pos.x - pos.x, player.pos.z - pos.z);
  if (d < 8 && d > 5.2 && cb.takeDay !== world.dailyDay && !player.inCar) {
    world.casinoHint2 = 'Press <b>E</b> — collect the LUCKY 7 house take';
    if (pressed['KeyE']) {
      cb.takeDay = world.dailyDay;
      const take = 600 + Math.floor(Math.random() * 400);
      world.money += take;
      sfxMissionPass();
      showToast(`HOUSE MONEY — +$${take}. The dealers pretend not to count it.`);
      world.onSave?.();
    }
  }
}
