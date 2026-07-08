import * as THREE from 'three';
import { showToast, showNews } from './hud.js';
import { sfxMissionPass } from './sound.js';

// Meta systems that give money a purpose and the world replay value:
//   - Properties you buy for daily passive income
//   - Reputation (your legend, separate from wanted level)
//   - Daily challenges that rotate each in-game day
//   - A free-roam chaos/combo meter

// `off` shifts the buy-spot outside a landmark's collision shell
const PROPERTIES = [
  { key: 'casino', name: 'LUCKY 7 CASINO', cost: 8000, income: 400, at: [-16, 12] },
  { key: 'stadium', name: 'THE STADIUM', cost: 15000, income: 800, block: [7, 2], off: [-42, 0] },
  { key: 'tower', name: 'THE SPIRE', cost: 25000, income: 1400, block: [2, 7], off: [-17, 0] },
];

const REP_TIERS = [
  { at: 0, name: 'NOBODY' },
  { at: 500, name: 'KNOWN' },
  { at: 1500, name: 'FAMOUS' },
  { at: 4000, name: 'CITY LEGEND' },
  { at: 9000, name: 'ICON' },
];

const DAILY = [
  { key: 'web10', text: 'Web 10 enemies', goal: 10, reward: 800, stat: 'webbed' },
  { key: 'swing2k', text: 'Swing 2 km without dying', goal: 2000, reward: 1000, stat: 'swungSinceDeath' },
  { key: 'wreck15', text: 'Wreck 15 vehicles', goal: 15, reward: 700, stat: 'wrecked' },
  { key: 'mission2', text: 'Pass 2 missions', goal: 2, reward: 1200, stat: 'missionsToday' },
  { key: 'packages3', text: 'Collect 3 hidden packages', goal: 3, reward: 900, stat: 'tokensToday' },
];

export function initEconomy(scene, world, save) {
  world.props = { owned: { ...(save.props || {}) } };
  world.rep = save.rep | 0;
  world.repTier = repTierName(world.rep);
  world.chaos = 0;
  world.chaosBest = save.chaosBest | 0;
  world.incomeT = 0;
  world.counters = { webbed: 0, swungSinceDeath: 0, wrecked: 0, missionsToday: 0, tokensToday: 0 };

  // pick a daily challenge from the in-game day number, so it rotates
  const day = Math.floor((world.time || 0) / 1440) + (save.dailyDay || 0);
  world.dailyDay = day;
  world.daily = DAILY[day % DAILY.length];
  world.dailyDone = !!save.dailyDone;

  // ownership beacons over buyable properties
  world.propMarks = [];
  for (const p of PROPERTIES) {
    const pos = propPos(world, p);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(2, 3, 40, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x2fd06a, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false })
    );
    beam.position.set(pos.x, 20, pos.z);
    beam.visible = false;
    scene.add(beam);
    world.propMarks.push({ def: p, pos, beam });
  }
  refreshPropBeams(world);
}

function propPos(world, p) {
  if (p.at) return world.city.spawn.clone().add(new THREE.Vector3(p.at[0], 0, p.at[1]));
  const { blockStart, BLOCK } = world.cityFns;
  const off = p.off || [0, 0];
  return new THREE.Vector3(
    blockStart(p.block[0]) + BLOCK / 2 + off[0], 0,
    blockStart(p.block[1]) + BLOCK / 2 + off[1]
  );
}

function refreshPropBeams(world) {
  for (const m of world.propMarks) m.beam.visible = !world.props.owned[m.def.key];
}

function repTierName(rep) {
  let name = REP_TIERS[0].name;
  for (const t of REP_TIERS) if (rep >= t.at) name = t.name;
  return name;
}

export function addRep(world, n) {
  world.rep += n;
  const tier = repTierName(world.rep);
  if (tier !== world.repTier) {
    world.repTier = tier;
    sfxMissionPass();
    showToast(`REPUTATION: ${tier}`);
    showNews(`the slinger is now ${tier.toLowerCase()} across the city`);
    world.onSave?.();
  }
}

// Chaos meter: mayhem builds it, dying banks the best and resets.
export function addChaos(world, n) {
  world.chaos += n;
  if (world.chaos > world.chaosBest) world.chaosBest = Math.round(world.chaos);
}

export function resetChaos(world) {
  world.chaos = 0;
  world.counters.swungSinceDeath = 0;
}

// Track a countable event toward the daily challenge.
export function trackDaily(world, stat, n = 1) {
  if (!world.counters) return;
  world.counters[stat] = (world.counters[stat] || 0) + n;
  const d = world.daily;
  if (!world.dailyDone && d && d.stat === stat && world.counters[stat] >= d.goal) {
    world.dailyDone = true;
    world.money += d.reward;
    addRep(world, 300);
    sfxMissionPass();
    showToast(`DAILY DONE: ${d.text} +$${d.reward}`);
    showNews('daily challenge complete');
    world.onSave?.();
  }
}

export function updateEconomy(world, dt, keys, pressed) {
  // passive property income (per in-game hour)
  world.incomeT += dt;
  if (world.incomeT > 60) {
    world.incomeT = 0;
    let total = 0;
    for (const p of PROPERTIES) if (world.props.owned[p.key]) total += p.income;
    if (total > 0) {
      world.money += total;
      showToast(`PROPERTY INCOME +$${total}`);
    }
  }

  // chaos decays slowly when you stop causing trouble
  if (world.chaos > 0) world.chaos = Math.max(0, world.chaos - dt * 2);

  // buy the property you're standing under (hold B)
  const focus = world.player.inCar ? world.player.inCar.pos : world.player.pos;
  world.propHint = null;
  for (const m of world.propMarks) {
    if (world.props.owned[m.def.key]) continue;
    if (Math.hypot(m.pos.x - focus.x, m.pos.z - focus.z) < 6) {
      world.propHint = `Press <b>B</b> to buy ${m.def.name} — $${m.def.cost} ($${m.def.income}/hr)`;
      if (pressed['KeyB']) {
        if (world.money >= m.def.cost) {
          world.money -= m.def.cost;
          world.props.owned[m.def.key] = true;
          addRep(world, 500);
          refreshPropBeams(world);
          sfxMissionPass();
          showToast(`BOUGHT ${m.def.name}!`);
          showNews(`the slinger now owns ${m.def.name}`);
          world.onSave?.();
        } else {
          showToast('Not enough cash');
        }
      }
    }
    m.beam.rotation.y += dt;
  }
}

export function newDay(world) { // called when the in-game day ticks over
  world.dailyDay++;
  world.daily = DAILY[world.dailyDay % DAILY.length];
  world.dailyDone = false;
  world.counters.missionsToday = 0;
  world.counters.tokensToday = 0;
  showNews('a new day — new daily challenge available');
}
