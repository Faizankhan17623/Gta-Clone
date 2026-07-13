import * as THREE from 'three';
import { showToast, showNews, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxMissionFail, sfxPickup } from './sound.js';
import { addRep, addChaos } from './economy.js';
import { addCrime } from './police.js';
import { addSparks, addFlash, addSmoke } from './effects.js';

// The Inside Job: rob the Lucky 7 itself. Night work only — case the floor,
// blind the cameras, crack the counting-room vault under blackout, then lose
// a city's worth of heat with the take on your back. Once per day, because
// even this town has limits.

const PAYOUT = 15000;
const SCOPE_TIME = 3;
const CRACK_TIME = 4;

function makeCamera(world, x, z, ry) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 3.4, 6),
    new THREE.MeshLambertMaterial({ color: 0x2c3038 })
  );
  pole.position.y = 1.7;
  g.add(pole);
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.3, 0.7),
    new THREE.MeshStandardMaterial({ color: 0x14181f, metalness: 0.6, roughness: 0.4 })
  );
  box.position.y = 3.3;
  g.add(box);
  const eye = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xff3030 })
  );
  eye.position.set(0, 3.3, 0.4);
  g.add(eye);
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  world.scene.add(g);
  const cam = { mesh: g, pos: g.position, eye, dead: false };
  cam.target = {
    pos: cam.pos, aimY: 3.3, r: 0.8, webbable: true,
    get dead() { return cam.dead; },
    hit() {
      if (cam.dead) return;
      cam.dead = true;
      cam.eye.material.color.set(0x333333);
      addSparks(cam.pos.clone().setY(3.3), 8);
      addSmoke(cam.pos.clone().setY(3.4), 0.5);
    },
    web() { cam.target.hit(); }, // webbed lens = blind lens
  };
  world.targets.push(cam.target);
  return cam;
}

export function initCasinoHeist(scene, world, save) {
  // the Lucky 7 kiosk sits at spawn + (-16, 12); the vault hatch is out back,
  // far enough from the card table that E means "crime", not "blackjack"
  const casinoPos = world.city.spawn.clone().add(new THREE.Vector3(-16, 0, 12));
  const vaultPos = casinoPos.clone().add(new THREE.Vector3(-7, 0, 5));
  const hatch = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.3, 1.8),
    new THREE.MeshStandardMaterial({ color: 0x3a3222, metalness: 0.75, roughness: 0.35 })
  );
  hatch.position.copy(vaultPos).setY(0.15);
  scene.add(hatch);

  world.cheist = {
    casinoPos, vaultPos, hatch,
    stage: 0, // 0 idle · 1 cameras · 2 vault · 3 escape
    cams: [],
    scopeT: 0,
    crackT: 0,
    doneDay: save?.cheistDay ?? -1,
  };
}

function clearCams(world) {
  const h = world.cheist;
  for (const c of h.cams) {
    world.scene.remove(c.mesh);
    const ti = world.targets.indexOf(c.target);
    if (ti >= 0) world.targets.splice(ti, 1);
  }
  h.cams = [];
}

// wasted/busted mid-job: the take goes back, the plan burns
export function endCasinoHeist(world) {
  const h = world.cheist;
  if (!h || h.stage === 0) return;
  clearCams(world);
  h.stage = 0;
  h.scopeT = 0;
  h.crackT = 0;
  showNews('the Lucky 7 quietly repairs three cameras and asks no questions');
}

export function updateCasinoHeist(world, dt, keys) {
  const h = world.cheist;
  if (!h) return;
  const player = world.player;
  world.cheistHint = null;
  const night = world.clock >= 22 || world.clock < 4;
  const onFoot = !player.inCar && !player.inHeli && !player.inBoat && player.pos.y < 3;

  if (h.stage === 0) {
    if (!night || h.doneDay === world.dailyDay) return;
    // casing happens at the back-alley hatch — the card table stays a card table
    const d = Math.hypot(player.pos.x - h.vaultPos.x, player.pos.z - h.vaultPos.z);
    if (d > 3.4 || !onFoot) { h.scopeT = 0; return; }
    if (keys['KeyE']) {
      h.scopeT += dt;
      world.cheistHint = `CASING THE LUCKY 7... ${Math.ceil((SCOPE_TIME - h.scopeT) * 10) / 10}s — look casual`;
      if (h.scopeT >= SCOPE_TIME) {
        h.scopeT = 0;
        h.stage = 1;
        const c = h.casinoPos;
        h.cams = [
          makeCamera(world, c.x + 4, c.z - 3, Math.PI),
          makeCamera(world, c.x - 4, c.z - 3, Math.PI),
          makeCamera(world, c.x, c.z + 5, 0),
        ];
        sfxMissionFail();
        showMissionMsg('THE INSIDE JOB', 'Three cameras watch the floor. Blind them — webs, bullets, your call.', '#ffd24a');
        showNews('a Lucky 7 pit boss reports a customer "measuring things with his eyes"');
      }
    } else {
      h.scopeT = Math.max(0, h.scopeT - dt * 2);
      world.cheistHint = 'Hold <b>E</b> at the back-alley hatch to case the LUCKY 7 — the INSIDE JOB (night work)';
    }
    return;
  }

  if (h.stage === 1) {
    const left = h.cams.filter((c) => !c.dead).length;
    world.cheistHint = `INSIDE JOB — blind the cameras: <b>${left}</b> left`;
    if (left === 0) {
      h.stage = 2;
      sfxPickup();
      showMissionMsg('FLOOR IS BLIND', 'The counting-room hatch is behind the kiosk. Crack it fast.', '#ffd24a');
    }
    return;
  }

  if (h.stage === 2) {
    const d = Math.hypot(player.pos.x - h.vaultPos.x, player.pos.z - h.vaultPos.z);
    if (d < 2.6 && onFoot && keys['KeyE']) {
      if (h.crackT === 0) addCrime(world, 3); // the drill is not subtle
      h.crackT += dt;
      h.hatch.rotation.y += dt * 4;
      addSparks(h.vaultPos.clone().setY(0.4), 2);
      world.cheistHint = `DRILLING THE VAULT... ${Math.ceil((CRACK_TIME - h.crackT) * 10) / 10}s`;
      if (h.crackT >= CRACK_TIME) {
        h.stage = 3;
        clearCams(world);
        world.wanted = Math.max(world.wanted, 4);
        world.wantedTimer = 0;
        addChaos(world, 40);
        sfxMissionPass();
        addFlash(h.vaultPos.clone().setY(1), 0xffd24a, 1.2);
        showMissionMsg('VAULT CRACKED', 'The bag is heavy and the city heard the alarm. LOSE THE HEAT.', '#ff8a4a');
        showNews('alarms at the Lucky 7 — police converge on the strip');
      }
    } else {
      h.crackT = Math.max(0, h.crackT - dt * 1.5);
      world.cheistHint = d < 2.6
        ? 'Hold <b>E</b> to drill the counting-room hatch'
        : 'INSIDE JOB — the <b>hatch behind the kiosk</b>. Drill it.';
    }
    return;
  }

  // stage 3: carry the bag until the sirens give up
  world.cheistHint = `INSIDE JOB — <b>lose the heat</b> to keep the bag (${'★'.repeat(world.wanted) || 'clear!'})`;
  if (world.wanted === 0) {
    h.stage = 0;
    h.doneDay = world.dailyDay;
    const pay = Math.round(PAYOUT * (world.payMult || 1));
    world.money += pay;
    addRep(world, 800);
    if (world.stats) world.stats.casinoHeists = (world.stats.casinoHeists || 0) + 1;
    sfxMissionPass();
    showMissionMsg('THE INSIDE JOB — CLEAN', `+$${pay}. The Lucky 7 will never prove a thing.`, '#ffd24a');
    showNews('the Lucky 7 declares "an accounting irregularity" and comps everyone a drink');
    world.onSave?.();
  }
}
