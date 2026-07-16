// EMOTES: press V on foot, then a digit, and the city gets a little
// performance — wave, flex, dance, sit, salute, bow. Purely for style
// (and screenshots). Any movement snaps you out of it.

const EMOTES = ['WAVE', 'FLEX', 'DANCE', 'SIT', 'SALUTE', 'BOW'];

export function initEmotes(world) {
  world.emote = { id: -1, t: 0, menuT: 0 };
}

export function updateEmotes(world, dt, pressed, keys) {
  const em = world.emote;
  if (!em) return;
  world.emoteHint = null;
  const player = world.player;
  const onFoot = !player.inCar && !player.inHeli && !player.inBoat && player.onGround;

  // movement cancels a running emote — and un-tilts the bow
  const moving = keys['KeyW'] || keys['KeyA'] || keys['KeyS'] || keys['KeyD'] || keys['Space'];
  if (em.t > 0 && (moving || !onFoot)) endEmote(world);
  if (em.t > 0) {
    em.t -= dt;
    if (em.t <= 0) endEmote(world);
    return;
  }

  if (!onFoot) { em.menuT = 0; return; }

  if (pressed['KeyV']) em.menuT = 4;
  if (em.menuT > 0) {
    em.menuT -= dt;
    world.nearKiosk = true; // digits emote here, not switch weapons
    world.emoteHint = 'EMOTE: 1) wave · 2) flex · 3) dance · 4) sit · 5) salute · 6) bow';
    for (let i = 0; i < EMOTES.length; i++) {
      if (pressed['Digit' + (i + 1)]) {
        em.id = i;
        em.t = i === 3 ? 6 : 3; // sitting lasts longer
        em.menuT = 0;
      }
    }
  }
}

function endEmote(world) {
  const em = world.emote;
  em.t = 0;
  const ch = world.player.ch;
  ch.group.rotation.x = 0;
  ch.lLeg.rotation.x = 0;
  ch.rLeg.rotation.x = 0;
  ch.lArm.rotation.z = 0.06;
  ch.rArm.rotation.z = -0.06;
}

// called from main's animation chain while an emote is live
export function poseEmote(ch, em) {
  const t = performance.now() * 0.001;
  const g = ch.group;
  g.position.y = g.userData.baseY || 0;
  g.rotation.x = 0;
  ch.lArm.rotation.x = 0; ch.rArm.rotation.x = 0;
  ch.lArm.rotation.z = 0.06; ch.rArm.rotation.z = -0.06;
  ch.lLeg.rotation.x = 0; ch.rLeg.rotation.x = 0;

  switch (em.id) {
    case 0: // wave
      ch.rArm.rotation.z = -2.6;
      ch.rArm.rotation.x = Math.sin(t * 9) * 0.5;
      break;
    case 1: // flex
      ch.lArm.rotation.z = 2.3 + Math.sin(t * 3) * 0.1;
      ch.rArm.rotation.z = -2.3 - Math.sin(t * 3) * 0.1;
      break;
    case 2: // dance
      ch.lArm.rotation.x = Math.sin(t * 6) * 1.4;
      ch.rArm.rotation.x = -Math.sin(t * 6) * 1.4;
      ch.lLeg.rotation.x = Math.sin(t * 6 + 1) * 0.4;
      ch.rLeg.rotation.x = -Math.sin(t * 6 + 1) * 0.4;
      g.position.y += Math.abs(Math.sin(t * 6)) * 0.12;
      break;
    case 3: // sit
      ch.lLeg.rotation.x = 1.5;
      ch.rLeg.rotation.x = 1.5;
      g.position.y -= 0.55;
      ch.lArm.rotation.x = 0.5;
      ch.rArm.rotation.x = 0.5;
      break;
    case 4: // salute
      ch.rArm.rotation.x = -2.4;
      ch.rArm.rotation.z = -0.5;
      break;
    case 5: // bow
      g.rotation.x = 0.65;
      ch.lArm.rotation.x = 0.4;
      ch.rArm.rotation.x = 0.4;
      break;
  }
}
