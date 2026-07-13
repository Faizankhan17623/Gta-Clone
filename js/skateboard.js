import * as THREE from 'three';
import { pointBlocked } from './city.js';
import { showToast, showNews } from './hud.js';
import { sfxMissionPass, sfxPickup } from './sound.js';

// The skate shack sells one thing: a deck. K flips it out anywhere on foot —
// faster streets, style that trickles while you carve, and every ollie pays
// a little swagger. It vanishes under you the moment you swim, swing or
// steal something with an engine, like all good boards do.

const DECK_COST = 800;

export function initSkateboard(scene, world, save) {
  // shack near the park lawn
  let sx = world.city.spawn.x + 40;
  let sz = world.city.spawn.z + 40;
  const probe = new THREE.Vector3(sx, 1, sz);
  if (pointBlocked(probe, world.city.colliders, 1.5)) { sx = world.city.spawn.x - 40; sz = world.city.spawn.z + 40; }
  const hut = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 2, 2.2),
    new THREE.MeshLambertMaterial({ color: 0x2a4a2e })
  );
  hut.position.set(sx, 1, sz);
  scene.add(hut);
  const c = document.createElement('canvas');
  c.width = 128; c.height = 40;
  const g = c.getContext('2d');
  g.fillStyle = '#122016'; g.fillRect(0, 0, 128, 40);
  g.fillStyle = '#5fe07a'; g.font = 'bold 16px Arial'; g.textAlign = 'center';
  g.fillText('SK8 SHACK', 64, 25);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.7), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  sign.position.set(sx, 2.4, sz);
  scene.add(sign);

  // the board rides under the player's rig
  const board = new THREE.Group();
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.05, 1.1),
    new THREE.MeshLambertMaterial({ color: 0x8a4a1a })
  );
  deck.position.y = 0.14;
  board.add(deck);
  for (const dz of [-0.38, 0.38]) {
    for (const dx of [-0.13, 0.13]) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 0.06, 8),
        new THREE.MeshLambertMaterial({ color: 0xf2e8d8 })
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(dx, 0.06, dz);
      board.add(wheel);
    }
  }
  board.visible = false;
  world.player.mesh.add(board);

  world.skate = {
    shackPos: new THREE.Vector3(sx, 0, sz),
    owned: !!save?.deck,
    on: false,
    board,
    airT: 0,
  };
}

export function updateSkateboard(world, dt, pressed) {
  const sk = world.skate;
  if (!sk) return;
  const player = world.player;
  world.skateHint = null;

  // the shack
  if (!sk.owned) {
    const d = Math.hypot(player.pos.x - sk.shackPos.x, player.pos.z - sk.shackPos.z);
    if (d < 3.4 && !player.inCar && !player.inHeli) {
      world.skateHint = `Press <b>E</b> to buy a DECK — $${DECK_COST} · <b>K</b> to ride, anywhere, forever`;
      if (pressed['KeyE']) {
        if (world.money < DECK_COST) { showToast('Not enough cash — decks aren\'t free, freedom is'); return; }
        world.money -= DECK_COST;
        sk.owned = true;
        sfxMissionPass();
        showToast('DECK ACQUIRED — press K to ride');
        showNews('the skate shack sells its good board; the shopkeeper looks bereft');
        world.onSave?.();
      }
    }
    return;
  }

  const grounded = !player.inCar && !player.inHeli && !player.inBoat && !player.inPlane &&
    !player.swim && !world.diving?.on;

  // K flips it out / kicks it up
  if (pressed['KeyK'] && grounded) {
    sk.on = !sk.on;
    sfxPickup();
    showToast(sk.on ? '🛹 ROLLING — Shift carves faster, Space ollies' : 'DECK POCKETED');
  }
  if (sk.on && !grounded) sk.on = false; // boards don't swim, fly or drive

  sk.board.visible = sk.on;
  world.skateOn = sk.on; // main reads this for the speed boost
  if (!sk.on) return;

  sk.board.position.set(0, 0, 0.05);

  const sp = Math.hypot(player.vel.x, player.vel.z);
  if (player.onGround && sp > 4) {
    world.style = (world.style || 0) + 3.5 * dt * (world.perks?.style ?? 1); // carving is style
    sk.board.rotation.z = Math.sin(world.time * 4) * 0.06;
  }
  // ollie: leaving the ground on the board at speed pays swagger
  if (!player.onGround) {
    sk.airT += dt;
  } else {
    if (sk.airT > 0.25 && sp > 5) {
      world.style = (world.style || 0) + 10;
      if (Math.random() < 0.3) showToast('🛹 CLEAN OLLIE');
    }
    sk.airT = 0;
  }
}
