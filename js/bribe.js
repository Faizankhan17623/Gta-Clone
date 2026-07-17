import { showToast } from './hud.js';
import { sfxPickup } from './sound.js';

// STREET BRIBES: at one or two stars, stop near a cruiser, press Y, and
// $500 a star makes the paperwork disappear. At three-plus they stop
// taking envelopes — too many witnesses in their own cars.

export function initBribe(world) {
  world.bribe = { cd: 0, paid: 0 };
}

export function updateBribe(world, dt, pressed) {
  const br = world.bribe;
  if (!br) return;
  const player = world.player;
  world.bribeHint = null;
  br.cd = Math.max(0, br.cd - dt);

  if (world.wanted < 1 || world.wanted > 2 || br.cd > 0) return;
  const slow = player.inCar ? player.inCar.vel.length() < 3 : player.vel.length() < 2;
  if (!slow) return;

  // a cop close enough to negotiate with
  let near = false;
  const pos = player.inCar ? player.inCar.pos : player.pos;
  for (const cop of world.cops) {
    if (cop.dead) continue;
    if (Math.hypot(cop.pos.x - pos.x, cop.pos.z - pos.z) < 9) { near = true; break; }
  }
  if (!near) return;

  const price = world.wanted * 500;
  world.bribeHint = `Press <b>Y</b> — slip the officer <b>$${price}</b> and this never happened`;
  if (pressed['KeyY']) {
    if (world.money < price) { showToast('The officer inspects your empty wallet. Insulting.'); br.cd = 3; return; }
    world.money -= price;
    world.wanted = 0;
    world.wantedTimer = 0;
    br.paid++;
    br.cd = 10;
    if (world.stats) world.stats.bribes = br.paid;
    sfxPickup();
    showToast('The envelope changes hands. The radio goes conveniently quiet.');
  }
}
