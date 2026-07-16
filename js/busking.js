import * as THREE from 'three';
import { blockStart, BLOCK, pointBlocked } from './city.js';
import { createCharacter, animateIdle } from './characters.js';
import { showToast, showNews, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxMissionFail, sfxPickup } from './sound.js';
import { addRep } from './economy.js';
import { addFlash } from './effects.js';

// STREET PERFORMANCE: four corner pitches around town with a chalk circle.
// Stand in one and follow the WASD combo — clean runs build FAME (persists,
// never resets), fame raises the tip ceiling and pulls a bigger crowd for
// the next set. Flub the combo and the pitch is dead for a while.

const KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
const LABEL = { KeyW: 'W', KeyA: 'A', KeyS: 'S', KeyD: 'D' };
const SPOTS = [
  { bi: 3, bj: 1, ox: 8, oz: 26 },
  { bi: 6, bj: 4, ox: 26, oz: 6 },
  { bi: 1, bj: 6, ox: 6, oz: 26 },
  { bi: 8, bj: 3, ox: 26, oz: 8 },
];

function crowdFigure(scene, x, z) {
  const ch = createCharacter({ shirt: '#5a5a62', pants: '#22262c', skin: '#c98e63' });
  ch.group.position.set(x, 0, z);
  ch.group.scale.setScalar(0.94);
  scene.add(ch.group);
  return ch;
}

export function initBusking(scene, world, save) {
  const spots = SPOTS.map((s) => {
    let x = blockStart(s.bi) + s.ox;
    let z = blockStart(s.bj) + s.oz;
    const probe = new THREE.Vector3(x, 1, z);
    if (pointBlocked(probe, world.city.colliders, 2)) { x = blockStart(s.bi) + BLOCK - s.ox; z = blockStart(s.bj) + BLOCK - s.oz; }
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2, 2.3, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd24a, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.05, z);
    scene.add(ring);
    const hat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.28, 0.15, 12),
      new THREE.MeshStandardMaterial({ color: 0x2a2018 })
    );
    hat.position.set(x, 0.1, z + 1.3);
    scene.add(hat);
    return { pos: new THREE.Vector3(x, 0, z), ring, crowd: [] };
  });

  world.busking = { spots, fame: save?.fame | 0, act: null, cd: 0 };
}

function spawnCrowd(world, spot) {
  const n = Math.min(6, 1 + Math.floor(world.busking.fame / 400));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const ch = crowdFigure(world.scene, spot.pos.x + Math.sin(a) * 3.4, spot.pos.z + Math.cos(a) * 3.4 - 1);
    ch.group.lookAt(spot.pos.x, 0, spot.pos.z);
    spot.crowd.push(ch);
  }
}

function clearCrowd(world, spot) {
  for (const ch of spot.crowd) world.scene.remove(ch.group);
  spot.crowd = [];
}

// wasted/busted mid-set: the crowd scatters, no payout, same cooldown as a flub
export function abortBusking(world) {
  const bk = world.busking;
  if (!bk?.act) return;
  clearCrowd(world, bk.spots[bk.act.idx]);
  bk.act = null;
  bk.cd = 10;
}

export function updateBusking(world, dt, pressed) {
  const bk = world.busking;
  if (!bk) return;
  const player = world.player;
  world.buskHint = null;
  bk.cd = Math.max(0, bk.cd - dt);

  for (const spot of bk.spots) {
    spot.ring.rotation.z += dt * 0.3;
    for (const ch of spot.crowd) animateIdle(ch);
  }

  if (bk.act) {
    const spot = bk.spots[bk.act.idx];
    const dn = bk.act;
    dn.t -= dt;
    const shown = dn.seq.map((k, i) => i < dn.idx2 ? `<span style="color:#5fe07a">${LABEL[k]}</span>` : `<b>${LABEL[k]}</b>`).join(' ');
    world.buskHint = `🎭 PERFORM: ${shown} · ${Math.max(0, dn.t).toFixed(1)}s · fame ${bk.fame}`;
    for (const k of KEYS) {
      if (!pressed[k]) continue;
      if (k === dn.seq[dn.idx2]) {
        dn.idx2++;
        addFlash(player.pos.clone().setY(1.2), 0xffd24a, 0.25);
        if (dn.idx2 >= dn.seq.length) {
          const base = 120;
          const fameBonus = Math.min(400, bk.fame * 0.5);
          const pay = Math.round((base + fameBonus) * (world.payMult || 1));
          world.money += pay;
          bk.fame += 25;
          addRep(world, 15);
          clearCrowd(world, spot);
          bk.act = null;
          bk.cd = 15;
          if (world.stats) world.stats.busks = (world.stats.busks || 0) + 1;
          sfxMissionPass();
          showToast(`FULL SET! +$${pay} in the hat — fame ${bk.fame}`);
          world.onSave?.();
        } else {
          sfxPickup();
        }
      } else {
        clearCrowd(world, spot);
        bk.act = null;
        bk.cd = 10;
        sfxMissionFail();
        showToast('...crowd drifts off. The hat stays empty.');
      }
      break;
    }
    if (bk.act && dn.t <= 0) {
      clearCrowd(world, spot);
      bk.act = null;
      bk.cd = 10;
      showToast('Set ends — nobody was really watching');
    }
    return;
  }

  const onFoot = !player.inCar && !player.inHeli && !player.inBoat;
  if (!onFoot) return;
  for (let i = 0; i < bk.spots.length; i++) {
    const spot = bk.spots[i];
    const d = Math.hypot(player.pos.x - spot.pos.x, player.pos.z - spot.pos.z);
    if (d < 2.6) {
      if (bk.cd > 0) { world.buskHint = `PITCH — catch your breath (${Math.ceil(bk.cd)}s)`; return; }
      world.buskHint = 'Press <b>E</b> to PERFORM — follow the combo, build fame';
      if (pressed['KeyE']) {
        const len = 4 + Math.min(3, Math.floor(bk.fame / 300));
        const seq = [];
        for (let s = 0; s < len; s++) seq.push(KEYS[(Math.random() * KEYS.length) | 0]);
        bk.act = { idx: i, idx2: 0, seq, t: 6 + len };
        spawnCrowd(world, spot);
        showMissionMsg('STREET SET', 'Follow the combo before the crowd loses interest', '#ffd24a');
      }
      return;
    }
  }
}
