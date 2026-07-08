import * as THREE from 'three';
import { blockStart, N } from './city.js';
import { showToast, showNews, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxMissionFail } from './sound.js';
import { addRep, addChaos } from './economy.js';

// Bounty contracts: a wanted board near spawn. Take a contract and a marked
// target (gold) hides out across the city with two bodyguards. On-foot work —
// webs, fists or bullets all count.

const REWARD = 1500;

function makeGuy(world, x, z, gold) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 1.8, 0.5),
    new THREE.MeshStandardMaterial({
      color: gold ? 0xd0a020 : 0x30363f,
      metalness: 0.4, roughness: 0.55,
      emissive: gold ? 0x503800 : 0x000000,
    })
  );
  mesh.position.set(x, 0.9, z);
  world.scene.add(mesh);
  const foe = { mesh, pos: mesh.position, hp: gold ? 80 : 40, dead: false };
  foe.target = {
    pos: foe.pos, aimY: 0.9, r: 1.0, webbable: true,
    get dead() { return foe.dead; },
    hit() {
      foe.hp -= 30;
      if (foe.hp <= 0 && !foe.dead) { foe.dead = true; foe.mesh.visible = false; }
    },
  };
  world.targets.push(foe.target);
  return foe;
}

function clearCrew(world) {
  const b = world.bounty;
  for (const f of b.crew) {
    world.scene.remove(f.mesh);
    const ti = world.targets.indexOf(f.target);
    if (ti >= 0) world.targets.splice(ti, 1);
  }
  b.crew = [];
  b.mark = null;
}

export function initBounty(scene, world) {
  const boardPos = world.city.spawn.clone().add(new THREE.Vector3(-24, 0, -16));
  const post = new THREE.Mesh(
    new THREE.BoxGeometry(0.25, 2.4, 0.25),
    new THREE.MeshLambertMaterial({ color: 0x5a4a30 })
  );
  post.position.copy(boardPos).setY(1.2);
  scene.add(post);
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#d8cfae'; g.fillRect(0, 0, 128, 64);
  g.fillStyle = '#3a2a10'; g.font = 'bold 18px Arial'; g.textAlign = 'center';
  g.fillText('WANTED', 64, 26);
  g.font = 'bold 12px Arial';
  g.fillText('dead, mostly', 64, 46);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  sign.position.copy(boardPos).setY(2.1);
  scene.add(sign);

  world.bounty = { boardPos, active: false, crew: [], mark: null, cooldownT: 0 };
}

export function updateBounty(world, dt, pressed) {
  const b = world.bounty;
  const player = world.player;
  world.bountyHint = null;
  world.bountyBlip = null;

  if (!b.active) {
    b.cooldownT -= dt;
    const d = Math.hypot(player.pos.x - b.boardPos.x, player.pos.z - b.boardPos.z);
    if (d < 3.4 && !player.inCar && !player.inHeli) {
      if (b.cooldownT > 0) {
        world.bountyHint = `WANTED BOARD — next contract in ${Math.ceil(b.cooldownT)}s`;
        return;
      }
      world.bountyHint = `Press <b>E</b> to take a BOUNTY CONTRACT — $${REWARD}, target has bodyguards`;
      if (pressed['KeyE']) {
        // hideout on a random block corner, far enough to be a trip
        let x = 0, z = 0;
        for (let i = 0; i < 20; i++) {
          x = blockStart((Math.random() * N) | 0) + 6;
          z = blockStart((Math.random() * N) | 0) + 6;
          if (Math.hypot(x - player.pos.x, z - player.pos.z) > 150) break;
        }
        b.mark = makeGuy(world, x, z, true);
        b.crew = [b.mark, makeGuy(world, x + 3, z + 1, false), makeGuy(world, x - 2, z + 3, false)];
        b.active = true;
        sfxMissionPass();
        showMissionMsg('BOUNTY TAKEN', 'The gold one. The other two are just in the way.', '#d0a020');
        showNews('a very specific name gets pinned to the wanted board');
      }
    }
    return;
  }

  world.bountyBlip = { x: b.mark.pos.x, z: b.mark.pos.z };
  const alive = b.crew.filter((f) => !f.dead);
  world.bountyHint = `BOUNTY — the <b>gold</b> target · guards left: ${alive.length - (b.mark.dead ? 0 : 1)}`;

  // guards close ranks on you; the mark tries to keep them between you
  const focus = player.inCar ? player.inCar.pos : player.pos;
  for (const f of alive) {
    const dx = focus.x - f.pos.x;
    const dz = focus.z - f.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    if (d > 45) continue;
    const dir = f === b.mark ? -1 : 1; // mark backs away, guards advance
    if (d > 2 || dir < 0) {
      f.pos.x += (dx / d) * 3.4 * dir * dt;
      f.pos.z += (dz / d) * 3.4 * dir * dt;
      f.mesh.rotation.y = Math.atan2(dx, dz);
    }
    if (f !== b.mark && d <= 1.9 && Math.random() < dt * 1.2 && !player.inCar) {
      player.health -= 5;
    }
  }

  if (b.mark.dead) {
    b.active = false;
    b.cooldownT = 45;
    clearCrew(world);
    world.money += REWARD;
    addRep(world, 200);
    addChaos(world, 20);
    if (world.stats) world.stats.bounties = (world.stats.bounties || 0) + 1;
    sfxMissionPass();
    showMissionMsg('BOUNTY COLLECTED', `+$${REWARD} — no questions asked`, '#d0a020');
    showNews('a name quietly comes off the wanted board');
    world.onSave?.();
  }
}
