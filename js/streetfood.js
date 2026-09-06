import * as THREE from 'three';
import { blockStart, pointBlocked } from './city.js';
import { showToast, showNews } from './hud.js';
import { sfxPickup, sfxMissionPass } from './sound.js';
import { addCrime } from './police.js';

// STREET FOOD: buy a hot-dog cart near spawn ($1800). Push it (hold E, walk)
// to a busy corner and hold E again to serve the queue of hungry peds that
// forms. Small cash per sale, but it stacks fast on a packed corner. Rare
// bad batch -> a health inspector shows up and fines you.

const CART_COST = 1800;
const SALE = 22;
const SERVE_TIME = 0.7;
const BAD_BATCH_CHANCE = 0.015; // per sale

function buildCart(scene) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.9, 1.1),
    new THREE.MeshStandardMaterial({ color: 0xd23b2e, metalness: 0.3, roughness: 0.6 })
  );
  body.position.y = 0.9;
  body.castShadow = true;
  g.add(body);
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(2.1, 0.08, 1.4),
    new THREE.MeshStandardMaterial({ color: 0xf2c94c })
  );
  roof.position.y = 1.9;
  g.add(roof);
  for (const [x, z] of [[-0.8, -0.5], [0.8, -0.5], [-0.8, 0.5], [0.8, 0.5]]) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 1, 5),
      new THREE.MeshStandardMaterial({ color: 0x9aa2ab, metalness: 0.6 })
    );
    post.position.set(x, 1.4, z);
    g.add(post);
  }
  for (const s of [-1, 1]) {
    const wheel = new THREE.Mesh(
      new THREE.TorusGeometry(0.28, 0.06, 6, 12),
      new THREE.MeshStandardMaterial({ color: 0x14181d })
    );
    wheel.position.set(s * 0.8, 0.3, 0);
    wheel.rotation.y = Math.PI / 2;
    g.add(wheel);
  }
  const c = document.createElement('canvas');
  c.width = 128; c.height = 24;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0a0a10'; ctx.fillRect(0, 0, 128, 24);
  ctx.fillStyle = '#ffd24a'; ctx.font = 'bold 15px Arial';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('HOT DOGS', 64, 13);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.36), new THREE.MeshBasicMaterial({ map: tex }));
  sign.position.set(0, 1.45, 0.56);
  g.add(sign);
  scene.add(g);
  return g;
}

function inspector(scene) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 1.1, 0.35),
    new THREE.MeshStandardMaterial({ color: 0x2b3a52 })
  );
  body.position.y = 0.9;
  g.add(body);
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.34, 0.34),
    new THREE.MeshStandardMaterial({ color: 0xc98e63 })
  );
  head.position.y = 1.6;
  g.add(head);
  const pad = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.3, 0.03),
    new THREE.MeshStandardMaterial({ color: 0xf2f2f2 })
  );
  pad.position.set(0.28, 1.1, 0.2);
  g.add(pad);
  g.visible = false;
  scene.add(g);
  return g;
}

export function initStreetFood(scene, world, save) {
  const kioskPos = world.city.spawn.clone().add(new THREE.Vector3(-14, 0, -8));
  const marker = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 0.4, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xd23b2e, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false })
  );
  marker.position.copy(kioskPos).setY(0.4);
  scene.add(marker);

  world.streetfood = {
    owned: !!save?.cartOwned,
    kioskPos,
    marker,
    cart: null,
    held: false,
    serveT: 0,
    queue: 0,
    earnedToday: 0,
    day: -1,
    inspector: inspector(scene),
    inspTimer: 0,
  };
  if (world.streetfood.owned) spawnCart(scene, world);
}

function spawnCart(scene, world) {
  const sf = world.streetfood;
  const p = sf.kioskPos.clone().add(new THREE.Vector3(3, 0, 0));
  sf.cart = buildCart(scene);
  sf.cart.position.copy(p);
}

export function updateStreetFood(world, dt, keys, pressed) {
  const sf = world.streetfood;
  if (!sf) return;
  world.foodHint = null;
  const player = world.player;
  const onFoot = !player.inCar && !player.inHeli && player.pos.y < 2;

  sf.marker.rotation.y += dt;
  sf.marker.visible = !sf.owned;

  // buy it
  if (!sf.owned) {
    if (onFoot && Math.hypot(player.pos.x - sf.kioskPos.x, player.pos.z - sf.kioskPos.z) < 3) {
      world.foodHint = `STREET FOOD LICENSE — press <b>E</b> to buy a cart ($${CART_COST})`;
      if (pressed['KeyE']) {
        if (world.money < CART_COST) showToast('Not enough cash for the cart');
        else {
          world.money -= CART_COST;
          sf.owned = true;
          spawnCart(world.scene, world);
          sfxMissionPass();
          showToast('CART BOUGHT — push it (hold E) to a busy corner and serve');
          world.onSave?.();
        }
      }
    }
    return;
  }
  if (!sf.cart) return;

  const cart = sf.cart;
  const dCart = Math.hypot(player.pos.x - cart.position.x, player.pos.z - cart.position.z);

  // push mode
  if (sf.held) {
    world.foodHint = 'PUSHING CART — release E to set it down';
    const behind = new THREE.Vector3(
      player.pos.x + Math.sin(player.heading) * 1.4,
      0,
      player.pos.z + Math.cos(player.heading) * 1.4
    );
    if (!pointBlocked(new THREE.Vector3(behind.x, 1, behind.z), world.city.colliders, 0.7)) {
      cart.position.lerp(behind, Math.min(1, 8 * dt));
    }
    cart.rotation.y = player.heading;
    if (!keys['KeyE']) sf.held = false;
    return;
  }

  if (!onFoot || dCart > 2.6) { sf.serveT = 0; return; }

  // daily reset
  if (sf.day !== world.dailyDay) { sf.day = world.dailyDay; sf.earnedToday = 0; }

  // count hungry peds near the cart -> that's your queue
  let hungry = 0;
  for (const ped of world.peds) {
    if (ped.dead || !ped.pos) continue;
    if (Math.hypot(ped.pos.x - cart.position.x, ped.pos.z - cart.position.z) < 12) hungry++;
  }
  sf.queue = Math.min(hungry, 8);

  if (keys['KeyE']) {
    sf.serveT += dt;
    world.foodHint = `SERVING — queue ${sf.queue} · today $${sf.earnedToday}`;
    if (sf.serveT >= SERVE_TIME && sf.queue > 0) {
      sf.serveT = 0;
      const take = SALE + ((Math.random() * 10) | 0);
      world.money += take;
      sf.earnedToday += take;
      if (Math.random() < dt * 3) sfxPickup();
      if (Math.random() < BAD_BATCH_CHANCE && sf.inspTimer <= 0) {
        sf.inspTimer = 10;
        showNews('a food-safety complaint is filed against a street cart');
      }
    }
  } else {
    sf.serveT = Math.max(0, sf.serveT - dt * 2);
    world.foodHint = sf.queue > 0
      ? `Hold <b>E</b> to serve — ${sf.queue} waiting`
      : 'Wheel the cart somewhere busier';
    // hold E while walking away = push it
    if (dCart < 1.6 && keys['KeyE']) sf.held = true;
  }

  // inspector arc
  if (sf.inspTimer > 0) {
    sf.inspTimer -= dt;
    sf.inspector.visible = true;
    const t = 1 - sf.inspTimer / 10;
    sf.inspector.position.set(
      cart.position.x + (1 - t) * 20,
      0,
      cart.position.z + (1 - t) * 6
    );
    if (sf.inspTimer <= 0) {
      sf.inspector.visible = false;
      const fine = Math.min(world.money, 350);
      world.money -= fine;
      showToast(`HEALTH INSPECTOR — $${fine} fine for the bad batch`);
      if (Math.random() < 0.3) addCrime(world, 1);
      world.onSave?.();
    }
  }
}
