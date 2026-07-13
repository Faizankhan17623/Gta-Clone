import * as THREE from 'three';
import { blockStart, pointBlocked } from './city.js';
import { createCharacter, animateWalk } from './characters.js';
import { showToast, showNews, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxMissionFail, sfxPickup } from './sound.js';
import { addRep, addChaos } from './economy.js';
import { addFlash } from './effects.js';

// The NEON PALACE: the loudest building in the city is for sale. Buy it,
// collect the till every midnight, own the dance floor (a WASD memory riff —
// flub it and the crowd remembers that too), and when drunks swing on your
// bouncer, that's your problem now. Ownership is a lifestyle.

const CLUB_COST = 12000;
const NIGHT_INCOME = 300;
const DANCE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
const KEY_LABEL = { KeyW: 'W', KeyA: 'A', KeyS: 'S', KeyD: 'D' };
const DANCE_PAY = 250;
const BRAWL_PAY = 350;

export function initNightclub(scene, world, save) {
  let cx = blockStart(8) + 30;
  let cz = blockStart(6) + 6;
  const probe = new THREE.Vector3(cx, 1, cz);
  for (const [bi, bj, ox, oz] of [[8, 6, 30, 6], [1, 3, 30, 6], [6, 1, 6, 30]]) {
    probe.set(blockStart(bi) + ox, 1, blockStart(bj) + oz);
    if (!pointBlocked(probe, world.city.colliders, 4)) { cx = probe.x; cz = probe.z; break; }
  }

  // the box that goes untz untz
  const hall = new THREE.Mesh(
    new THREE.BoxGeometry(9, 5, 7),
    new THREE.MeshLambertMaterial({ color: 0x14101c })
  );
  hall.position.set(cx, 2.5, cz - 6);
  hall.castShadow = true;
  scene.add(hall);
  const trim = new THREE.Mesh(
    new THREE.BoxGeometry(9.15, 0.3, 7.15),
    new THREE.MeshBasicMaterial({ color: 0xff2a8a })
  );
  trim.position.set(cx, 4.4, cz - 6);
  scene.add(trim);
  const c = document.createElement('canvas');
  c.width = 192; c.height = 56;
  const g = c.getContext('2d');
  g.fillStyle = '#0a0612'; g.fillRect(0, 0, 192, 56);
  g.fillStyle = '#ff2a8a'; g.font = 'bold 26px Arial'; g.textAlign = 'center';
  g.fillText('NEON PALACE', 96, 36);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.75), new THREE.MeshBasicMaterial({ map: tex }));
  sign.position.set(cx, 5.6, cz - 2.4);
  scene.add(sign);
  const glow = new THREE.PointLight(0xff2a8a, 10, 20);
  glow.position.set(cx, 5, cz - 2);
  scene.add(glow);

  // dance pad out front
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 0.25, 18),
    new THREE.MeshBasicMaterial({ color: 0xc95aff, transparent: true, opacity: 0.4 })
  );
  const padPos = new THREE.Vector3(cx + 3, 0, cz);
  pad.position.copy(padPos).setY(0.15);
  scene.add(pad);

  world.club = {
    doorPos: new THREE.Vector3(cx, 0, cz - 2),
    padPos, glow,
    owned: !!save?.club,
    prevClock: world.clock,
    dance: null, // { seq, idx, t }
    danceCd: 0,
    brawlT: 240 + Math.random() * 200,
    brawlers: [],
  };
}

function makeBrawler(world, x, z) {
  const ch = createCharacter({ shirt: '#4a2a4a', pants: '#221a2a', skin: '#c98e63' });
  world.scene.add(ch.group);
  ch.group.position.set(x, 0, z);
  const foe = { ch, mesh: ch.group, pos: ch.group.position, animT: Math.random() * 5, hp: 40, dead: false };
  foe.target = {
    pos: foe.pos, aimY: 1.0, r: 0.95, webbable: true,
    get dead() { return foe.dead; },
    hit() {
      foe.hp -= 34;
      if (foe.hp <= 0 && !foe.dead) {
        foe.dead = true;
        foe.mesh.rotation.z = Math.PI / 2;
        foe.mesh.position.y = 0.25;
      }
    },
    web() { foe.webT = 5; },
  };
  world.targets.push(foe.target);
  return foe;
}

function clearBrawlers(world) {
  const cl = world.club;
  for (const f of cl.brawlers) {
    world.scene.remove(f.mesh);
    const ti = world.targets.indexOf(f.target);
    if (ti >= 0) world.targets.splice(ti, 1);
  }
  cl.brawlers = [];
}

const _cv = new THREE.Vector3();

export function updateNightclub(world, dt, pressed) {
  const cl = world.club;
  if (!cl) return;
  const player = world.player;
  world.clubHint = null;
  cl.danceCd = Math.max(0, cl.danceCd - dt);
  cl.glow.intensity = 8 + Math.sin(world.time * 3) * 4;

  // the till pays at midnight
  if (cl.owned && world.clock < cl.prevClock) {
    const cut = Math.round(NIGHT_INCOME * (world.payMult || 1));
    world.money += cut;
    showToast(`NEON PALACE till +$${cut}`);
    world.onSave?.();
  }
  cl.prevClock = world.clock;

  const dDoor = Math.hypot(player.pos.x - cl.doorPos.x, player.pos.z - cl.doorPos.z);
  const onFoot = !player.inCar && !player.inHeli && !player.inBoat;

  // ---- buying the place ----
  if (!cl.owned) {
    if (dDoor < 4 && onFoot) {
      world.clubHint = `Press <b>E</b> to BUY the NEON PALACE — $${CLUB_COST}, $${NIGHT_INCOME}/night, occasional fistfights`;
      if (pressed['KeyE']) {
        if (world.money < CLUB_COST) { showToast('Not enough cash — the bass drops for no one poor'); return; }
        world.money -= CLUB_COST;
        cl.owned = true;
        if (world.stats) world.stats.club = 1;
        sfxMissionPass();
        showMissionMsg('NEON PALACE — YOURS', 'The DJ nods at you differently now.', '#ff2a8a');
        showNews('the Neon Palace changes hands; the speakers do not notice');
        world.onSave?.();
      }
    }
    return;
  }

  // ---- bouncer duty ----
  if (cl.brawlers.length) {
    const alive = cl.brawlers.filter((f) => !f.dead);
    world.clubHint = `🥊 BOUNCER DUTY — drunks at the door: <b>${alive.length}</b>`;
    for (const f of alive) {
      if (f.webT > 0) { f.webT -= dt; continue; }
      _cv.set(player.pos.x - f.pos.x, 0, player.pos.z - f.pos.z);
      const d = _cv.length() || 1;
      if (d < 40 && d > 1.8) {
        _cv.multiplyScalar(1 / d);
        f.pos.addScaledVector(_cv, 3 * dt);
        f.mesh.rotation.y = Math.atan2(_cv.x, _cv.z);
        f.animT += dt * 6;
        animateWalk(f.ch, f.animT, 0.6);
      } else if (d <= 1.8 && !player.inCar && Math.random() < dt && !(player.dodgeT > 0)) {
        player.health -= 4;
      }
    }
    if (!alive.length) {
      clearBrawlers(world);
      const pay = Math.round(BRAWL_PAY * (world.payMult || 1));
      world.money += pay;
      addRep(world, 80);
      sfxMissionPass();
      showToast(`DOOR CLEARED +$${pay} — the DJ never stopped`);
      world.onSave?.();
    }
    return;
  }
  cl.brawlT -= dt;
  if (cl.brawlT <= 0 && dDoor < 120) {
    cl.brawlT = 260 + Math.random() * 240;
    cl.brawlers = [makeBrawler(world, cl.doorPos.x - 2, cl.doorPos.z + 2), makeBrawler(world, cl.doorPos.x + 2, cl.doorPos.z + 3)];
    sfxMissionFail();
    showMissionMsg('TROUBLE AT THE DOOR', 'Two gentlemen dispute the dress code. Enforce it.', '#ff2a8a');
    showNews('a scuffle outside the Neon Palace; the queue takes notes');
    return;
  }

  // ---- the dance floor ----
  const dPad = Math.hypot(player.pos.x - cl.padPos.x, player.pos.z - cl.padPos.z);
  if (cl.dance) {
    const dn = cl.dance;
    dn.t -= dt;
    const shown = dn.seq.map((k, i) => i < dn.idx ? `<span style="color:#5fe07a">${KEY_LABEL[k]}</span>` : `<b>${KEY_LABEL[k]}</b>`).join(' ');
    world.clubHint = `💃 DANCE: ${shown} · ${Math.max(0, dn.t).toFixed(1)}s`;
    for (const k of DANCE_KEYS) {
      if (!pressed[k]) continue;
      if (k === dn.seq[dn.idx]) {
        dn.idx++;
        world.style = (world.style || 0) + 6;
        addFlash(player.pos.clone().setY(1.2), 0xff2a8a, 0.3);
        if (dn.idx >= dn.seq.length) {
          cl.dance = null;
          cl.danceCd = 20;
          const pay = Math.round(DANCE_PAY * (world.payMult || 1));
          world.money += pay;
          if (world.stats) world.stats.dances = (world.stats.dances || 0) + 1;
          sfxMissionPass();
          showToast(`💃 FULL COMBO +$${pay} in tips`);
        } else {
          sfxPickup();
        }
      } else {
        cl.dance = null;
        cl.danceCd = 8;
        sfxMissionFail();
        showToast('...the crowd winces. Come back when the shame fades.');
      }
      break;
    }
    if (cl.dance && (dn.t <= 0 || dPad > 4)) {
      cl.dance = null;
      cl.danceCd = 8;
      showToast('DANCE OVER — the beat waits for no one');
    }
    return;
  }
  if (dPad < 3 && onFoot) {
    if (cl.danceCd > 0) {
      world.clubHint = `DANCE FLOOR — catch your breath (${Math.ceil(cl.danceCd)}s)`;
    } else {
      world.clubHint = 'Press <b>E</b> to DANCE — follow the keys, earn the tips';
      if (pressed['KeyE']) {
        const seq = [];
        for (let i = 0; i < 5; i++) seq.push(DANCE_KEYS[(Math.random() * DANCE_KEYS.length) | 0]);
        cl.dance = { seq, idx: 0, t: 7 };
        addChaos(world, 2);
      }
    }
  }
}
