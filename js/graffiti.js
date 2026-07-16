import * as THREE from 'three';
import { blockStart, pointBlocked } from './city.js';
import { showToast, showNews } from './hud.js';
import { sfxMissionPass, sfxWeb } from './sound.js';
import { addRep } from './economy.js';
import { addCrime } from './police.js';

// GRAFFITI: ten blank walls around the city with a faint chalk outline.
// Hold E to spray your tag — cash and rep per piece, with a fat bonus
// for hitting all ten. Vandalism sometimes draws a star.

const SPOTS = [[1, 3], [3, 1], [2, 6], [6, 2], [4, 8], [7, 5], [7, 7], [1, 8], [5, 2], [6, 7]];

function tagTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 192;
  const g = c.getContext('2d');
  g.fillStyle = '#565b60';
  g.fillRect(0, 0, 256, 192);
  const hues = [340, 190, 45, 275];
  const hue = hues[Math.floor(Math.random() * hues.length)];
  g.strokeStyle = `hsl(${hue}, 90%, 60%)`;
  g.lineWidth = 14;
  g.lineJoin = 'round';
  g.font = '900 74px sans-serif';
  g.textAlign = 'center';
  g.save();
  g.translate(128, 110);
  g.rotate(-0.08);
  g.strokeText('WEB', 0, 0);
  g.fillStyle = `hsl(${(hue + 40) % 360}, 95%, 72%)`;
  g.fillText('WEB', 0, 0);
  g.restore();
  g.fillStyle = `hsla(${hue}, 90%, 60%, 0.5)`;
  for (let i = 0; i < 30; i++) g.fillRect(Math.random() * 256, Math.random() * 192, 3, 3);
  return new THREE.CanvasTexture(c);
}

export function initGraffiti(scene, world, save) {
  const done = new Set(save?.graffiti || []);
  const spots = [];
  for (let i = 0; i < SPOTS.length; i++) {
    const [bi, bj] = SPOTS[i];
    let pos = new THREE.Vector3(blockStart(bi) + 8, 0, blockStart(bj) + 8);
    const probe = new THREE.Vector3(pos.x, 1, pos.z);
    if (pointBlocked(probe, world.city.colliders, 2.2)) pos = new THREE.Vector3(blockStart(bi) + 30, 0, blockStart(bj) - 2.5);

    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 2.4, 0.25),
      new THREE.MeshStandardMaterial({ color: 0x565b60, roughness: 0.9 })
    );
    wall.position.copy(pos).setY(1.2);
    wall.rotation.y = (bi + bj) % 2 ? Math.PI / 2 : 0;
    scene.add(wall);
    const s = { id: i, pos, wall, done: done.has(i), progress: 0 };
    if (s.done) paint(s);
    spots.push(s);
  }
  world.graffiti = { spots };
}

function paint(s) {
  s.wall.material = new THREE.MeshStandardMaterial({ map: tagTexture(), roughness: 0.9 });
  s.done = true;
}

export function updateGraffiti(world, dt, keys) {
  const gf = world.graffiti;
  if (!gf) return;
  const player = world.player;
  world.graffitiHint = null;
  const onFoot = !player.inCar && !player.inHeli && !player.inBoat;
  if (!onFoot) return;

  for (const s of gf.spots) {
    if (s.done) continue;
    const d = Math.hypot(player.pos.x - s.pos.x, player.pos.z - s.pos.z);
    if (d > 3) { if (s.progress > 0) s.progress = 0; continue; }

    if (keys['KeyE']) {
      s.progress += dt / 1.8;
      world.graffitiHint = `Spraying… <b>${Math.min(99, Math.round(s.progress * 100))}%</b>`;
      if (Math.random() < 4 * dt) sfxWeb();
      if (s.progress >= 1) {
        paint(s);
        world.money += 150;
        addRep(world, 50);
        if (Math.random() < 0.25) addCrime(world, 1);
        sfxMissionPass();
        const count = gf.spots.filter((x) => x.done).length;
        showToast(`TAGGED — ${count}/10 walls (+$150, +50 rep)`);
        if (count === 10) {
          world.money += 3000;
          showToast('ALL CITY — every wall wears your name (+$3000)');
          showNews('a single tag now covers all ten of the city\'s "problem walls"');
        }
        world.onSave?.();
      }
    } else {
      world.graffitiHint = 'Hold <b>E</b> to spray your tag on the blank wall';
    }
    break;
  }
}
