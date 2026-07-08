import * as THREE from 'three';
import { makeHeli } from './heli.js';
import { showToast, showNews, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxMissionFail } from './sound.js';
import { addRep, addChaos } from './economy.js';

// THE LAST STAND: the game's ending. Once crowned, a red war-beam burns at
// your statue — the whole underworld unites to take the crown back. Three
// waves, a gunship, and then the credits roll. The final feature.

const WAVES = [
  { n: 6, color: 0x5a2a80, hp: 40, speed: 3.6 },  // the Jackals' best
  { n: 6, color: 0x1c2c50, hp: 70, speed: 4.4 },  // a hired strike team
];

let hooks = null;

function makeFoe(world, pos, def) {
  const a = Math.random() * Math.PI * 2;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.75, 1.8, 0.55),
    new THREE.MeshStandardMaterial({ color: def.color, metalness: 0.4, roughness: 0.55 })
  );
  mesh.position.set(pos.x + Math.sin(a) * (12 + Math.random() * 8), 0.9, pos.z + Math.cos(a) * (12 + Math.random() * 8));
  world.scene.add(mesh);
  const foe = { mesh, pos: mesh.position, hp: def.hp, speed: def.speed, dead: false };
  foe.target = {
    pos: foe.pos, aimY: 0.9, r: 1.0, webbable: true,
    get dead() { return foe.dead; },
    hit() {
      foe.hp -= 30;
      if (foe.hp <= 0 && !foe.dead) { foe.dead = true; foe.mesh.visible = false; }
    },
  };
  world.targets.push(foe.target);
  return foe;
}

function clearFoes(world) {
  const f = world.finale;
  for (const b of f.foes) {
    world.scene.remove(b.mesh);
    const ti = world.targets.indexOf(b.target);
    if (ti >= 0) world.targets.splice(ti, 1);
  }
  f.foes = [];
  if (f.boss) {
    world.scene.remove(f.boss.mesh);
    const hi = world.policeHelis.indexOf(f.boss);
    if (hi >= 0) world.policeHelis.splice(hi, 1);
    f.boss = null;
  }
}

export function initFinale(h, scene, world, save) {
  hooks = h;
  const pos = world.city.spawn.clone().add(new THREE.Vector3(0, 0, 36));
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(2.6, 3.8, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false })
  );
  beam.position.copy(pos).setY(30);
  beam.visible = false;
  scene.add(beam);
  world.finale = { pos, beam, active: false, wave: 0, foes: [], boss: null, won: !!save.lastStand };
}

export function endFinale(world) {
  const f = world.finale;
  if (!f || !f.active) return;
  f.active = false;
  world.finaleHint = null;
  clearFoes(world);
  sfxMissionFail();
  showMissionMsg('THE STAND IS BROKEN', 'The underworld melts away — return when ready', '#ff5a4a');
}

function startWave(world) {
  const f = world.finale;
  f.wave++;
  if (f.wave <= 2) {
    const def = WAVES[f.wave - 1];
    for (let i = 0; i < def.n; i++) f.foes.push(makeFoe(world, f.pos, def));
    sfxMissionPass();
    showMissionMsg(`WAVE ${f.wave}`, f.wave === 1 ? 'The Jackals sent everyone' : 'Hired guns — they came prepared', '#ff5a4a');
  } else {
    // the last argument: a gunship
    const a = Math.random() * Math.PI * 2;
    f.boss = makeHeli(world.scene, f.pos.x + Math.sin(a) * 120, 60, f.pos.z + Math.cos(a) * 120, a + Math.PI, true);
    world.policeHelis.push(f.boss); // the police-heli AI flies and shoots it
    sfxMissionPass();
    showMissionMsg('FINAL WAVE', 'They brought a gunship. Bring it down.', '#ffd24a');
    showNews('an unmarked gunship sweeps in low over the plaza');
  }
}

function victory(world) {
  const f = world.finale;
  f.active = false;
  f.won = true;
  world.finaleHint = null;
  clearFoes(world);
  world.money += 25000;
  addRep(world, 1000);
  addChaos(world, 60);
  world.slowmoT = 2;
  world.fwT = 8; // the sky celebrates
  sfxMissionPass();
  showMissionMsg('👑 THE CITY IS YOURS', 'Forever. +$25,000', '#ffd24a');
  showNews('the underworld surrenders — the crown is untouchable');
  world.onSave?.();
  setTimeout(() => { hooks?.freeze?.(); rollCredits(); }, 2600);
}

export function updateFinale(world, dt, pressed) {
  const f = world.finale;
  const player = world.player;
  world.finaleHint = null;
  if (!f) return;

  if (!f.active) {
    f.beam.visible = world.crowned && !f.won;
    if (!f.beam.visible) return;
    f.beam.rotation.y += dt;
    const d = Math.hypot(player.pos.x - f.pos.x, player.pos.z - f.pos.z);
    if (d < 4.5 && !player.inCar && !player.inHeli && !player.inBoat) {
      world.finaleHint = 'Press <b>E</b> for THE LAST STAND — the underworld comes for the crown';
      if (pressed['KeyE']) {
        f.active = true;
        f.wave = 0;
        startWave(world);
        showNews('every crew in the city moves on the plaza at once');
      }
    }
    return;
  }

  // stay and fight — the plaza is the hill to die on
  if (Math.hypot(player.pos.x - f.pos.x, player.pos.z - f.pos.z) > 70) { endFinale(world); return; }

  const alive = f.foes.filter((b) => !b.dead);
  if (f.wave <= 2) {
    world.finaleHint = `THE LAST STAND — wave ${f.wave}/3 · <b>${alive.length}</b> left`;
    for (const b of alive) {
      const dx = player.pos.x - b.pos.x;
      const dz = player.pos.z - b.pos.z;
      const bd = Math.hypot(dx, dz) || 1;
      if (bd > 1.7) {
        b.pos.x += (dx / bd) * b.speed * dt;
        b.pos.z += (dz / bd) * b.speed * dt;
        b.mesh.rotation.y = Math.atan2(dx, dz);
      } else if (Math.random() < dt * 1.4 && !player.inCar) {
        player.health -= 6;
      }
    }
    if (alive.length === 0) { clearFoes(world); startWave(world); }
  } else {
    world.finaleHint = 'THE LAST STAND — bring down the <b>gunship</b>';
    const b = f.boss;
    if (!b || b.dead || b.health <= 0 || !world.policeHelis.includes(b)) victory(world);
  }
}

function rollCredits() {
  const ui = document.createElement('div');
  ui.style.cssText = 'position:fixed;inset:0;z-index:60;background:#05070c;color:#fff;overflow:hidden;text-align:center;';
  ui.innerHTML =
    '<div id="cr-roll" style="position:absolute;left:0;right:0;top:100%;animation:crRoll 38s linear forwards">' +
    '<div style="font:900 italic 44px Arial;color:#ffd24a;letter-spacing:6px;margin-bottom:8px">OPEN CITY</div>' +
    '<div style="font:700 15px Arial;color:#9fb2c8;margin-bottom:40px">the city is yours forever</div>' +
    [['CREATED BY', 'Faizan Khan'],
     ['BUILT WITH', 'Three.js · vanilla JavaScript · zero build step'],
     ['THE JOURNEY', 'a 64-block demo → a 10×10 living metropolis'],
     ['TRAVERSAL', 'web-swinging · wall-runs · gliding · a jetpack'],
     ['THE GARAGE', 'cars · bikes · helicopters · boats · a stolen tank'],
     ['THE LAW', 'five stars of cops, SWAT, drones and the army'],
     ['THE UNDERWORLD', 'gangs · turf wars · heists · bounties · the armored truck'],
     ['THE LUCKY 7', 'blackjack · slots · roulette · five-card draw'],
     ['THE CITY LIVES', 'day and night · storms · pigeons · a UFO · REX the dog'],
     ['THE ENDING', 'sixteen trials · a crown · a statue · the last stand'],
     ['AND YOU', 'the one in the crown']]
      .map(([h, t]) => `<div style="margin:26px 0"><div style="font:800 13px Arial;color:#7cc77c;letter-spacing:3px">${h}</div><div style="font:700 19px Arial">${t}</div></div>`).join('') +
    '<div style="font:900 34px Arial;color:#ffd24a;margin:60px 0 120px;letter-spacing:4px">THE END</div>' +
    '</div>' +
    '<button id="cr-done" style="position:absolute;right:22px;bottom:18px;font:800 13px Arial;color:#111;border:none;border-radius:8px;padding:10px 16px;cursor:pointer;background:linear-gradient(180deg,#ffd24a,#f0a32a)">CONTINUE ➜</button>' +
    '<style>@keyframes crRoll{from{transform:translateY(0)}to{transform:translateY(-160%)}}</style>';
  document.body.appendChild(ui);
  ui.querySelector('#cr-done').onclick = () => {
    ui.remove();
    hooks?.unfreeze?.();
    showToast('👑 Long live the King');
  };
}
