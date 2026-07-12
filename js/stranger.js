import * as THREE from 'three';
import { blockStart, pointBlocked } from './city.js';
import { showToast, showNews, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxWeb } from './sound.js';
import { addSmoke, addFlash } from './effects.js';

// The Stranger: a grey figure who waits on street corners you have no
// reason to visit. He gives odd little tasks and never explains a thing.
// He pays in odd little numbers. Do all five and he'll tell you who he is —
// though you may wish he hadn't.

const PAY = 777;

const SPOTS = [
  [blockStart(1) + 3, blockStart(6) + 3],
  [blockStart(6) + 57, blockStart(6) + 57],
  [blockStart(3) + 3, blockStart(0) + 3],
  [blockStart(9) + 3, blockStart(9) + 57],
  [blockStart(4) + 30, blockStart(7) + 3],
];

const TASKS = [
  {
    ask: '"Bring the sky down to me. Land it close. I want to hear the blades."',
    doneLine: '"Louder than I remembered. Thank you."',
    test: (world, st) => {
      const h = world.player.inHeli;
      return h && h.pos.y < 3 && Math.hypot(h.pos.x - st.spot[0], h.pos.z - st.spot[1]) < 14;
    },
  },
  {
    ask: '"Stand where the city touches the sky. Anywhere. Just get above fifty-five meters and stop."',
    doneLine: '"From up there we all look like we\'re going somewhere."',
    test: (world) => world.player.pos.y > 55,
  },
  {
    ask: '"Swim beneath the moon. The harbor remembers everyone who does."',
    doneLine: '"Cold, isn\'t it. It was colder then."',
    test: (world) => world.player.swim && (world.clock >= 21 || world.clock < 5),
  },
  {
    ask: '"Let the webs sing. Three times. Anyone will do."',
    doneLine: '"Three. Always three. Never ask me why."',
    test: (world, st) => {
      const c = world.counters?.webbed || 0;
      if (c < st.base) st.base = c; // daily counter rolled over
      return c >= st.base + 3;
    },
    prep: (world, st) => { st.base = world.counters?.webbed || 0; },
  },
  {
    ask: '"Go back to where you first woke up in this city. After dark. See if it recognizes you."',
    doneLine: '"It does, you know. Cities keep count."',
    test: (world) => (world.clock >= 21 || world.clock < 5) &&
      Math.hypot(world.player.pos.x - world.city.spawn.x, world.player.pos.z - world.city.spawn.z) < 8,
  },
];

function findOpen(colliders, x, z) {
  const probe = new THREE.Vector3(x, 1, z);
  for (let r = 0; r < 6; r++) {
    for (const [dx, dz] of [[0, 0], [r * 3, 0], [-r * 3, 0], [0, r * 3], [0, -r * 3]]) {
      probe.set(x + dx, 1, z + dz);
      if (!pointBlocked(probe, colliders, 1.2)) return [x + dx, z + dz];
    }
  }
  return [x, z];
}

export function initStranger(scene, world, save) {
  const ch = createGreyMan();
  scene.add(ch.group);
  ch.group.visible = false;
  const stage = Math.min(TASKS.length + 1, save?.strangerStage | 0);
  world.stranger = {
    ch,
    mesh: ch.group,
    stage,                    // 0..4 = tasks, 5 = final reveal pending, 6 = done
    taskActive: false,
    base: 0,
    spot: null,
    fadeT: 0,
  };
  placeStranger(world);
}

function createGreyMan() {
  // a man drawn entirely in fog — importing createCharacter would drag in the
  // roster palette, so he gets his own quiet geometry
  const g = new THREE.Group();
  const mat = () => new THREE.MeshLambertMaterial({ color: 0x9aa0a8, transparent: true, opacity: 0.82 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.7, 0.34), mat());
  torso.position.y = 1.17;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), mat());
  head.position.y = 1.74;
  g.add(head);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.1, 10), mat());
  brim.position.y = 1.95;
  g.add(brim);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.24, 10), mat());
  crown.position.y = 2.1;
  g.add(crown);
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.66, 0.18), mat());
    arm.position.set(s * 0.4, 1.15, 0);
    g.add(arm);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.8, 0.22), mat());
    leg.position.set(s * 0.17, 0.42, 0);
    g.add(leg);
  }
  return { group: g };
}

function placeStranger(world) {
  const st = world.stranger;
  if (st.stage >= TASKS.length + 1) { st.mesh.visible = false; return; } // all done forever
  const idx = Math.min(st.stage, TASKS.length - 1);
  // the reveal happens where it all started
  const raw = st.stage >= TASKS.length ? [world.city.spawn.x + 6, world.city.spawn.z + 6] : SPOTS[idx];
  st.spot = findOpen(world.city.colliders, raw[0], raw[1]);
  st.mesh.position.set(st.spot[0], 0, st.spot[1]);
}

function vanish(world) {
  const st = world.stranger;
  addSmoke(st.mesh.position.clone().setY(1), 1.2);
  addFlash(st.mesh.position.clone().setY(1.2), 0x9aa0a8, 0.6);
  st.mesh.visible = false;
  sfxWeb();
}

export function updateStranger(world, dt, pressed) {
  const st = world.stranger;
  if (!st || st.stage >= TASKS.length + 1) return;
  const player = world.player;
  world.strangerHint = null;

  const d = Math.hypot(player.pos.x - st.spot[0], player.pos.z - st.spot[1]);

  // he is only ever there when you're close enough to doubt yourself
  if (!st.taskActive || st.stage >= TASKS.length) {
    st.mesh.visible = d < 40;
    if (st.mesh.visible) {
      st.mesh.rotation.y = Math.atan2(player.pos.x - st.spot[0], player.pos.z - st.spot[1]);
      st.mesh.position.y = Math.sin(world.time * 1.1) * 0.03; // not quite standing still
    }
  }

  // final reveal
  if (st.stage === TASKS.length) {
    if (d < 3 && !player.inCar && !player.inHeli) {
      world.strangerHint = 'Press <b>E</b> to hear him out';
      if (pressed['KeyE']) {
        st.stage++;
        world.money += 7777;
        if (world.stats) world.stats.stranger = 1;
        vanish(world);
        sfxMissionPass();
        showMissionMsg('THE STRANGER',
          '"I\'m who this city was before you got here. Keep it loud for me." +$7777', '#9aa0a8');
        showNews('an old man in a grey hat was seen smiling at the skyline, then not seen at all');
        world.onSave?.();
      }
    }
    return;
  }

  const task = TASKS[st.stage];

  if (!st.taskActive) {
    if (d < 3 && !player.inCar && !player.inHeli) {
      world.strangerHint = 'Press <b>E</b> to talk to the grey man';
      if (pressed['KeyE']) {
        st.taskActive = true;
        task.prep?.(world, st);
        vanish(world);
        showMissionMsg('THE STRANGER', task.ask, '#9aa0a8');
        showNews('did anyone else see the man in the grey hat? anyone?');
      }
    }
    return;
  }

  // task live: he watches from wherever he is now
  if (task.test(world, st)) {
    st.taskActive = false;
    st.stage++;
    world.money += PAY;
    sfxMissionPass();
    showMissionMsg('THE STRANGER APPROVES', `${task.doneLine} +$${PAY}`, '#9aa0a8');
    if (st.stage === TASKS.length) {
      showToast('One more meeting. Where you first woke up.');
      showNews('five odd favors, five odd payments — and a final invitation');
    }
    placeStranger(world);
    world.onSave?.();
  }
}
