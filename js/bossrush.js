import * as THREE from 'three';
import { createCharacter } from './characters.js';
import { showToast, showMissionMsg, showNews } from './hud.js';
import { sfxMissionPass, sfxMissionFail, sfxShot } from './sound.js';
import { addTracer } from './effects.js';

// THE GAUNTLET OF ECHOES: a black obelisk at the park's edge. Touch it
// and four shades rise, one at a time — echoes of the WARDEN, VIPER,
// MIDAS, and the HARBOR THING (person-sized; the harbor is busy). One
// crown-sized payout per day for putting all four back down.

const WAVES = [
  { name: "THE WARDEN'S SHADE", hp: 160, dmg: 8, shirt: '#4a5a8a' },
  { name: "VIPER'S GHOST", hp: 220, dmg: 10, shirt: '#3a7a3a' },
  { name: 'MIDAS ECHO', hp: 280, dmg: 12, shirt: '#c9a020' },
  { name: 'HARBOR SPAWN', hp: 380, dmg: 15, shirt: '#1a3a4a' },
];
const REWARD = 8000;

export function initBossrush(scene, world, save) {
  const base = world.arena?.pos || world.city.spawn;
  const pos = new THREE.Vector3(base.x + 26, 0, base.z + 26);

  const obelisk = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 3.6, 0.9),
    new THREE.MeshStandardMaterial({ color: 0x14141c, metalness: 0.7, roughness: 0.25 })
  );
  obelisk.position.copy(pos).setY(1.8);
  scene.add(obelisk);

  world.bossrush = { pos, obelisk, on: false, wave: 0, foe: null, doneDay: save?.bossrushDay ?? -99, shootT: 1 };
}

function spawnShade(world) {
  const br = world.bossrush;
  const def = WAVES[br.wave];
  const ch = createCharacter({ shirt: def.shirt, pants: '#111118', hair: '#000' });
  ch.group.scale.setScalar(1.25);
  world.scene.add(ch.group);
  const a = Math.random() * Math.PI * 2;
  ch.group.position.set(br.pos.x + Math.cos(a) * 12, 0, br.pos.z + Math.sin(a) * 12);
  const foe = { def, ch, pos: ch.group.position, hp: def.hp, dead: false, webT: 0 };
  foe.target = {
    pos: foe.pos, aimY: 1.3, r: 1.3, webbable: true,
    get dead() { return foe.dead; },
    hit() { foe.hp -= 30; if (foe.hp <= 0 && !foe.dead) { foe.dead = true; foe.ch.group.rotation.z = Math.PI / 2; foe.ch.group.position.y = 0.3; } },
    web() { foe.webT = 2.5; },
  };
  world.targets.push(foe.target);
  br.foe = foe;
  sfxMissionFail();
  showMissionMsg(`WAVE ${br.wave + 1}/4`, def.name, '#b08af0');
}

function clearShade(world) {
  const br = world.bossrush;
  if (!br.foe) return;
  world.scene.remove(br.foe.ch.group);
  const ti = world.targets.indexOf(br.foe.target);
  if (ti >= 0) world.targets.splice(ti, 1);
  br.foe = null;
}

export function endBossrush(world, quiet) {
  const br = world.bossrush;
  if (!br?.on) return;
  br.on = false;
  clearShade(world);
  world.bossrushBlip = null;
  if (!quiet) { sfxMissionFail(); showToast('THE ECHOES FADE — the obelisk keeps score anyway'); }
}

export function updateBossrush(world, dt, pressed) {
  const br = world.bossrush;
  if (!br) return;
  const player = world.player;
  world.bossrushHint = null;
  world.bossrushBlip = null;
  br.obelisk.rotation.y += dt * 0.4;

  if (!br.on) {
    const onFoot = !player.inCar && !player.inHeli && !player.inBoat;
    const d = Math.hypot(player.pos.x - br.pos.x, player.pos.z - br.pos.z);
    if (d < 3.5 && onFoot && !world.arena?.active) {
      if (br.doneDay === world.dailyDay) { world.bossrushHint = 'THE OBELISK is quiet — the echoes need a day to reform'; return; }
      world.bossrushHint = `Press <b>E</b> — THE GAUNTLET OF ECHOES: 4 shades, $${REWARD}`;
      if (pressed['KeyE']) {
        br.on = true;
        br.wave = 0;
        spawnShade(world);
      }
    }
    return;
  }

  const foe = br.foe;
  if (!foe) return;
  world.bossrushBlip = { x: foe.pos.x, z: foe.pos.z };

  if (foe.dead) {
    clearShade(world);
    br.wave++;
    if (br.wave >= WAVES.length) {
      br.on = false;
      br.doneDay = world.dailyDay;
      const pay = Math.round(REWARD * (world.payMult || 1));
      world.money += pay;
      if (world.stats) world.stats.bossrush = (world.stats.bossrush || 0) + 1;
      sfxMissionPass();
      showMissionMsg('ALL ECHOES DOWN', `+$${pay} — the obelisk hums, satisfied`, '#b08af0');
      showNews('four familiar silhouettes flicker over the park and are gone');
      world.onSave?.();
    } else {
      spawnShade(world);
    }
    return;
  }

  // the shade fights: closes distance, shoots
  if (foe.webT > 0) { foe.webT -= dt; }
  else {
    const dx = player.pos.x - foe.pos.x, dz = player.pos.z - foe.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    foe.ch.group.rotation.y = Math.atan2(dx, dz);
    if (d > 8) { foe.pos.x += (dx / d) * 5 * dt; foe.pos.z += (dz / d) * 5 * dt; }
    br.shootT -= dt;
    if (br.shootT <= 0 && d < 30 && !player.inCar) {
      br.shootT = 1 + Math.random() * 0.5;
      sfxShot('pistol');
      addTracer(foe.pos.clone().setY(1.6), player.pos.clone().setY(player.pos.y + 1.1));
      if (Math.random() < 0.35 && !(player.dodgeT > 0)) player.health -= foe.def.dmg;
    }
  }
  world.bossrushHint = `${foe.def.name} — <b>${Math.max(0, foe.hp)}</b> hp · wave ${br.wave + 1}/4`;

  // wandering too far forfeits the run
  if (Math.hypot(player.pos.x - br.pos.x, player.pos.z - br.pos.z) > 70) endBossrush(world);
}
