import * as THREE from 'three';
import { blockStart, N, pointBlocked } from './city.js';
import { showToast, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxMissionFail, sfxPickup } from './sound.js';

// SLICE OF LIFE PIZZA: the oldest job in open-world history. Grab a run
// at the shop, four doorsteps light up one at a time, 100 seconds on the
// clock, tips scale with what's left of it. Any wheels you like.

const DROPS = 4;
const TIME = 100;

export function initPizza(scene, world, save) {
  let pos = world.city.spawn.clone().add(new THREE.Vector3(18, 0, -22));
  const probe = new THREE.Vector3(pos.x, 1, pos.z);
  if (pointBlocked(probe, world.city.colliders, 1.6)) pos = world.city.spawn.clone().add(new THREE.Vector3(14, 0, -26));

  const shop = new THREE.Mesh(
    new THREE.BoxGeometry(2, 2.2, 2),
    new THREE.MeshStandardMaterial({ color: 0xc94a2a, roughness: 0.6 })
  );
  shop.position.copy(pos).setY(1.1);
  scene.add(shop);
  const sign = new THREE.Mesh(
    new THREE.CylinderGeometry(0.8, 0.8, 0.15, 10),
    new THREE.MeshBasicMaterial({ color: 0xf7d04a })
  );
  sign.rotation.x = Math.PI / 2;
  sign.position.copy(pos).add(new THREE.Vector3(0, 2.6, 0));
  scene.add(sign);

  world.pizza = { pos, on: false, t: 0, idx: 0, drop: null, runs: save?.pizzaRuns ?? 0 };
}

function nextDrop(world) {
  const pz = world.pizza;
  const bi = 1 + Math.floor(Math.random() * (N - 2));
  const bj = 1 + Math.floor(Math.random() * (N - 2));
  const drop = new THREE.Vector3(blockStart(bi) + 6 + Math.random() * 40, 0, blockStart(bj) - 2.5);
  pz.drop = drop;
}

export function endPizza(world, quiet) {
  const pz = world.pizza;
  if (!pz?.on) return;
  pz.on = false;
  pz.drop = null;
  world.pizzaBlip = null;
  world.pizzaHint = null;
  if (!quiet) { sfxMissionFail(); showToast('PIZZA RUN BLOWN — four cold dinners'); }
}

export function updatePizza(world, dt, pressed) {
  const pz = world.pizza;
  if (!pz) return;
  const player = world.player;
  world.pizzaHint = null;
  world.pizzaBlip = null;

  if (!pz.on) {
    const onFoot = !player.inCar && !player.inHeli && !player.inBoat;
    const d = Math.hypot(player.pos.x - pz.pos.x, player.pos.z - pz.pos.z);
    if (d < 3.5 && onFoot) {
      world.pizzaHint = `Press <b>E</b> — PIZZA RUN: ${DROPS} doorsteps, ${TIME}s, tips for hustle`;
      if (pressed['KeyE']) {
        pz.on = true;
        pz.t = TIME;
        pz.idx = 0;
        nextDrop(world);
        sfxPickup();
        showMissionMsg('PIZZA RUN', 'Four boxes. One hundred seconds. No refunds.', '#f7d04a');
      }
    }
    return;
  }

  pz.t -= dt;
  if (pz.t <= 0) { endPizza(world); return; }
  world.pizzaBlip = { x: pz.drop.x, z: pz.drop.z };
  world.pizzaHint = `DELIVERY ${pz.idx + 1}/${DROPS} — <b>${Math.ceil(pz.t)}s</b>`;
  if (Math.hypot(player.pos.x - pz.drop.x, player.pos.z - pz.drop.z) < 4) {
    pz.idx++;
    sfxPickup();
    if (pz.idx >= DROPS) {
      const pay = Math.round((300 + pz.t * 6) * (world.payMult || 1));
      world.money += pay;
      pz.runs++;
      pz.on = false;
      pz.drop = null;
      if (world.stats) world.stats.pizzas = pz.runs;
      sfxMissionPass();
      showMissionMsg('ALL DELIVERED', `+$${pay} with tips`, '#f7d04a');
      world.onSave?.();
    } else {
      showToast(`Box ${pz.idx} handed over — next address is up`);
      nextDrop(world);
    }
  }
}
