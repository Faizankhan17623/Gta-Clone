import * as THREE from 'three';
import { blockStart, HALF, pointBlocked } from './city.js';
import { showToast } from './hud.js';
import { sfxPickup, sfxMissionPass } from './sound.js';

// THE GALLERIA: glass doors on a mid-town block, and behind them (well,
// behind a teleport) a real interior — food court, a fountain that eats
// coins, and a daily gift kiosk. The room floats out past the harbor
// where nobody will ever walk to it.

export function initMall(scene, world, save) {
  let door = new THREE.Vector3(blockStart(5) + 8, 0, blockStart(6) + 8);
  const probe = new THREE.Vector3(door.x, 1, door.z);
  if (pointBlocked(probe, world.city.colliders, 2)) door = new THREE.Vector3(blockStart(5) + 30, 0, blockStart(6) - 3);

  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 3.4, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x3a4a5a, metalness: 0.5, roughness: 0.3 })
  );
  frame.position.copy(door).setY(1.7);
  scene.add(frame);
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 2.8),
    new THREE.MeshBasicMaterial({ color: 0x9fd8f7, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
  );
  glass.position.copy(door).add(new THREE.Vector3(0, 1.6, 0.3));
  scene.add(glass);

  // the interior: a lit platform on stilts out in the bay (inside the
  // player-bounds envelope — clampPlayerBounds allows x up to HALF+256)
  const room = new THREE.Vector3(HALF + 150, 30, -250);
  const stilt = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 3, 30, 8),
    new THREE.MeshStandardMaterial({ color: 0x5a6068, roughness: 0.8 })
  );
  stilt.position.set(room.x, 15, room.z);
  scene.add(stilt);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xd8d2c8, roughness: 0.85 });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(36, 1, 26), floorMat);
  floor.position.set(room.x, 29.5, room.z);
  scene.add(floor);
  world.city.colliders.push({ x0: room.x - 18, x1: room.x + 18, z0: room.z - 13, z1: room.z + 13, h: 30 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xb8ccd8, roughness: 0.7 });
  for (const [w, h, x, z, rot] of [[36, 6, 0, -13, 0], [36, 6, 0, 13, 0], [26, 6, -18, 0, 1], [26, 6, 18, 0, 1]]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.4), wallMat);
    wall.position.set(room.x + x, 33, room.z + z);
    if (rot) wall.rotation.y = Math.PI / 2;
    scene.add(wall);
  }
  const light = new THREE.PointLight(0xfff2d8, 2.4, 46);
  light.position.set(room.x, 35.5, room.z);
  scene.add(light);
  // the fountain
  const fountain = new THREE.Mesh(
    new THREE.CylinderGeometry(2, 2.4, 0.8, 12),
    new THREE.MeshStandardMaterial({ color: 0x7cb8d8, roughness: 0.3 })
  );
  fountain.position.set(room.x, 30.4, room.z);
  scene.add(fountain);
  // the gift kiosk
  const kiosk = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.2), new THREE.MeshStandardMaterial({ color: 0xc95a8a, roughness: 0.6 }));
  kiosk.position.set(room.x + 12, 30.8, room.z - 8);
  scene.add(kiosk);

  world.mall = {
    door, room,
    fountainPos: fountain.position, kioskPos: kiosk.position,
    returnPos: null, giftDay: save?.mallGiftDay ?? -99, tossed: 0,
  };
}

export function updateMall(world, dt, pressed) {
  const ml = world.mall;
  if (!ml) return;
  const player = world.player;
  world.mallHint = null;
  const onFoot = !player.inCar && !player.inHeli && !player.inBoat;
  if (!onFoot) return;

  // street door → inside
  if (player.pos.y < 3 && Math.hypot(player.pos.x - ml.door.x, player.pos.z - ml.door.z) < 2.5) {
    world.mallHint = 'Press <b>E</b> — THE GALLERIA is open';
    if (pressed['KeyE']) {
      ml.returnPos = player.pos.clone();
      player.pos.set(ml.room.x - 14, 30.2, ml.room.z);
      player.vy = 0;
      sfxPickup();
      showToast('THE GALLERIA — climate-controlled, crime-discouraged');
    }
    return;
  }

  // inside?
  if (Math.abs(player.pos.y - 30) > 4 || Math.hypot(player.pos.x - ml.room.x, player.pos.z - ml.room.z) > 26) return;

  // exit near the west edge
  if (player.pos.x < ml.room.x - 12) {
    world.mallHint = 'Press <b>E</b> to leave THE GALLERIA';
    if (pressed['KeyE']) {
      const back = ml.returnPos || ml.door;
      player.pos.set(back.x + 1.5, 0.2, back.z + 1.5);
      player.vy = 0;
      return;
    }
  }

  // the fountain takes donations
  if (Math.hypot(player.pos.x - ml.fountainPos.x, player.pos.z - ml.fountainPos.z) < 3.4) {
    world.mallHint = 'Press <b>E</b> — toss a dollar in the fountain (it judges you)';
    if (pressed['KeyE'] && world.money >= 1) {
      world.money -= 1;
      ml.tossed++;
      sfxPickup();
      if (ml.tossed % 20 === 0) { world.money += 100; showToast('The fountain, moved by your persistence, refunds $100'); }
      else showToast(ml.tossed % 2 ? 'Plink.' : 'Plonk.');
    }
    return;
  }

  // daily gift kiosk
  if (Math.hypot(player.pos.x - ml.kioskPos.x, player.pos.z - ml.kioskPos.z) < 2.6) {
    if (ml.giftDay === world.dailyDay) { world.mallHint = 'GIFT KIOSK — one per customer per day, the sign is very firm'; return; }
    world.mallHint = 'Press <b>E</b> — the GIFT KIOSK owes every visitor one daily mystery box';
    if (pressed['KeyE']) {
      ml.giftDay = world.dailyDay;
      const roll = Math.random();
      if (roll < 0.5) { const c = 50 + Math.floor(Math.random() * 150); world.money += c; showToast(`Mystery box: $${c}`); }
      else if (roll < 0.8) { world.player.health = world.maxHealth; showToast('Mystery box: a spa voucher — full health'); }
      else { world.money += 500; sfxMissionPass(); showToast('Mystery box: JACKPOT — $500'); }
      world.onSave?.();
    }
  }
}
