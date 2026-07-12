import * as THREE from 'three';
import { blockStart, roadCenter, pointBlocked, HALF } from './city.js';
import { showToast, showNews, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxPickup } from './sound.js';
import { addRep } from './economy.js';
import { addSmoke, addFlash } from './effects.js';
import { WATER_X0 } from './water.js';

// City Myths: five mysteries with no map markers, no arrows, no mercy.
// Glowing graffiti that reads like a riddle. A hatch that only opens when
// the walls have all spoken. A pale sedan that drives itself through the
// 3 AM rain. Something big circling the harbor after dark. And a mast on a
// corner that counts numbers at the night sky. Find them all.

const GRAF_LINES = [
  '"THE CITY KEEPS ITS HEART BURIED"',
  '"WHERE THE FIRST STONE WAS LAID"',
  '"FOUR TAGS OPEN ONE DOOR"',
  '"IT SLEEPS BELOW THE CROSSROADS"',
];
const NUMBERS = ['...7 ...19 ...4 ...88', '...12 ...12 ...0 ...41', '...88 ...4 ...19 ...7'];
const ALL = ['graffiti', 'bunker', 'ghostcar', 'seamonster', 'numbers'];

function findOpenSpot(colliders, x, z) {
  const probe = new THREE.Vector3(x, 1, z);
  for (let r = 0; r < 6; r++) {
    for (const [dx, dz] of [[0, 0], [r * 3, 0], [-r * 3, 0], [0, r * 3], [0, -r * 3]]) {
      probe.set(x + dx, 1, z + dz);
      if (!pointBlocked(probe, colliders, 1.2)) return { x: x + dx, z: z + dz };
    }
  }
  return { x, z };
}

function grafTexture(idx) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#2a2622';
  g.fillRect(0, 0, 128, 96);
  g.strokeStyle = '#453f38';
  for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(0, i * 16); g.lineTo(128, i * 16); g.stroke(); }
  g.fillStyle = '#5ef2a0';
  g.font = 'bold 40px Arial';
  g.textAlign = 'center';
  g.fillText(['?', '∆', 'IV', 'X'][idx], 64, 56);
  g.font = 'bold 11px Arial';
  g.fillText('who keeps painting these', 64, 84);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function initMyths(scene, world, save) {
  const cols = world.city.colliders;
  const m = {
    graf: new Set(save?.mythsGraf || []),
    done: new Set(save?.mythsDone || []),
    walls: [],
    teaseT: 300,
    numT: 0,
    holdT: 0,
  };

  // four tagged walls in far-flung corners — they glow, that's your only help
  const spots = [
    [blockStart(0) + 3, blockStart(2) + 3],
    [blockStart(7) + 57, blockStart(0) + 3],
    [blockStart(2) + 3, blockStart(8) + 57],
    [blockStart(9) + 57, blockStart(5) + 30],
  ];
  spots.forEach(([sx, sz], i) => {
    const p = findOpenSpot(cols, sx, sz);
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 2.6, 0.3),
      new THREE.MeshLambertMaterial({ color: 0x2a2622 })
    );
    wall.position.set(p.x, 1.3, p.z);
    wall.rotation.y = (i * Math.PI) / 2;
    scene.add(wall);
    const tag = new THREE.Mesh(
      new THREE.PlaneGeometry(2.9, 2.2),
      new THREE.MeshBasicMaterial({ map: grafTexture(i), transparent: true })
    );
    tag.position.set(0, 0.05, 0.17);
    wall.add(tag);
    const glow = new THREE.PointLight(0x5ef2a0, m.graf.has(i) ? 0 : 5, 7);
    glow.position.set(0, 0.4, 1);
    wall.add(glow);
    m.walls.push({ pos: wall.position, glow, idx: i });
  });

  // the bunker hatch under the crossroads — sealed until the walls have spoken
  const hp = findOpenSpot(cols, roadCenter(5) + 10, roadCenter(4) + 10);
  const hatch = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 1.4, 0.25, 14),
    new THREE.MeshStandardMaterial({ color: 0x3a3a30, metalness: 0.7, roughness: 0.4 })
  );
  hatch.position.set(hp.x, 0.12, hp.z);
  scene.add(hatch);
  m.hatchPos = hatch.position;
  m.hatch = hatch;

  // the numbers mast: a red light you will only notice at night
  const ap = findOpenSpot(cols, blockStart(8) + 3, blockStart(2) + 3);
  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.3, 22, 8),
    new THREE.MeshLambertMaterial({ color: 0x2c3038 })
  );
  mast.position.set(ap.x, 11, ap.z);
  scene.add(mast);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff3030 })
  );
  beacon.position.set(ap.x, 22.2, ap.z);
  scene.add(beacon);
  m.mastPos = mast.position;
  m.beacon = beacon;

  // the pale sedan (hidden until its hour)
  const ghost = new THREE.Group();
  const gmat = new THREE.MeshLambertMaterial({ color: 0xdfe8f2, transparent: true, opacity: 0.35 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.55, 4.2), gmat);
  body.position.y = 0.6;
  ghost.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 2.1), gmat);
  cabin.position.set(0, 1.1, -0.2);
  ghost.add(cabin);
  for (const s of [-1, 1]) {
    const lampGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xfff6d8, transparent: true, opacity: 0.7 })
    );
    lampGlow.position.set(s * 0.6, 0.6, 2.1);
    ghost.add(lampGlow);
  }
  ghost.visible = false;
  scene.add(ghost);
  m.ghost = ghost;
  m.ghostRoad = roadCenter(3);

  // the thing in the harbor (a long dark hump, mostly under the surface)
  const hump = new THREE.Mesh(
    new THREE.SphereGeometry(2.2, 12, 8),
    new THREE.MeshLambertMaterial({ color: 0x101d1a })
  );
  hump.scale.set(1, 0.45, 3.2);
  hump.visible = false;
  scene.add(hump);
  m.monster = hump;
  m.monsterA = 0;

  world.myths = m;
}

function complete(world, key, title, sub) {
  const m = world.myths;
  if (m.done.has(key)) return;
  m.done.add(key);
  if (world.stats) world.stats.myths = m.done.size;
  sfxMissionPass();
  showMissionMsg('MYTH: ' + title, sub, '#5ef2a0');
  world.onSave?.();
  if (m.done.size >= ALL.length) {
    world.money += 10000;
    addRep(world, 1000);
    setTimeout(() => {
      showMissionMsg('MYTHBUSTER', '+$10,000 — you have seen everything this city hides.', '#ffd24a');
      showNews('local historian: "some stories were never meant to be found. all of them were."');
    }, 3400);
    world.onSave?.();
  }
}

const _mv = new THREE.Vector3();

export function updateMyths(world, dt, keys, pressed) {
  const m = world.myths;
  if (!m) return;
  const player = world.player;
  world.mythHint = null;
  const night = world.clock >= 22 || world.clock < 5;

  // an occasional whisper in the news, so players know there's SOMETHING
  m.teaseT -= dt;
  if (m.teaseT <= 0) {
    m.teaseT = 420 + Math.random() * 300;
    if (m.done.size < ALL.length) {
      const teases = [
        'another glowing tag appeared overnight — police "not concerned"',
        'cab driver refuses night fares on the west grid, won\'t say why',
        'harbor patrol logs a sonar contact "the size of a bus", again',
        'radio hobbyists report a numbers broadcast with no licensed source',
      ];
      showNews(teases[(Math.random() * teases.length) | 0]);
    }
  }

  // ---- graffiti walls ----
  if (!m.done.has('graffiti') && !player.inCar && !player.inHeli) {
    for (const w of m.walls) {
      if (m.graf.has(w.idx)) continue;
      const d = Math.hypot(player.pos.x - w.pos.x, player.pos.z - w.pos.z);
      if (d < 3.4) {
        world.mythHint = 'Press <b>E</b> to study the graffiti';
        if (pressed['KeyE']) {
          m.graf.add(w.idx);
          w.glow.intensity = 0;
          sfxPickup();
          showMissionMsg('THE WALL SPEAKS', GRAF_LINES[w.idx] + ` (${m.graf.size}/4)`, '#5ef2a0');
          if (m.graf.size >= 4) {
            complete(world, 'graffiti', 'THE FOUR TAGS', 'The walls have all spoken. Something under the crossroads just unlocked.');
            showNews('all four of the strange tags have been touched — and something answered');
          }
          world.onSave?.();
        }
      }
    }
  }

  // ---- the bunker hatch ----
  if (!m.done.has('bunker') && m.graf.size >= 4 && !player.inCar) {
    const d = Math.hypot(player.pos.x - m.hatchPos.x, player.pos.z - m.hatchPos.z);
    if (d < 3) {
      world.mythHint = 'Hold <b>E</b> to open the hatch';
      if (keys['KeyE']) {
        m.holdT += dt;
        m.hatch.rotation.y += dt * 3;
        if (m.holdT > 2.2) {
          world.money += 5000;
          addFlash(m.hatchPos.clone().setY(1), 0x5ef2a0, 1.2);
          addSmoke(m.hatchPos.clone().setY(0.5), 1);
          complete(world, 'bunker', 'THE BURIED HEART',
            '+$5000 in pre-war bills, and a ledger with your street\'s name in it — dated 60 years ago.');
          showNews('a survey crew "finds nothing" beneath the crossroads, then buys everyone lunch in cash');
        }
      } else {
        m.holdT = 0;
      }
    }
  }

  // ---- the pale sedan: 3 AM, raining ----
  if (!m.done.has('ghostcar')) {
    const hour3 = world.clock >= 3 && world.clock < 4;
    const raining = (world.rainI || 0) > 0.3;
    if (hour3 && raining && !m.ghostUp && Math.abs(player.pos.x - m.ghostRoad) < 110) {
      m.ghostUp = true;
      m.ghost.visible = true;
      m.ghost.position.set(m.ghostRoad + 4, 0, Math.max(-HALF + 12, player.pos.z - 90));
      showNews('that pale sedan again — witnesses swear the driver\'s seat was empty');
    }
    if (m.ghostUp) {
      m.ghost.position.z += 12 * dt;
      m.ghost.children.forEach((ch) => {
        if (ch.material?.transparent) ch.material.opacity = 0.25 + Math.sin(world.time * 7) * 0.12;
      });
      const d = m.ghost.position.distanceTo(player.inCar ? player.inCar.pos : player.pos);
      if (d < 8) {
        m.ghostUp = false;
        m.ghost.visible = false;
        addFlash(m.ghost.position.clone().setY(1), 0xdfe8f2, 1.4);
        addSmoke(m.ghost.position.clone().setY(0.8), 1);
        complete(world, 'ghostcar', 'THE PALE SEDAN',
          'You got close enough to touch it. It was colder than the rain.');
      } else if (!hour3 || !raining || m.ghost.position.z > HALF - 12) {
        m.ghostUp = false;
        m.ghost.visible = false; // gone, like it was never there
      }
    }
  }

  // ---- the harbor thing: late night, by boat or by swim ----
  if (!m.done.has('seamonster')) {
    const lateNight = world.clock >= 22 || world.clock < 2;
    if (lateNight) {
      m.monster.visible = true;
      m.monsterA += dt * 0.14;
      m.monster.position.set(
        WATER_X0 + 120 + Math.sin(m.monsterA) * 40,
        0.15 + Math.sin(world.time * 0.8) * 0.18,
        60 + Math.cos(m.monsterA) * 40
      );
      m.monster.rotation.y = -m.monsterA;
      if (Math.random() < dt * 0.4) addSmoke(m.monster.position.clone().setY(0.6), 0.5);
      const watching = player.inBoat || player.swim;
      if (watching && m.monster.position.distanceTo(player.pos) < 24) {
        // it knows you saw it
        m.monster.visible = false;
        for (let i = 0; i < 5; i++) addSmoke(m.monster.position.clone().setY(0.6), 1.2);
        world.shake = 0.3;
        complete(world, 'seamonster', 'THE HARBOR THING',
          'It dove the moment you looked it in the wake. Sonar says it\'s still down there.');
        showNews('harbor patrol quietly doubles the night watch and says nothing');
      }
    } else {
      m.monster.visible = false;
    }
  }

  // ---- the numbers mast ----
  if (!m.done.has('numbers')) {
    m.beacon.visible = Math.floor(world.time * 1.4) % 2 === 0; // slow red blink
    if (night && !player.inCar && !player.inHeli) {
      const d = Math.hypot(player.pos.x - m.mastPos.x, player.pos.z - m.mastPos.z);
      if (d < 14) {
        m.numT -= dt;
        if (m.numT <= 0) {
          m.numT = 5;
          showToast('📻 ' + NUMBERS[(Math.random() * NUMBERS.length) | 0]);
        }
        if (d < 3.2) {
          world.mythHint = 'Hold <b>E</b> to search the mast';
          if (keys['KeyE']) {
            m.holdT += dt;
            if (m.holdT > 2.2) {
              world.money += 1000;
              complete(world, 'numbers', 'THE NUMBERS STATION',
                '+$1000 taped under the junction box, with a note: "STOP COUNTING."');
              showNews('the unlicensed broadcast stops mid-sequence and never returns');
            }
          } else {
            m.holdT = 0;
          }
        }
      }
    }
  }
}
