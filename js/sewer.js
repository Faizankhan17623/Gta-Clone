import * as THREE from 'three';
import { blockStart, HALF, pointBlocked } from './city.js';
import { showToast, showMissionMsg, showNews } from './hud.js';
import { sfxMissionPass, sfxMissionFail, sfxPickup } from './sound.js';
import { addSparks } from './effects.js';

// THE SEWER: a manhole two blocks from spawn, and under it (out past
// the west horizon, but who's checking) a dripping brick gallery where
// ALBERT lives. Albert is an alligator. Albert has the city's loosest
// treasure chest. Albert disagrees about the chest.

export function initSewer(scene, world, save) {
  let hole = new THREE.Vector3(blockStart(4) - 2, 0, blockStart(4) - 2);
  const probe = new THREE.Vector3(hole.x, 0.5, hole.z);
  if (pointBlocked(probe, world.city.colliders, 1)) hole = new THREE.Vector3(blockStart(4) + 20, 0, blockStart(4) - 2.5);

  const lid = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.7, 0.1, 12),
    new THREE.MeshStandardMaterial({ color: 0x4a4a42, metalness: 0.6, roughness: 0.6 })
  );
  lid.position.copy(hole).setY(0.05);
  scene.add(lid);

  // the gallery: a brick vault on stilts in the south bay ("the outfall")
  const room = new THREE.Vector3(HALF + 150, 30, 250);
  const stilt = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 3, 30, 8),
    new THREE.MeshStandardMaterial({ color: 0x3a3f38, roughness: 0.9 })
  );
  stilt.position.set(room.x, 15, room.z);
  scene.add(stilt);
  const brick = new THREE.MeshStandardMaterial({ color: 0x4a3f38, roughness: 0.95 });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(40, 1, 14), brick);
  floor.position.set(room.x, 29.5, room.z);
  scene.add(floor);
  world.city.colliders.push({ x0: room.x - 20, x1: room.x + 20, z0: room.z - 7, z1: room.z + 7, h: 30 });
  for (const z of [-7, 7]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(40, 5, 0.5), brick);
    wall.position.set(room.x, 32.5, room.z + z);
    scene.add(wall);
  }
  const glow = new THREE.PointLight(0x4a7a52, 1.6, 40);
  glow.position.set(room.x, 34, room.z);
  scene.add(glow);

  // ALBERT
  const gator = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 2.6), new THREE.MeshStandardMaterial({ color: 0x3a5a3a, roughness: 0.8 }));
  body.position.y = 0.25;
  gator.add(body);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 1), body.material);
  snout.position.set(0, 0.2, 1.6);
  gator.add(snout);
  gator.position.set(room.x + 10, 30, room.z);
  scene.add(gator);

  const al = { mesh: gator, pos: gator.position, hp: 300, dead: !!save?.albert, biteT: 0 };
  if (al.dead) gator.rotation.z = Math.PI;
  al.target = {
    pos: al.pos, aimY: 0.3, r: 1.4,
    get dead() { return al.dead; },
    hit() {
      al.hp -= 30;
      addSparks(al.pos.clone().setY(30.5), 5);
      if (al.hp <= 0 && !al.dead) { al.dead = true; al.mesh.rotation.z = Math.PI; }
    },
  };
  world.targets.push(al.target);

  // the chest behind him
  const chest = new THREE.Mesh(new THREE.BoxGeometry(1, 0.8, 0.7), new THREE.MeshStandardMaterial({ color: 0xc9a020, metalness: 0.5, roughness: 0.4 }));
  chest.position.set(room.x + 17, 30.4, room.z);
  scene.add(chest);

  world.sewer = {
    hole, room, albert: al, chestPos: chest.position, chest,
    looted: !!save?.sewerChest, returnPos: null,
  };
  if (world.sewer.looted) chest.visible = false;
}

export function updateSewer(world, dt, pressed) {
  const sw = world.sewer;
  if (!sw) return;
  const player = world.player;
  world.sewerHint = null;
  const onFoot = !player.inCar && !player.inHeli && !player.inBoat;
  if (!onFoot) return;

  // manhole → down
  if (player.pos.y < 3 && Math.hypot(player.pos.x - sw.hole.x, player.pos.z - sw.hole.z) < 2) {
    world.sewerHint = 'Press <b>E</b> — pry the MANHOLE and drop in';
    if (pressed['KeyE']) {
      sw.returnPos = player.pos.clone();
      player.pos.set(sw.room.x - 17, 30.2, sw.room.z);
      player.vy = 0;
      sfxPickup();
      showToast('THE SEWER — something large breathes in the dark');
    }
    return;
  }

  // inside?
  if (Math.abs(player.pos.y - 30) > 4 || Math.hypot(player.pos.x - sw.room.x, player.pos.z - sw.room.z) > 24) return;

  // ladder out at the west end
  if (player.pos.x < sw.room.x - 15) {
    world.sewerHint = 'Press <b>E</b> — climb back to daylight';
    if (pressed['KeyE']) {
      const back = sw.returnPos || sw.hole;
      player.pos.set(back.x + 1.5, 0.2, back.z + 1.5);
      player.vy = 0;
      return;
    }
  }

  const al = sw.albert;
  if (!al.dead) {
    // Albert defends the deep end
    al.biteT = Math.max(0, al.biteT - dt);
    const dx = player.pos.x - al.pos.x, dz = player.pos.z - al.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    if (d < 14 && player.pos.x > sw.room.x) {
      al.mesh.rotation.y = Math.atan2(dx, dz);
      al.pos.x += (dx / d) * 3.4 * dt;
      al.pos.z += (dz / d) * 3.4 * dt;
      if (d < 2 && al.biteT <= 0) {
        al.biteT = 1.4;
        player.health -= 16;
        sfxMissionFail();
        showToast('ALBERT BITES — he was here first');
      }
      world.sewerHint = `ALBERT — <b>${Math.max(0, al.hp)}</b> hp between you and the chest`;
    }
    return;
  }

  // chest
  if (!sw.looted && Math.hypot(player.pos.x - sw.chestPos.x, player.pos.z - sw.chestPos.z) < 2.2) {
    world.sewerHint = 'Press <b>E</b> — the chest Albert was sitting on';
    if (pressed['KeyE']) {
      sw.looted = true;
      sw.chest.visible = false;
      world.money += 3000;
      if (world.stats) world.stats.albert = 1;
      sfxMissionPass();
      showMissionMsg('THE GATOR\'S HOARD', '+$3000 in damp, uncomplaining bills', '#7cf78c');
      showNews('sanitation workers report the sewers feel roomier lately');
      world.onSave?.();
    }
  }
}
