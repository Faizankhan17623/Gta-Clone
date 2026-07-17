import * as THREE from 'three';
import { blockStart, pointBlocked } from './city.js';
import { showToast, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxMissionFail } from './sound.js';
import { addCrime } from './police.js';
import { addSparks } from './effects.js';

// GILDED CAGE JEWELERS: six display cases under one glass roof. Smash
// the first case and a 20-second clock starts — everything you break
// before it runs out goes in the bag. Three stars, guaranteed, always.
// Once a day; they restock overnight and raise their premiums.

const CASES = 6;
const WINDOW = 20;

export function initJewelry(scene, world, save) {
  let pos = new THREE.Vector3(blockStart(6) + 8, 0, blockStart(3) + 8);
  const probe = new THREE.Vector3(pos.x, 1, pos.z);
  if (pointBlocked(probe, world.city.colliders, 3)) pos = new THREE.Vector3(blockStart(6) + 40, 0, blockStart(3) - 3);

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(10, 0.3, 7),
    new THREE.MeshStandardMaterial({ color: 0xc9b458, metalness: 0.7, roughness: 0.3 })
  );
  roof.position.copy(pos).setY(3.2);
  scene.add(roof);
  for (const [px, pz] of [[-4.8, -3.3], [4.8, -3.3], [-4.8, 3.3], [4.8, 3.3]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.2, 6), roof.material);
    post.position.copy(pos).add(new THREE.Vector3(px, 1.6, pz));
    scene.add(post);
  }

  const cases = [];
  for (let i = 0; i < CASES; i++) {
    const cx = pos.x - 3 + (i % 3) * 3;
    const cz = pos.z - 1.6 + Math.floor(i / 3) * 3.2;
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 1, 1.1),
      new THREE.MeshStandardMaterial({ color: 0xbfd8e8, transparent: true, opacity: 0.55, roughness: 0.1 })
    );
    box.position.set(cx, 0.5, cz);
    scene.add(box);
    const c = { mesh: box, pos: box.position, smashed: false };
    c.target = {
      pos: c.pos, aimY: 0.5, r: 0.8, passive: true,
      get dead() { return c.smashed; },
      hit() { c.parentJw.onSmash(c); },
    };
    cases.push(c);
  }
  const jw = { pos, cases, active: false, t: 0, got: 0, doneDay: save?.jewelryDay ?? -99 };
  for (const c of cases) c.parentJw = jw;
  jw.onSmash = (c) => {
    if (c.smashed || jw.doneDay === world.dailyDay) return;
    if (!jw.active) {
      jw.active = true;
      jw.t = WINDOW;
      jw.got = 0;
      addCrime(world, 3);
      sfxMissionFail();
      showMissionMsg('SMASH & GRAB', `${WINDOW}s before the shutters drop — break everything`, '#c9b458');
    }
    c.smashed = true;
    c.mesh.visible = false;
    jw.got++;
    addSparks(c.pos.clone().setY(0.8), 10);
  };
  for (const c of cases) world.targets.push(c.target);
  world.jewelry = jw;
}

export function updateJewelry(world, dt) {
  const jw = world.jewelry;
  if (!jw) return;
  world.jewelryHint = null;

  // overnight restock
  if (jw.doneDay !== world.dailyDay && !jw.active && jw.cases[0].smashed) {
    for (const c of jw.cases) { c.smashed = false; c.mesh.visible = true; }
  }

  if (!jw.active) {
    const player = world.player;
    const d = Math.hypot(player.pos.x - jw.pos.x, player.pos.z - jw.pos.z);
    if (d < 14 && jw.doneDay !== world.dailyDay) {
      world.jewelryHint = 'GILDED CAGE JEWELERS — six cases of glass between you and a very bad idea';
    }
    return;
  }

  jw.t -= dt;
  const left = jw.cases.filter((c) => !c.smashed).length;
  world.jewelryHint = `SMASH & GRAB — <b>${Math.ceil(jw.t)}s</b> · ${left} cases left`;
  if (jw.t <= 0 || left === 0) {
    jw.active = false;
    jw.doneDay = world.dailyDay;
    const take = jw.got * (400 + Math.floor(Math.random() * 150)) + (left === 0 ? 1500 : 0);
    world.money += take;
    sfxMissionPass();
    showMissionMsg(left === 0 ? 'CLEANED OUT' : 'SHUTTERS DOWN', `${jw.got}/${CASES} cases · +$${take}`, '#c9b458');
    world.onSave?.();
  }
}
