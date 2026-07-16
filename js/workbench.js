import * as THREE from 'three';
import { pointBlocked } from './city.js';
import { showToast, showNews } from './hud.js';
import { sfxMissionPass } from './sound.js';

// THE WORKBENCH: a gunsmith's table a short walk from the garage. Three
// permanent mods, bought once, apply to every gun in the loadout — main.js
// reads world.gunMods directly at the point each effect matters (fire
// rate, bullet spread, and whether shooting quietly raises no heat).

const MODS = [
  { key: 'mag', name: 'EXTENDED MAG', cost: 4000, blurb: 'tighter cycle on every gun — faster follow-up shots' },
  { key: 'scope', name: 'RED DOT SCOPE', cost: 3500, blurb: 'less spread on every shot, first round included' },
  { key: 'silencer', name: 'SUPPRESSOR', cost: 6000, blurb: 'gunfire stops drawing heat while you\'re still clean' },
];

export function initWorkbench(scene, world, save) {
  let pos = world.city.spawn.clone().add(new THREE.Vector3(24, 0, 24));
  const probe = new THREE.Vector3(pos.x, 1, pos.z);
  if (pointBlocked(probe, world.city.colliders, 1.4)) pos = world.city.spawn.clone().add(new THREE.Vector3(20, 0, 28));

  const bench = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.9, 0.9),
    new THREE.MeshStandardMaterial({ color: 0x3a3530, metalness: 0.3, roughness: 0.7 })
  );
  bench.position.copy(pos).setY(0.45);
  scene.add(bench);
  const vice = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.3, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x6a6a72, metalness: 0.8, roughness: 0.3 })
  );
  vice.position.copy(pos).add(new THREE.Vector3(0, 0.65, 0));
  scene.add(vice);

  world.gunMods = { mag: false, scope: false, silencer: false, ...(save?.gunMods || {}) };
  world.workbench = { pos, bench, open: false };
}

export function updateWorkbench(world, dt, pressed) {
  const wb = world.workbench;
  if (!wb) return;
  const player = world.player;
  world.workbenchHint = null;
  wb.bench.rotation.y += dt * 0.15;

  const onFoot = !player.inCar && !player.inHeli && !player.inBoat;
  const d = Math.hypot(player.pos.x - wb.pos.x, player.pos.z - wb.pos.z);
  if (d > 4 || !onFoot) { wb.open = false; return; }

  if (!wb.open) {
    world.workbenchHint = 'Press <b>E</b> at the WORKBENCH to browse gun mods';
    if (pressed['KeyE']) wb.open = true;
    return;
  }

  const lines = MODS.map((m, i) =>
    world.gunMods[m.key] ? `${i + 1}) ${m.name} ✔` : `${i + 1}) ${m.name} — $${m.cost}`
  ).join(' · ');
  world.workbenchHint = `WORKBENCH: ${lines} · <b>E</b> to close`;

  for (let i = 0; i < MODS.length; i++) {
    if (!pressed['Digit' + (i + 1)]) continue;
    const m = MODS[i];
    if (world.gunMods[m.key]) { showToast('Already installed'); continue; }
    if (world.money < m.cost) { showToast('Not enough cash'); continue; }
    world.money -= m.cost;
    world.gunMods[m.key] = true;
    sfxMissionPass();
    showToast(`${m.name} INSTALLED — ${m.blurb}`);
    showNews(`a very specific gunsmith fits ${m.name.toLowerCase()} to a very specific arsenal`);
    world.onSave?.();
  }
  if (pressed['KeyE']) wb.open = false;
}
