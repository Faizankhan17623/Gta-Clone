import * as THREE from 'three';
import { blockStart, BLOCK, pointBlocked } from './city.js';
import { createCharacter, animateIdle } from './characters.js';
import { showToast, showNews } from './hud.js';
import { sfxMissionPass } from './sound.js';

// THE CREW: three specialists scattered around town who'll ride along on
// the City Bank job for a cut of the take, permanently, once hired. The
// DRIVER buys the escape leg more grace, the HACKER shortens the drill,
// the MUSCLE thins out the guards. heist.js reads world.crew.* directly.

const ROLES = [
  {
    key: 'driver', name: 'THE DRIVER', cost: 3000, shirt: '#2a3a55', hair: '#1a1a1a',
    blurb: 'idles a hot car two blocks from anywhere you rob — the escape window never really closes',
    offsetBlock: [4, 2],
  },
  {
    key: 'hacker', name: 'THE HACKER', cost: 4500, shirt: '#1c2026', hair: '#c9c9d2',
    blurb: 'shaves the vault drill down — less time holding a lobby full of angry guards',
    offsetBlock: [7, 8],
  },
  {
    key: 'muscle', name: 'THE MUSCLE', cost: 5000, shirt: '#43302a', hair: '#0a0a0a',
    blurb: 'a face guards recognize and, wisely, fewer of them show up',
    offsetBlock: [1, 6],
  },
];

function place(world, bi, bj) {
  const bx = blockStart(bi) + BLOCK / 2;
  const bz = blockStart(bj) + BLOCK / 2;
  const probe = new THREE.Vector3();
  for (const [dx, dz] of [[0, 0], [6, 0], [-6, 0], [0, 6], [0, -6], [6, 6], [-6, -6]]) {
    probe.set(bx + dx, 1, bz + dz);
    if (!pointBlocked(probe, world.city.colliders, 1)) return [bx + dx, bz + dz];
  }
  return [bx, bz]; // every probe blocked (park foliage, most likely) — spawn anyway
}

export function initCrew(scene, world, save) {
  const owned = new Set(save?.crew || []);
  const members = ROLES.map((role) => {
    const [x, z] = place(world, role.offsetBlock[0], role.offsetBlock[1]);
    const ch = createCharacter({ shirt: role.shirt, pants: '#101318', skin: '#c98e63', hair: role.hair });
    ch.group.position.set(x, 0, z);
    scene.add(ch.group);
    return { role, ch, pos: ch.group.position, animT: Math.random() * 5, hired: owned.has(role.key) };
  });
  world.crew = {
    members,
    get driver() { return members.find((m) => m.role.key === 'driver')?.hired; },
    get hacker() { return members.find((m) => m.role.key === 'hacker')?.hired; },
    get muscle() { return members.find((m) => m.role.key === 'muscle')?.hired; },
  };
}

export function updateCrew(world, dt, pressed) {
  const crew = world.crew;
  if (!crew) return;
  const player = world.player;
  world.crewHint = null;
  const onFoot = !player.inCar && !player.inHeli && !player.inBoat;

  for (const m of crew.members) {
    animateIdle(m.ch);
    if (m.hired) continue;
    const d = Math.hypot(player.pos.x - m.pos.x, player.pos.z - m.pos.z);
    if (d < 3.4 && onFoot) {
      world.crewHint = `Press <b>E</b> to recruit ${m.role.name} — $${m.role.cost} (${m.role.blurb})`;
      if (pressed['KeyE']) {
        if (world.money < m.role.cost) { showToast('Not enough cash'); continue; }
        world.money -= m.role.cost;
        m.hired = true;
        sfxMissionPass();
        showToast(`${m.role.name} JOINS THE CREW`);
        showNews(`word is a new face signed on for the next bank job — ${m.role.name.toLowerCase()}`);
        world.onSave?.();
      }
    }
  }
}
