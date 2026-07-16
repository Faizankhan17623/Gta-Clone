import * as THREE from 'three';
import { pointBlocked } from './city.js';
import { showToast, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxMissionFail, sfxCrash } from './sound.js';

// IRON CORNER GYM: an open-air heavy bag north of spawn. $50 buys ten
// seconds on the bag — land 18 punches (mash F) and you walk out TRAINED:
// +25 max health until midnight. The pump does not survive the sunrise.

const FEE = 50;
const GOAL = 18;
const BONUS = 25;

export function initGym(scene, world, save) {
  let pos = world.city.spawn.clone().add(new THREE.Vector3(-2, 0, 18));
  const probe = new THREE.Vector3(pos.x, 1, pos.z);
  if (pointBlocked(probe, world.city.colliders, 1.6)) pos = world.city.spawn.clone().add(new THREE.Vector3(-6, 0, 14));

  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 2.6, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x4a4f55, metalness: 0.6, roughness: 0.4 })
  );
  frame.position.copy(pos).setY(1.3);
  scene.add(frame);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.12), frame.material);
  arm.position.copy(pos).add(new THREE.Vector3(0.55, 2.5, 0));
  scene.add(arm);
  const bag = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.28, 1.1, 8),
    new THREE.MeshStandardMaterial({ color: 0x8a2a2a, roughness: 0.6 })
  );
  bag.position.copy(pos).add(new THREE.Vector3(1.1, 1.6, 0));
  scene.add(bag);

  world.gym = { pos, bag, bagHome: bag.position.clone(), working: 0, punches: 0, trained: false, trainedDay: -99, sway: 0 };
}

export function updateGym(world, dt, pressed) {
  const gym = world.gym;
  if (!gym) return;
  const player = world.player;
  world.gymHint = null;

  // the pump wears off at midnight
  if (gym.trained && world.dailyDay !== gym.trainedDay) {
    gym.trained = false;
    world.maxHealth -= BONUS;
    player.health = Math.min(player.health, world.maxHealth);
    showToast('The gym pump wore off — max health back to normal');
  }

  // bag physics theater
  gym.sway = Math.max(0, gym.sway - dt * 2);
  gym.bag.position.x = gym.bagHome.x + Math.sin(performance.now() * 0.012) * gym.sway * 0.3;

  const onFoot = !player.inCar && !player.inHeli && !player.inBoat;
  const d = Math.hypot(player.pos.x - gym.pos.x, player.pos.z - gym.pos.z);
  if (d > 4 || !onFoot) { gym.working = 0; return; }

  if (gym.working > 0) {
    gym.working -= dt;
    if (pressed['KeyF']) {
      gym.punches++;
      gym.sway = 1;
      sfxCrash(3);
    }
    world.gymHint = `WORK THE BAG — mash <b>F</b> · ${gym.punches}/${GOAL} punches · ${Math.ceil(gym.working)}s`;
    if (gym.working <= 0) {
      if (gym.punches >= GOAL) {
        gym.trained = true;
        gym.trainedDay = world.dailyDay;
        world.maxHealth += BONUS;
        player.health += BONUS;
        sfxMissionPass();
        showMissionMsg('TRAINED', `+${BONUS} max health until midnight`, '#f7a04a');
      } else {
        sfxMissionFail();
        showToast(`${gym.punches}/${GOAL} — the bag wins this round`);
      }
    }
    return;
  }

  if (gym.trained) { world.gymHint = 'IRON CORNER — you\'re already TRAINED today'; return; }
  world.gymHint = `Press <b>E</b> at IRON CORNER GYM — $${FEE} for a shot at <b>+${BONUS} max health</b> today`;
  if (pressed['KeyE']) {
    if (world.money < FEE) { showToast('Not enough cash'); return; }
    world.money -= FEE;
    gym.working = 10;
    gym.punches = 0;
    showToast('BELL RINGS — mash F!');
  }
}
