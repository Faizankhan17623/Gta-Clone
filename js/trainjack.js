import { showToast, showMissionMsg } from './hud.js';
import { sfxMissionPass } from './sound.js';

// TRAIN HIJACK: stand on the Harbor Line engine car and press E to take
// the controls. W opens the throttle to 2.5x, S crawls it to a fifth of
// line speed. The transit authority pays a "consultant fee" per full lap
// you drive without derailing anything (you can't — but they don't know).

export function initTrainjack(world) {
  world.trainjack = { driving: false, lapStart: 0, laps: 0 };
}

export function updateTrainjack(world, dt, pressed, keys) {
  const tj = world.trainjack;
  const tr = world.train;
  if (!tj || !tr || !tr.wagons?.length) return;
  const player = world.player;
  world.trainjackHint = null;

  const engine = tr.wagons[0];
  const epos = engine.position ?? engine.pos;
  if (!epos) return;
  const d = Math.hypot(player.pos.x - epos.x, player.pos.z - epos.z);
  const onTop = player.pos.y > epos.y + 1 && player.pos.y < epos.y + 6;
  const onFoot = !player.inCar && !player.inHeli && !player.inBoat;

  if (!tj.driving) {
    if (d < 5 && onTop && onFoot && !tr.heist) {
      world.trainjackHint = 'Press <b>E</b> to TAKE THE CONTROLS of the Harbor Line';
      if (pressed['KeyE']) {
        tj.driving = true;
        tj.lapStart = tr.t;
        showToast('YOU HAVE THE TRAIN — W faster · S slower · E step away');
      }
    }
    return;
  }

  // lost the engine (fell off, heist started) — controls revert
  if (d > 9 || !onTop || tr.heist || !onFoot) {
    tj.driving = false;
    tr.speedMult = 1;
    showToast('The Harbor Line shrugs you off and finds its timetable');
    return;
  }

  if (keys['KeyW']) tr.speedMult = Math.min(2.5, (tr.speedMult || 1) + 1.2 * dt);
  else if (keys['KeyS']) tr.speedMult = Math.max(0.2, (tr.speedMult || 1) - 1.2 * dt);
  world.trainjackHint = `DRIVING THE HARBOR LINE — <b>${((tr.speedMult || 1) * 100) | 0}%</b> throttle · E to step away`;

  // a full loop of track pays out
  if (tr.t - tj.lapStart > 900) {
    tj.lapStart = tr.t;
    tj.laps++;
    const pay = Math.round(400 * (world.payMult || 1));
    world.money += pay;
    sfxMissionPass();
    showMissionMsg('FULL LAP', `The transit authority wires a confused $${pay}`, '#7cd0f7');
  }

  if (pressed['KeyE']) {
    tj.driving = false;
    tr.speedMult = 1;
    showToast('You hand the Harbor Line back to nobody in particular');
  }
}
