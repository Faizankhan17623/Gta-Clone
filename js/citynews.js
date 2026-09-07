// Reactive city news — the ticker reports what YOU just did.
//
// Observer style: watches `world` each frame for state changes (wanted level,
// money jumps, wrecks, mission completions, chaos spikes, time of day) and
// pushes a headline through the existing `showNews()` HUD. Rate-limited so it
// doesn't spam, and it tracks running counts so it can say "3rd store this
// hour", "5-car pileup", etc.
//
// Touches no other module. `showNews` already exists in js/hud.js.

import { showNews } from './hud.js';

let world;
let cooldown = 0;              // min seconds between headlines
let last = { wanted: 0, money: 0, missions: 0, wrecks: 0, clock: 0, chaos: 0 };
const window1h = { robberies: 0, wrecks: 0, kills: 0, at: 0 }; // rolling in-game hour

const ORDINAL = ['', 'first', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', 'ninth', '10th'];
function ord(n) { return ORDINAL[n] || `${n}th`; }

function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

export function initCityNews(w) {
  world = w;
  last.clock = w.clock;
  last.money = w.money;
  world.cityNews = { post: (t) => tryPost(t, 6) }; // let others inject if useful
}

function tryPost(text, weight = 3) {
  if (cooldown > 0) return false;
  showNews(text);
  cooldown = 7 + weight;       // heavier stories hold the ticker longer
  return true;
}

export function updateCityNews(dt) {
  if (!world) return;
  cooldown = Math.max(0, cooldown - dt);

  // roll the "this hour" window
  if (world.time - window1h.at > 3600 / 24) { // one in-game hour ≈ 150 real s
    window1h.robberies = window1h.wrecks = window1h.kills = 0;
    window1h.at = world.time;
  }

  // ---- wanted level changes ----
  if (world.wanted > last.wanted) {
    const w = world.wanted;
    if (w === 1) tryPost(pick([
      'police responding to a disturbance downtown',
      'reports of an armed suspect in the central district',
    ]), 2);
    else if (w === 2) tryPost('multiple units now pursuing a suspect', 3);
    else if (w === 3) tryPost('POLICE HELICOPTER scrambled over the city', 5);
    else if (w === 4) tryPost('SWAT deployed — city block on lockdown', 6);
    else if (w === 5) tryPost('⚠ NATIONAL GUARD called in — armour on the streets', 9);
  } else if (world.wanted === 0 && last.wanted > 0) {
    tryPost(pick([
      'suspect evaded police — manhunt called off',
      'the streets are quiet again after a tense afternoon',
    ]), 2);
  }
  last.wanted = world.wanted;

  // ---- store robberies (money spike + heat, small) ----
  // The game credits robbery cash directly; a jump of a few hundred with heat
  // rising is the signature.
  const gain = world.money - last.money;
  if (gain > 120 && gain < 900 && world.wanted > 0 && world.wanted <= 2) {
    window1h.robberies++;
    if (window1h.robberies === 1) tryPost('a corner store was just robbed at gunpoint', 3);
    else tryPost(`that's the ${ord(window1h.robberies)} store hit this hour`, 4);
  } else if (gain > 2500) {
    tryPost(pick([
      `a masked figure made off with $${gain.toLocaleString()}`,
      `witnesses report a $${gain.toLocaleString()} heist near the water`,
    ]), 6);
  }
  last.money = world.money;

  // ---- vehicle wrecks / pileups ----
  let wrecks = 0;
  for (const g of [world.traffic, world.parked, world.cops]) {
    for (const v of g || []) if (v.dead) wrecks++;
  }
  if (wrecks > last.wrecks) {
    const added = wrecks - last.wrecks;
    window1h.wrecks += added;
    if (added >= 3) tryPost(`${added}-vehicle pileup snarls traffic`, 5);
    else if (window1h.wrecks >= 6) tryPost('a wave of wrecks across the city — police baffled', 6);
    else if (Math.random() < 0.5) tryPost(pick([
      'a car burns on the roadside, driver fled',
      'emergency crews responding to a vehicle fire',
    ]), 2);
  }
  last.wrecks = wrecks;

  // ---- mission completions ----
  if ((world.mission?.done | 0) > last.missions) {
    last.missions = world.mission.done | 0;
    if (Math.random() < 0.4) tryPost(pick([
      'freelance operator seen leaving the scene',
      'another job done clean — nobody talking',
    ]), 2);
  }

  // ---- chaos / rampage ----
  if (world.chaos > 40 && last.chaos <= 40) tryPost('CITY UNDER SIEGE — residents told to stay indoors', 8);
  else if (world.chaos > 15 && last.chaos <= 15) tryPost('a rampage is unfolding downtown', 5);
  last.chaos = world.chaos || 0;

  // ---- ambient time-of-day colour (only when nothing else is happening) ----
  const hr = Math.floor(world.clock);
  if (hr !== Math.floor(last.clock) && world.wanted === 0 && cooldown === 0 && Math.random() < 0.15) {
    if (hr === 6) tryPost('dawn breaks over the harbor', 1);
    else if (hr === 12) tryPost('lunch crowds fill the central plaza', 1);
    else if (hr === 19) tryPost('the neon comes on as the sun drops', 1);
    else if (hr === 0) tryPost('midnight — the city that never sleeps', 1);
    else if (hr === 3) tryPost('the streets belong to the night shift now', 1);
  }
  last.clock = world.clock;
}
