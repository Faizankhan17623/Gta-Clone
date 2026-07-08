import * as THREE from 'three';
import { showToast, showNews } from './hud.js';
import { sfxMissionPass, sfxPickup } from './sound.js';

// REX the companion dog: adopt him at the kennel by spawn. He follows you
// around the city, barks when the law shows up, and fetches money pickups.

export function initDog(scene, world, save) {
  // kennel hut on the plaza corner
  const kennelPos = world.city.spawn.clone().add(new THREE.Vector3(24, 0, -12));
  const hut = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 1.3, 1.8),
    new THREE.MeshLambertMaterial({ color: 0x7a4a26 })
  );
  hut.position.copy(kennelPos).setY(0.65);
  hut.castShadow = true;
  scene.add(hut);
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(1.5, 0.8, 4),
    new THREE.MeshLambertMaterial({ color: 0x5a3418 })
  );
  roof.position.copy(kennelPos).setY(1.7);
  roof.rotation.y = Math.PI / 4;
  scene.add(roof);

  // the dog himself: boxy corgi energy
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xa5713d });
  const dark = new THREE.MeshLambertMaterial({ color: 0x6b4423 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.95), mat);
  body.position.y = 0.42;
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.38, 0.4), mat);
  head.position.set(0, 0.72, 0.55);
  g.add(head);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.2), dark);
  snout.position.set(0, 0.64, 0.8);
  g.add(snout);
  for (const sx of [-0.13, 0.13]) {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 0.06), dark);
    ear.position.set(sx, 0.96, 0.52);
    g.add(ear);
  }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.42), dark);
  tail.position.set(0, 0.58, -0.6);
  g.add(tail);
  for (const [lx, lz] of [[-0.16, 0.3], [0.16, 0.3], [-0.16, -0.32], [0.16, -0.32]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.24, 0.11), dark);
    leg.position.set(lx, 0.12, lz);
    g.add(leg);
  }
  g.position.copy(kennelPos).add(new THREE.Vector3(1.6, 0, 0.6));
  scene.add(g);

  world.dog = {
    owned: !!save.dog,
    mesh: g,
    tail,
    pos: g.position,
    kennelPos,
    heading: 0,
    barkT: 0,
    fetchTarget: null,
    attackTarget: null,
    attackT: 0,
    animT: 0,
  };
}

export function updateDog(world, dt, pressed) {
  const dog = world.dog;
  const player = world.player;
  world.dogHint = null;

  if (!dog.owned) {
    dog.tail.rotation.y = Math.sin(world.time * 6) * 0.3; // hopeful wag
    const d = Math.hypot(player.pos.x - dog.kennelPos.x, player.pos.z - dog.kennelPos.z);
    if (d < 3.4 && !player.inCar && !player.inHeli) {
      world.dogHint = 'Press <b>E</b> to adopt REX — $500 (follows, barks at cops, fetches cash)';
      if (pressed['KeyE']) {
        if (world.money < 500) { showToast('Not enough cash'); return; }
        world.money -= 500;
        dog.owned = true;
        sfxMissionPass();
        showToast('REX ADOPTED! He\'s with you now');
        showNews('the web-slinger has a very good dog');
        world.onSave?.();
      }
    }
    return;
  }

  const focus = player.inCar ? player.inCar.pos : player.inBoat ? player.inBoat.pos : player.pos;
  let goal = focus;
  let goalDist = 3.2;

  // Z: sic him on the nearest enemy — REX pins them like a web-shot
  dog.attackT -= dt;
  if (pressed['KeyZ'] && dog.attackT <= 0 && !dog.attackTarget) {
    let best = null, bestD = 30;
    for (const tg of world.targets) {
      if (tg.dead) continue;
      const d = Math.hypot(tg.pos.x - focus.x, tg.pos.z - focus.z);
      if (d < bestD && (tg.pos.y || 0) < 4) { bestD = d; best = tg; }
    }
    if (best) {
      dog.attackTarget = best;
      world.bark(dog.pos, 'GRRRR!');
    } else {
      world.bark(dog.pos, '...?');
      showToast('REX sees nothing to bite (30m)');
      dog.attackT = 1;
    }
  }
  if (dog.attackTarget) {
    if (dog.attackTarget.dead) {
      dog.attackTarget = null;
    } else {
      goal = dog.attackTarget.pos;
      goalDist = 1.3;
      if (Math.hypot(goal.x - dog.pos.x, goal.z - dog.pos.z) < 1.6) {
        dog.attackTarget.hit(world);
        dog.attackTarget.hit(world);
        world.bark(dog.pos, 'CHOMP!');
        dog.attackTarget = null;
        dog.attackT = 4;
      }
    }
  }

  // fetch: lock onto a money cube near the player and go grab it (biting comes first)
  if (dog.attackTarget) dog.fetchTarget = null;
  else if (!dog.fetchTarget || dog.fetchTarget.type !== 'money') {
    dog.fetchTarget = null;
    for (const pk of world.pickups) {
      if (pk.type !== 'money') continue;
      if (Math.hypot(pk.pos.x - focus.x, pk.pos.z - focus.z) < 14) { dog.fetchTarget = pk; break; }
    }
  }
  if (dog.fetchTarget) {
    if (Math.hypot(dog.fetchTarget.pos.x - focus.x, dog.fetchTarget.pos.z - focus.z) > 24) {
      dog.fetchTarget = null; // too far behind — forget it
    } else {
      goal = dog.fetchTarget.pos;
      goalDist = 1.4;
    }
  }

  const dx = goal.x - dog.pos.x;
  const dz = goal.z - dog.pos.z;
  const d = Math.hypot(dx, dz);

  if (d > 60) { // left way behind (car chase) — he catches up movie-style
    dog.pos.set(focus.x - 2, 0, focus.z - 2);
  } else if (d > goalDist) {
    const spd = Math.min(12, 4.5 + d * 0.4);
    dog.pos.x += (dx / d) * spd * dt;
    dog.pos.z += (dz / d) * spd * dt;
    dog.heading = Math.atan2(dx, dz);
    dog.animT += dt * spd;
    dog.pos.y = Math.abs(Math.sin(dog.animT * 1.6)) * 0.14; // happy trot
  } else {
    dog.pos.y *= Math.max(0, 1 - 8 * dt);
  }
  dog.mesh.rotation.y = dog.heading;
  dog.tail.rotation.y = Math.sin(world.time * 10) * 0.5;

  // fetched it!
  if (dog.fetchTarget && Math.hypot(dog.fetchTarget.pos.x - dog.pos.x, dog.fetchTarget.pos.z - dog.pos.z) < 1.5) {
    world.money += 150;
    sfxPickup();
    showToast('REX FETCHED +$150');
    world.bark(dog.pos, 'WOOF!');
    // scatter the cube somewhere new
    const pk = dog.fetchTarget;
    pk.mesh.position.set((Math.random() - 0.5) * 500, 1.0, (Math.random() - 0.5) * 500);
    dog.fetchTarget = null;
    world.onSave?.();
  }

  // barks when the heat is near
  dog.barkT -= dt;
  if (dog.barkT <= 0) {
    for (const cop of world.cops) {
      if (cop.dead) continue;
      if (Math.hypot(cop.pos.x - dog.pos.x, cop.pos.z - dog.pos.z) < 22) {
        dog.barkT = 3;
        world.bark(dog.pos, 'WOOF WOOF!');
        break;
      }
    }
  }
}
