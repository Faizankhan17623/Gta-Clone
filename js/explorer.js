import { blockStart, BLOCK, ROAD, N } from './city.js';
import { showToast, showMissionMsg } from './hud.js';
import { sfxPickup, sfxMissionPass } from './sound.js';

// THE CARTOGRAPHER: the city is a 10x10 grid and it knows exactly how
// much of it you've actually stood in. Every block you set foot on is
// logged; milestones pay at 25, 50, and all 100 — plus a running
// percentage whenever you cross into somewhere new.

export function initExplorer(world, save) {
  world.explorer = { seen: new Set(save?.blocksSeen || []), rewarded: save?.exploreRank ?? 0, checkT: 0 };
}

export function updateExplorer(world, dt) {
  const ex = world.explorer;
  if (!ex) return;
  ex.checkT -= dt;
  if (ex.checkT > 0) return;
  ex.checkT = 1.2;

  const p = world.player.pos;
  const span = BLOCK + ROAD;
  const bi = Math.floor((p.x - blockStart(0)) / span);
  const bj = Math.floor((p.z - blockStart(0)) / span);
  if (bi < 0 || bi >= N || bj < 0 || bj >= N) return;
  const key = bi * N + bj;
  if (ex.seen.has(key)) return;

  ex.seen.add(key);
  const count = ex.seen.size;
  sfxPickup();
  showToast(`NEW GROUND — ${count}/100 blocks walked (${count}%)`);

  const milestones = [[25, 1000], [50, 3000], [100, 10000]];
  for (let i = ex.rewarded; i < milestones.length; i++) {
    const [need, pay] = milestones[i];
    if (count < need) break;
    ex.rewarded = i + 1;
    world.money += pay;
    sfxMissionPass();
    showMissionMsg('THE CARTOGRAPHER', `${need} blocks charted · +$${pay}`, '#7cd0f7');
  }
  if (world.stats) world.stats.blocks = count;
  world.onSave?.();
}
