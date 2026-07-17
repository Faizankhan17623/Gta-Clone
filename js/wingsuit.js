import { showToast } from './hud.js';
import { sfxWeb } from './sound.js';

// WINGSUIT: press U in a long fall and the drop becomes a flight — hard
// forward speed, a gentle sink, steering with A/D. Landing softly is
// your problem. Unlocked free; it's a suit, not a miracle.

export function initWingsuit(world) {
  world.wingsuit = { on: false, told: false };
}

export function updateWingsuit(world, dt, pressed, keys) {
  const ws = world.wingsuit;
  if (!ws) return;
  const player = world.player;
  const airborne = !player.onGround && !player.inCar && !player.inHeli && !player.inBoat && !player.inPlane;

  if (!airborne) { ws.on = false; return; }

  // one-time hint on a real drop
  if (!ws.told && player.vy < -12 && player.pos.y > 25) {
    ws.told = true;
    showToast('Press <b>U</b> — WINGSUIT');
  }

  if (pressed['KeyU'] && !ws.on && player.vy < -4) {
    ws.on = true;
    sfxWeb();
    showToast('WINGSUIT — carve the skyline');
  }
  if (!ws.on) return;

  // convert fall into forward flight along the player's heading
  const h = player.heading;
  const fwdX = Math.sin(h), fwdZ = Math.cos(h);
  const sp = Math.hypot(player.vel.x, player.vel.z);
  const target = Math.min(30, sp + 26 * dt);
  player.vel.x = fwdX * target;
  player.vel.z = fwdZ * target;
  if (keys['KeyA']) player.heading += 1.6 * dt;
  if (keys['KeyD']) player.heading -= 1.6 * dt;
  if (player.vy < -7) player.vy = -7; // the suit sinks, it doesn't drop
  player.glide = true;
  player.mesh.rotation.x = -1.1; // superman lean
}
