import * as THREE from 'three';
import { blockStart, N, pointBlocked } from './city.js';
import { showToast, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxMissionFail, sfxPickup } from './sound.js';

// NEWS 5 STRINGER: sign on at the news desk and the scanner starts
// coughing up scenes — a fire, a standoff, a "situation". Get a chopper
// over the scene inside the window and hold it there for the live shot.

const SCENES = [
  'three-alarm fire', 'police standoff', 'celebrity meltdown',
  'runaway crane', 'flash mob gone wrong', 'sinkhole, again',
];

export function initNewschopper(scene, world, save) {
  let pos = new THREE.Vector3(blockStart(9) + 10, 0, blockStart(1) + 40);
  const probe = new THREE.Vector3(pos.x, 1, pos.z);
  if (pointBlocked(probe, world.city.colliders, 1.6)) pos = new THREE.Vector3(blockStart(9) + 40, 0, blockStart(1) - 3);

  const desk = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 2.4, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x2a4a8a, roughness: 0.5 })
  );
  desk.position.copy(pos).setY(1.2);
  scene.add(desk);
  const dish = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 8, 6, 0, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0xd8d8e0, roughness: 0.4, side: THREE.DoubleSide })
  );
  dish.position.copy(pos).add(new THREE.Vector3(0, 2.8, 0));
  dish.rotation.x = -0.8;
  scene.add(dish);

  world.newsjob = { pos, onAir: false, scene: null, t: 0, holdT: 0, shots: save?.newsShots ?? 0 };
}

export function endNewsjob(world, quiet) {
  const nj = world.newsjob;
  if (!nj?.scene) return;
  nj.scene = null;
  world.newsBlip = null;
  world.newsHint = null;
  if (!quiet) { sfxMissionFail(); showToast('NEWS 5 — the scene went cold, no footage'); }
}

export function updateNewschopper(world, dt, pressed) {
  const nj = world.newsjob;
  if (!nj) return;
  const player = world.player;
  world.newsHint = null;
  world.newsBlip = null;

  if (!nj.scene) {
    const onFoot = !player.inCar && !player.inHeli && !player.inBoat;
    const d = Math.hypot(player.pos.x - nj.pos.x, player.pos.z - nj.pos.z);
    if (d < 3.5 && onFoot) {
      world.newsHint = `Press <b>E</b> — NEWS 5 STRINGER: chopper footage, $600 a shot (${nj.shots} aired)`;
      if (pressed['KeyE']) {
        const bi = 1 + Math.floor(Math.random() * (N - 2));
        const bj = 1 + Math.floor(Math.random() * (N - 2));
        nj.scene = {
          pos: new THREE.Vector3(blockStart(bi) + 30, 0, blockStart(bj) + 30),
          what: SCENES[Math.floor(Math.random() * SCENES.length)],
        };
        nj.t = 120;
        nj.holdT = 0;
        sfxPickup();
        showMissionMsg('SCANNER HIT', `A ${nj.scene.what} — get a bird over it, 120s`, '#7cd0f7');
      }
    }
    return;
  }

  nj.t -= dt;
  if (nj.t <= 0) { endNewsjob(world); return; }
  world.newsBlip = { x: nj.scene.pos.x, z: nj.scene.pos.z };

  const heli = player.inHeli;
  if (!heli) {
    world.newsHint = `NEWS 5 — you need a CHOPPER over the ${nj.scene.what} · <b>${Math.ceil(nj.t)}s</b>`;
    nj.holdT = 0;
    return;
  }
  const d = Math.hypot(heli.pos.x - nj.scene.pos.x, heli.pos.z - nj.scene.pos.z);
  if (d < 25 && heli.pos.y > 12) {
    nj.holdT += dt;
    world.newsHint = `ON THE SCENE — hold the shot: <b>${Math.max(0, 6 - nj.holdT).toFixed(1)}s</b>`;
    if (nj.holdT >= 6) {
      nj.shots++;
      const what = nj.scene.what;
      const pay = Math.round(600 * (world.payMult || 1));
      world.money += pay;
      endNewsjob(world, true);
      sfxMissionPass();
      showMissionMsg('LIVE AT FIVE', `Your footage of the ${what} leads the hour · +$${pay}`, '#7cd0f7');
      world.onSave?.();
    }
  } else {
    nj.holdT = 0;
    world.newsHint = `NEWS 5 — closer and higher over the scene · <b>${Math.ceil(nj.t)}s</b>`;
  }
}
