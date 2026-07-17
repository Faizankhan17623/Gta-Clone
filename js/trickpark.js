import * as THREE from 'three';
import { blockStart, pointBlocked } from './city.js';
import { showToast, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxPickup } from './sound.js';

// THE BOWL: a trick park on a west-side block. Ride in on the deck (K)
// and every airborne F is a flip — chain them before touching down to
// build a combo. Daily best pays out on the spot.

export function initTrickpark(scene, world, save) {
  let center = new THREE.Vector3(blockStart(1) + 18, 0, blockStart(5) + 18);
  const probe = new THREE.Vector3(center.x, 1, center.z);
  if (pointBlocked(probe, world.city.colliders, 4)) center = new THREE.Vector3(blockStart(1) + 40, 0, blockStart(5) + 40);

  // decorative quarter-pipes marking the zone
  const mat = new THREE.MeshStandardMaterial({ color: 0x7a8088, roughness: 0.8 });
  for (let i = 0; i < 4; i++) {
    const ramp = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 6, 3, 1), mat);
    ramp.rotation.z = Math.PI / 2;
    ramp.rotation.y = (i * Math.PI) / 2;
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    ramp.position.set(center.x + Math.cos(a) * 12, 0.6, center.z + Math.sin(a) * 12);
    scene.add(ramp);
  }

  world.trickpark = { center, combo: 0, flipT: 0, bestToday: save?.trickBest ?? 0, day: -1 };
}

export function updateTrickpark(world, dt, pressed) {
  const tp = world.trickpark;
  if (!tp) return;
  const player = world.player;
  world.trickHint = null;
  if (tp.day !== world.dailyDay) { tp.day = world.dailyDay; tp.bestToday = 0; }
  tp.flipT = Math.max(0, tp.flipT - dt);

  const d = Math.hypot(player.pos.x - tp.center.x, player.pos.z - tp.center.z);
  const inPark = d < 22;
  const onDeck = !!world.skateOn;
  const onFoot = !player.inCar && !player.inHeli && !player.inBoat;
  if (!inPark || !onFoot) { tp.combo = 0; return; }

  if (!onDeck) {
    world.trickHint = 'THE BOWL — ride in on your deck (<b>K</b>) and flip with <b>F</b> in the air';
    return;
  }

  if (!player.onGround) {
    world.trickHint = tp.combo > 0 ? `COMBO x${tp.combo} — keep flipping!` : 'Airborne — hit <b>F</b> to flip';
    if (pressed['KeyF'] && tp.flipT <= 0) {
      tp.flipT = 0.35;
      tp.combo++;
      player.mesh.rotation.x -= Math.PI * 2 * 0.001; // the flip itself is faked by the bob
      sfxPickup();
    }
  } else if (tp.combo > 0) {
    // touched down: cash the combo
    const score = tp.combo;
    tp.combo = 0;
    const pay = score * score * 25 * (world.festivalMult || 1);
    world.money += pay;
    if (score > tp.bestToday) {
      tp.bestToday = score;
      sfxMissionPass();
      showMissionMsg('TRICK COMBO', `x${score} — +$${pay} · today's best`, '#f7a04a');
      world.onSave?.();
    } else {
      showToast(`Combo x${score} — +$${pay}`);
    }
  } else {
    world.trickHint = `THE BOWL — jump and flip (<b>F</b>) · today's best x${tp.bestToday}`;
  }
}
