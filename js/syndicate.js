import * as THREE from 'three';
import { roadCenter, HALF, N, pointBlocked, resolveCircle } from './city.js';
import { createCharacter, animateWalk } from './characters.js';
import { makeVehicle } from './car.js';
import { showToast, showNews, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxMissionFail, sfxShot } from './sound.js';
import { addRep, addChaos } from './economy.js';
import { addTracer, addFlash, addExplosion, addSparks } from './effects.js';

// THE SYNDICATE: a five-chapter war against MIDAS — the man whose name is on
// the deed of everything you've ever robbed. It starts with a burner phone
// ringing in the plaza and ends in gold. Progress survives death, saves and
// pride; each chapter can be retried until it can't stand you anymore.

const CHAPTERS = [
  'THE COURIER', 'THE WITNESS', 'THE WAREHOUSE', 'THE CONVOY', 'MIDAS',
];
const FINAL_REWARD = 25000;
const CHAPTER_REWARD = 3000;

function makeThug(world, x, z, opts = {}) {
  const ch = createCharacter({
    shirt: opts.gold ? '#d0a020' : '#1c2026',
    pants: '#101318',
    skin: '#b98a6a',
    hair: opts.gold ? '#e8d8a0' : '#0a0a0a',
  });
  if (opts.gold) ch.group.scale.setScalar(1.2);
  world.scene.add(ch.group);
  ch.group.position.set(x, 0, z);
  const foe = {
    ch, mesh: ch.group, pos: ch.group.position,
    animT: Math.random() * 5, hp: opts.hp ?? 55, maxHp: opts.hp ?? 55,
    dead: false, shootT: 1 + Math.random() * 2, gold: !!opts.gold,
  };
  foe.target = {
    pos: foe.pos, aimY: 1.05, r: 1, webbable: true,
    get dead() { return foe.dead; },
    hit() {
      foe.hp -= 30;
      addSparks(foe.pos.clone().setY(1.3), 4);
      if (foe.hp <= 0 && !foe.dead) {
        foe.dead = true;
        foe.mesh.rotation.z = Math.PI / 2;
        foe.mesh.position.y = 0.25;
      }
    },
    web() { foe.webT = opts.gold ? 2 : 5; },
  };
  world.targets.push(foe.target);
  return foe;
}

function clearActors(world) {
  const st = world.synd;
  for (const f of st.actors) {
    world.scene.remove(f.mesh);
    if (f.target) {
      const ti = world.targets.indexOf(f.target);
      if (ti >= 0) world.targets.splice(ti, 1);
    }
  }
  st.actors = [];
  for (const v of st.cars) {
    if (!v.keep) world.scene.remove(v.mesh);
  }
  st.cars = [];
}

export function initSyndicate(scene, world, save) {
  // the burner phone: a dead payphone in the plaza that only rings for you
  let px = world.city.spawn.x - 8;
  let pz = world.city.spawn.z - 14;
  const probe = new THREE.Vector3(px, 1, pz);
  if (pointBlocked(probe, world.city.colliders, 1.2)) { px = world.city.spawn.x + 10; pz = world.city.spawn.z - 14; }
  const booth = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 2.4, 1.1),
    new THREE.MeshLambertMaterial({ color: 0x14324a })
  );
  booth.position.set(px, 1.2, pz);
  scene.add(booth);
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffd24a })
  );
  lamp.position.set(px, 2.6, pz);
  scene.add(lamp);

  world.synd = {
    boothPos: new THREE.Vector3(px, 0, pz),
    lamp,
    chapter: Math.min(5, save?.synd | 0), // chapters completed
    active: false,
    stage: null,
    actors: [],
    cars: [],
    t: 0,
    tailT: 0,
    loseT: 0,
  };
}

// wasted/busted mid-chapter: the syndicate resets the board, not the war
export function endSyndicate(world) {
  const st = world.synd;
  if (!st?.active) return;
  clearActors(world);
  st.active = false;
  showNews('the syndicate sweeps a scene clean before the sirens arrive');
}

function startChapter(world) {
  const st = world.synd;
  const player = world.player;
  st.active = true;
  st.t = 0;
  st.tailT = 0;
  st.loseT = 0;
  const ch = st.chapter;

  if (ch === 0) {
    // THE COURIER: a gold-striped sedan runs a loop — stay within 60m for 60s
    const road = roadCenter(3);
    const car = makeVehicle(world.scene, road + 4, player.pos.z + 40, 0, '#14181d');
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(2.06, 0.12, 4.4),
      new THREE.MeshBasicMaterial({ color: 0xd0a020 })
    );
    stripe.position.y = 1.15;
    car.mesh.add(stripe);
    car.dirZ = 1;
    car.road = road;
    st.cars.push(car);
    showMissionMsg('CH.1 — THE COURIER', 'Tail the gold-striped sedan. Stay within 60m. Don\'t spook him: 60 seconds.', '#d0a020');
    showNews('a sedan with gold coachlines takes the same loop every night; nobody asks why');
  } else if (ch === 1) {
    // THE WITNESS: keep her alive for 75s through three waves
    const ch2 = createCharacter({ shirt: '#c9c9d2', pants: '#43302a', skin: '#e6b88f' });
    world.scene.add(ch2.group);
    const wpos = st.boothPos.clone().add(new THREE.Vector3(6, 0, 6));
    ch2.group.position.copy(wpos);
    const witness = { ch: ch2, mesh: ch2.group, pos: ch2.group.position, hp: 100, dead: false, witness: true };
    st.actors.push(witness);
    st.witness = witness;
    st.wave = 0;
    st.t = 75;
    showMissionMsg('CH.2 — THE WITNESS', 'She saw MIDAS\'s face. Keep her breathing for 75 seconds.', '#d0a020');
    showNews('an accountant is "helping police with enquiries"; the syndicate sends flowers early');
  } else if (ch === 2) {
    // THE WAREHOUSE: four guards around a ledger crate, far corner block
    const wx = roadCenter(1) + 10;
    const wz = roadCenter(N - 1) - 10;
    st.crate = new THREE.Vector3(wx, 0, wz);
    for (let i = 0; i < 4; i++) {
      st.actors.push(makeThug(world, wx + Math.sin(i * 1.6) * 6, wz + Math.cos(i * 1.6) * 6));
    }
    st.holdT = 0;
    showMissionMsg('CH.3 — THE WAREHOUSE', 'His ledger is in the north-west yard. Four names guard it. Un-name them.', '#d0a020');
  } else if (ch === 3) {
    // THE CONVOY: armored truck + two escorts rolling south on the east road
    const road = roadCenter(N - 2);
    for (let i = 0; i < 3; i++) {
      const truck = i === 1;
      const v = makeVehicle(world.scene, road + 4, player.pos.z - 80 - i * 14, 0,
        truck ? '#3a3222' : '#14181d', truck ? { health: 260 } : { health: 110 });
      v.dirZ = 1;
      v.road = road;
      v.convoy = true;
      st.cars.push(v);
    }
    showMissionMsg('CH.4 — THE CONVOY', 'His gold moves tonight: two escorts and a strongbox truck. Break all three.', '#d0a020');
    showNews('an unusually confident convoy rolls the east road, lights off');
  } else {
    // MIDAS: the man himself + 3 elites, at the booth plaza, always at night
    const mx = st.boothPos.x + 14;
    const mz = st.boothPos.z + 10;
    st.midas = makeThug(world, mx, mz, { gold: true, hp: 380 });
    st.actors.push(st.midas);
    for (let i = 0; i < 3; i++) {
      st.actors.push(makeThug(world, mx + Math.sin(i * 2.1) * 4, mz + Math.cos(i * 2.1) * 4, { hp: 70 }));
    }
    world.slowmoT = Math.max(world.slowmoT || 0, 1.2);
    showMissionMsg('CH.5 — MIDAS', '"You cost me a ledger, a convoy and a witness. Let me repay you." — end him.', '#ffd24a');
    showNews('every camera downtown fails at once; a gold suit steps out of a car that costs more than the block');
  }
  sfxMissionFail();
}

function chapterDone(world) {
  const st = world.synd;
  clearActors(world);
  st.active = false;
  st.chapter++;
  const final = st.chapter >= 5;
  const pay = Math.round((final ? FINAL_REWARD : CHAPTER_REWARD) * (world.payMult || 1));
  world.money += pay;
  addRep(world, final ? 1500 : 300);
  addChaos(world, 20);
  if (world.stats) world.stats.syndicate = st.chapter;
  sfxMissionPass();
  if (final) {
    showMissionMsg('THE SYNDICATE FALLS', `+$${pay} — MIDAS is done. The city's rot has a vacancy at the top.`, '#ffd24a');
    showNews('MIDAS\'s empire liquidates overnight; a web-shaped shadow appears in the auditor\'s report');
  } else {
    showMissionMsg(`CHAPTER ${st.chapter} COMPLETE`, `+$${pay} — the phone will ring again.`, '#d0a020');
  }
  world.onSave?.();
}

const _sy = new THREE.Vector3();

function driveLoop(v, dt) {
  v.pos.z += v.dirZ * 13 * dt;
  if (Math.abs(v.pos.z) > HALF - 24) v.dirZ *= -1;
  v.heading = v.dirZ > 0 ? 0 : Math.PI;
  v.mesh.rotation.y = v.heading;
  for (const w of v.wheels) w.rotation.x += dt * 25;
}

export function updateSyndicate(world, dt, keys, pressed) {
  const st = world.synd;
  if (!st) return;
  const player = world.player;
  world.syndHint = null;
  world.syndBlip = null;
  st.lamp.visible = st.chapter < 5 && Math.floor(world.time * 2) % 2 === 0; // the phone blinks until the war ends

  if (!st.active) {
    if (st.chapter >= 5) return; // war's over
    const d = Math.hypot(player.pos.x - st.boothPos.x, player.pos.z - st.boothPos.z);
    if (d < 3.4 && !player.inCar && !player.inHeli) {
      world.syndHint = `Press <b>E</b> to answer the BURNER PHONE — THE SYNDICATE, chapter ${st.chapter + 1}/5: ${CHAPTERS[st.chapter]}`;
      if (pressed['KeyE']) startChapter(world);
    }
    return;
  }

  const focus = player.inCar ? player.inCar.pos : player.pos;

  // ---- CH1: the tail ----
  if (st.chapter === 0) {
    const car = st.cars[0];
    driveLoop(car, dt);
    world.syndBlip = { x: car.pos.x, z: car.pos.z };
    const d = Math.hypot(car.pos.x - focus.x, car.pos.z - focus.z);
    if (d < 60) {
      st.tailT += dt;
      st.loseT = 0;
    } else {
      st.loseT += dt;
    }
    world.syndHint = `THE COURIER — tail him: <b>${Math.ceil(60 - st.tailT)}s</b>` +
      (d >= 60 ? ` · <span style="color:#ff5a4a">TOO FAR (${Math.ceil(10 - st.loseT)}s)</span>` : '');
    if (d < 7) {
      st.loseT += dt * 2; // breathing on his bumper counts as spooking him
      if (Math.random() < dt) showToast('BACK OFF — he\'s checking his mirrors');
    }
    if (st.loseT > 10) {
      endSyndicate(world);
      sfxMissionFail();
      showMissionMsg('COURIER LOST', 'He made you. The phone will ring again.', '#ff5a4a');
      return;
    }
    if (st.tailT >= 60) chapterDone(world);
    return;
  }

  // ---- CH2: the witness ----
  if (st.chapter === 1) {
    st.t -= dt;
    const w = st.witness;
    world.syndBlip = { x: w.pos.x, z: w.pos.z };
    const thugs = st.actors.filter((a) => !a.witness && !a.dead);
    world.syndHint = `THE WITNESS — protect her: <b>${Math.ceil(Math.max(0, st.t))}s</b> · her nerve: ${Math.max(0, Math.round(w.hp))}%`;
    // waves
    st.wave = st.wave ?? 0;
    if ((st.t < 70 && st.wave === 0) || (st.t < 45 && st.wave === 1) || (st.t < 20 && st.wave === 2)) {
      st.wave++;
      for (let i = 0; i < 2 + st.wave; i++) {
        const a = Math.random() * Math.PI * 2;
        st.actors.push(makeThug(world, w.pos.x + Math.sin(a) * 28, w.pos.z + Math.cos(a) * 28));
      }
      showToast(`WAVE ${st.wave} — here they come`);
    }
    for (const f of thugs) {
      if (f.webT > 0) { f.webT -= dt; continue; }
      _sy.set(w.pos.x - f.pos.x, 0, w.pos.z - f.pos.z);
      const d = _sy.length() || 1;
      if (d > 2) {
        _sy.multiplyScalar(1 / d);
        f.pos.addScaledVector(_sy, 3.6 * dt);
        resolveCircle(f.pos, 0.4, world.city.colliders);
        f.mesh.rotation.y = Math.atan2(_sy.x, _sy.z);
        f.animT += dt * 6;
        animateWalk(f.ch, f.animT, 0.7);
      } else if (Math.random() < dt * 1.5) {
        w.hp -= 8;
        addFlash(w.pos.clone().setY(1.2), 0xff5040, 0.3);
      }
    }
    if (w.hp <= 0) {
      endSyndicate(world);
      sfxMissionFail();
      showMissionMsg('WITNESS DOWN', 'MIDAS sends his regards. Answer the phone and try again.', '#ff5a4a');
      return;
    }
    if (st.t <= 0) {
      showNews('a certain accountant boards a certain train, alive and furious');
      chapterDone(world);
    }
    return;
  }

  // ---- CH3: the warehouse ----
  if (st.chapter === 2) {
    world.syndBlip = { x: st.crate.x, z: st.crate.z };
    const alive = st.actors.filter((a) => !a.dead);
    for (const f of alive) {
      if (f.webT > 0) { f.webT -= dt; continue; }
      const d = Math.hypot(focus.x - f.pos.x, focus.z - f.pos.z);
      if (d < 34) {
        f.mesh.rotation.y = Math.atan2(focus.x - f.pos.x, focus.z - f.pos.z);
        f.shootT -= dt;
        if (f.shootT <= 0 && d < 26 && !player.inCar) {
          f.shootT = 1.6 + Math.random();
          sfxShot('pistol');
          const aim = player.pos.clone().setY(player.pos.y + 1.1);
          addTracer(f.pos.clone().setY(1.4), aim);
          if (Math.random() < 0.35 && !(player.dodgeT > 0)) player.health -= 6;
        }
      }
    }
    if (alive.length) {
      world.syndHint = `THE WAREHOUSE — guards left: <b>${alive.length}</b>`;
      return;
    }
    const d = Math.hypot(player.pos.x - st.crate.x, player.pos.z - st.crate.z);
    world.syndHint = d < 3 ? 'Hold <b>E</b> to take the LEDGER' : 'Yard clear — grab the <b>ledger</b>';
    if (d < 3 && !player.inCar && keys['KeyE']) {
      st.holdT += dt;
      if (st.holdT > 1.6) {
        showNews('a ledger worth more than the building it lived in changes pockets');
        chapterDone(world);
      }
    } else {
      st.holdT = Math.max(0, st.holdT - dt);
    }
    return;
  }

  // ---- CH4: the convoy ----
  if (st.chapter === 3) {
    const alive = st.cars.filter((v) => !v.dead);
    if (!alive.length) { chapterDone(world); return; }
    for (const v of alive) {
      driveLoop(v, dt);
      if (v.health <= 0 && !v.dead) {
        v.dead = true;
        v.vel?.set?.(0, 0, 0);
        addExplosion(v.pos);
        addChaos(world, 10);
      }
    }
    const lead = alive[0];
    world.syndBlip = { x: lead.pos.x, z: lead.pos.z };
    world.syndHint = `THE CONVOY — vehicles left: <b>${alive.length}</b> (RPG, ram spikes, tank... your call)`;
    return;
  }

  // ---- CH5: MIDAS ----
  const alive = st.actors.filter((a) => !a.dead);
  const midas = st.midas;
  world.syndBlip = { x: midas.pos.x, z: midas.pos.z };
  world.syndHint = midas.dead
    ? 'MIDAS is down — mop up the gold detail'
    : `MIDAS — <b>${Math.max(0, Math.round((midas.hp / midas.maxHp) * 100))}%</b> · elites: ${alive.length - (midas.dead ? 0 : 1)}`;
  for (const f of alive) {
    if (f.webT > 0) { f.webT -= dt; continue; }
    _sy.set(focus.x - f.pos.x, 0, focus.z - f.pos.z);
    const d = _sy.length() || 1;
    const spd = f.gold ? 6.5 : 3.8;
    if (d > 2.2) {
      _sy.multiplyScalar(1 / d);
      f.pos.addScaledVector(_sy, spd * dt);
      resolveCircle(f.pos, 0.5, world.city.colliders);
      f.mesh.rotation.y = Math.atan2(_sy.x, _sy.z);
      f.animT += spd * dt * 1.6;
      animateWalk(f.ch, f.animT, 0.85);
    } else if (!player.inCar && Math.random() < dt * (f.gold ? 2.2 : 1.3) && !(player.dodgeT > 0)) {
      player.health -= f.gold ? 11 : 5;
      if (f.gold) world.shake = 0.2;
    }
    f.shootT -= dt;
    if (f.gold && f.shootT <= 0 && d > 6 && d < 40) {
      f.shootT = 1.2;
      sfxShot('pistol');
      const aim = focus.clone().setY(focus.y + 1.1);
      addTracer(f.pos.clone().setY(1.6), aim);
      if (Math.random() < 0.45 && !(player.dodgeT > 0)) {
        if (player.inCar) player.inCar.health -= 6;
        else player.health -= 8;
      }
    }
  }
  if (!alive.length) chapterDone(world);
}
