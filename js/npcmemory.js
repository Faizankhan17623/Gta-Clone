// NPC memory — pedestrians remember how you've treated them.
//
// The city has a fixed pool of ~64 pedestrian objects that respawn as "fresh
// citizens" when they die or wander off. This module tags individuals with a
// memory:
//   'afraid'   — saw you shoot / punch / run someone down nearby. Flees on
//                sight for a while (hook in js/npc.js reads `p.mem`).
//   'friendly' — you gave them money, or REX fetched near them, or you cleared
//                a threat right by them. Waves, and may drop a cop tip-off.
//
// Memory decays over a few in-game minutes and is wiped when that ped object
// respawns (checked via a per-ped id we stamp).
//
// One small hook in js/npc.js (the flee check). Everything else is here.

let world;
let scanT = 0;
let prevWanted = 0;
let clearedAt = -999; // world.time when wanted last dropped from >0 to 0
const _bark = { afraid: ['...', 'oh no, not you', 'stay back!', 'somebody help'],
                friendly: ['hey, thanks again!', 'the hero returns', 'you\'re alright', 'need anything?'] };

export function initNpcMemory(w) {
  world = w;
  world.npcMemory = {
    afraidCount: 0,
    friendlyCount: 0,
    // let other systems mark a ped (e.g. dog fetch, mission save)
    mark: (ped, kind) => remember(ped, kind),
  };
}

function stamp(p) {
  // a ped is "the same person" until it respawns; deadT resets on respawn and
  // placePedOnBlock moves it, so we key on object identity + a birth counter.
  if (p._memBirth === undefined) p._memBirth = 0;
}

function remember(p, kind) {
  if (!p || p.dead) return;
  stamp(p);
  if (p.mem === kind) { p._memUntil = world.time + (kind === 'afraid' ? 150 : 220); return; }
  p.mem = kind;
  p._memUntil = world.time + (kind === 'afraid' ? 150 : 220);
  p._memBirthTag = p.deadT === 0 ? p._memBirth : p._memBirth; // tie to current life
  recount();
  if (!p.far) {
    world.bark?.(p.pos, pick(_bark[kind]));
    if (kind === 'friendly') p._wave = 2.5;
  }
}

function pick(a) { return a[(Math.random() * a.length) | 0]; }

function recount() {
  let a = 0, f = 0;
  for (const p of world.peds) {
    if (p.mem === 'afraid') a++;
    else if (p.mem === 'friendly') f++;
  }
  world.npcMemory.afraidCount = a;
  world.npcMemory.friendlyCount = f;
}

export function updateNpcMemory(dt) {
  if (!world) return;
  const player = world.player;
  const pcar = player.inCar;

  // track "just shook the cops" for the kindness heuristic
  if (prevWanted > 0 && world.wanted === 0) clearedAt = world.time;
  prevWanted = world.wanted;

  // --- clear memory on respawn: a dead ped that comes back is a new person ---
  for (const p of world.peds) {
    if (p.mem && p.dead && p.deadT === 0) {
      // just died — keep memory through the corpse phase, it clears on respawn
    }
    if (p.mem && !p.dead && p._memWasDead) {
      p.mem = null; p._memUntil = 0; // respawned
    }
    p._memWasDead = p.dead;
    // time decay
    if (p.mem && world.time > (p._memUntil || 0)) {
      p.mem = null;
    }
  }

  // --- witness violence: peds near a fresh kill / shot / car-strike remember ---
  // The game stamps world.lastShot {pos, t}. A recent shot within sight of a
  // living ped scares that ped.
  if (world.lastShot && world.time - world.lastShot.t < 0.4) {
    for (const p of world.peds) {
      if (p.dead || p.far) continue;
      if (p.pos.distanceTo(world.lastShot.pos) < 22) remember(p, 'afraid');
    }
  }
  // reckless driving past people
  if (pcar && !pcar.dead && pcar.vel.lengthSq() > 90) {
    for (const p of world.peds) {
      if (p.dead || p.far) continue;
      if (p.pos.distanceTo(pcar.pos) < 6) remember(p, 'afraid');
    }
  }

  // --- kindness: a money pickup grabbed right next to a ped (proxy for
  //     "handing them cash"), or a ped standing where you just cleared cops ---
  scanT -= dt;
  if (scanT <= 0) {
    scanT = 0.5;
    if (world.wanted === 0 && world.time - clearedAt < 2.5) {
      for (const p of world.peds) {
        if (!p.dead && !p.far && p.pos.distanceTo(player.pos) < 16 && Math.random() < 0.25) remember(p, 'friendly');
      }
    }
  }

  // --- friendly peds: wave animation + occasional cop tip-off ---
  for (const p of world.peds) {
    if (p._wave > 0) {
      p._wave -= dt;
      // nudge an arm up — reuse the articulation the walk anim uses
      if (p.ch?.rArm) p.ch.rArm.rotation.x = -2.2 + Math.sin(world.time * 12) * 0.3;
    }
    if (p.mem === 'friendly' && !p.dead && !p.far && world.wanted > 0 &&
        p.pos.distanceTo(player.pos) < 10 && Math.random() < 0.004) {
      // tip-off: shave a little heat and point the way
      world.bark?.(p.pos, pick(['cops went that way!', 'back alley\'s clear!', 'go, I didn\'t see you']));
      if (world.wantedTimer !== undefined) world.wantedTimer += 3;
    }
  }

  recount();
}
