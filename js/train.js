import * as THREE from 'three';
import { HALF } from './city.js';
import { createCharacter } from './characters.js';
import { showToast, showNews, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxMissionFail, sfxShot } from './sound.js';
import { addRep, addChaos } from './economy.js';
import { addTracer, addFlash, addSparks } from './effects.js';
import { addCrime } from './police.js';

// The Harbor Line: an elevated freight train running the length of the
// seawall on a concrete viaduct. Wall-run or web up, surf the roof, and —
// if you take the contract at the yard sign — rob the armored cargo wagon
// while it's moving. Guards included, free of charge.

const TRACK_X = HALF + 3;          // viaduct centerline, just past the city edge
const DECK_TOP = 7.7;              // walkable deck height
const ROOF_TOP = DECK_TOP + 2.8;   // wagon roof height
const TRACK_END = HALF - 16;       // wrap point
const SPEED = 11;
const WAGON_LEN = 9;
const GAP = 1.2;
const REWARD = 2500;
const HEIST_COOLDOWN = 150;

function makeWagon(scene, kind) {
  const g = new THREE.Group();
  const color = kind === 'loco' ? 0x24404f : kind === 'cargo' ? 0x4f3a1a : 0x3a2430;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(3, 2.8, WAGON_LEN),
    new THREE.MeshStandardMaterial({ color, metalness: 0.45, roughness: 0.55 })
  );
  body.position.y = 1.4;
  body.castShadow = true;
  g.add(body);
  if (kind === 'loco') {
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xfff2c0 })
    );
    lamp.position.set(0, 1.6, WAGON_LEN / 2 + 0.1);
    g.add(lamp);
  }
  if (kind === 'cargo') {
    // gold trim: everyone on the waterfront knows what this wagon carries
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(3.06, 0.4, WAGON_LEN + 0.06),
      new THREE.MeshLambertMaterial({ color: 0xd0a020, emissive: 0x403000 })
    );
    stripe.position.y = 1.4;
    g.add(stripe);
  }
  scene.add(g);
  return g;
}

function makeGuard(world, wagonIdx, off) {
  const ch = createCharacter({ shirt: '#20293d', pants: '#141a28', skin: '#c98e63' });
  world.scene.add(ch.group);
  const guard = { ch, mesh: ch.group, pos: ch.group.position, wagonIdx, off, hp: 60, dead: false, shootT: 1.5 + Math.random() };
  guard.target = {
    pos: guard.pos, aimY: 1.0, r: 0.95, webbable: true,
    get dead() { return guard.dead; },
    hit() {
      guard.hp -= 34;
      if (guard.hp <= 0 && !guard.dead) {
        guard.dead = true;
        guard.mesh.rotation.z = Math.PI / 2;
      }
    },
    web() { guard.webT = 4; },
  };
  world.targets.push(guard.target);
  return guard;
}

export function initTrain(scene, world) {
  // continuous viaduct: base wall, deck, rails — one long solid collider,
  // which also makes it wall-runnable and a web anchor
  const len = TRACK_END * 2;
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, DECK_TOP, len),
    new THREE.MeshLambertMaterial({ color: 0x5a5e66 })
  );
  base.position.set(TRACK_X, DECK_TOP / 2, 0);
  base.receiveShadow = true;
  scene.add(base);
  for (const dx of [-1.1, 1.1]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.18, len),
      new THREE.MeshStandardMaterial({ color: 0x8a8f98, metalness: 0.8, roughness: 0.35 })
    );
    rail.position.set(TRACK_X + dx, DECK_TOP + 0.09, 0);
    scene.add(rail);
  }
  // pylon flare every 48m so it reads as a viaduct, not a wall
  for (let z = -TRACK_END + 24; z < TRACK_END; z += 48) {
    const py = new THREE.Mesh(
      new THREE.BoxGeometry(4.6, 1.2, 2.4),
      new THREE.MeshLambertMaterial({ color: 0x4a4e56 })
    );
    py.position.set(TRACK_X, 0.6, z);
    scene.add(py);
  }
  world.city.colliders.push({ x0: TRACK_X - 1.7, x1: TRACK_X + 1.7, z0: -TRACK_END, z1: TRACK_END, h: DECK_TOP + 0.3 });

  // the train: loco, armored cargo, caboose — colliders ride along each frame
  const kinds = ['loco', 'cargo', 'caboose'];
  const wagons = kinds.map((kind, i) => {
    const mesh = makeWagon(scene, kind);
    const col = { x0: TRACK_X - 1.5, x1: TRACK_X + 1.5, z0: 0, z1: 0, h: ROOF_TOP + 0.3 };
    world.city.colliders.push(col);
    return { kind, mesh, col, off: -i * (WAGON_LEN + GAP) };
  });

  // freight yard sign on the shore — the heist starts here
  const signPos = new THREE.Vector3(HALF - 4, 0, 26);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.6, 0.25), new THREE.MeshLambertMaterial({ color: 0x3a3f48 }));
  post.position.copy(signPos).setY(1.3);
  scene.add(post);
  const c = document.createElement('canvas');
  c.width = 160; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#101820'; g.fillRect(0, 0, 160, 64);
  g.fillStyle = '#d0a020'; g.font = 'bold 20px Arial'; g.textAlign = 'center';
  g.fillText('HARBOR LINE', 80, 27);
  g.font = 'bold 12px Arial'; g.fillStyle = '#8fd0ff';
  g.fillText('freight "insurance" work', 80, 48);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.05), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  sign.position.copy(signPos).setY(2.35);
  sign.rotation.y = -Math.PI / 2;
  scene.add(sign);

  world.train = {
    t: -TRACK_END + 40, wagons, signPos,
    heist: false, guards: [], cracked: false, crackT: 0, cooldownT: 0,
  };
}

function clearGuards(world) {
  const tr = world.train;
  for (const gd of tr.guards) {
    world.scene.remove(gd.mesh);
    const ti = world.targets.indexOf(gd.target);
    if (ti >= 0) world.targets.splice(ti, 1);
  }
  tr.guards = [];
}

export function endTrainHeist(world) {
  const tr = world.train;
  if (!tr?.heist) return;
  clearGuards(world);
  tr.heist = false;
  tr.cooldownT = HEIST_COOLDOWN * 0.5;
}

export function updateTrain(world, dt, keys, pressed) {
  const tr = world.train;
  if (!tr) return;
  const player = world.player;
  world.trainHint = null;
  world.trainBlip = null;

  // roll the line, wrap at the ends
  const dz = SPEED * dt;
  tr.t += dz;
  let wrapped = 0;
  if (tr.t > TRACK_END + WAGON_LEN) {
    wrapped = -(TRACK_END + WAGON_LEN) * 2;
    tr.t += wrapped;
  }

  let riding = false;
  const onTrackX = Math.abs(player.pos.x - TRACK_X) < 1.8;
  for (const w of tr.wagons) {
    const z = tr.t + w.off;
    w.mesh.position.set(TRACK_X, DECK_TOP, z);
    w.col.z0 = z - WAGON_LEN / 2;
    w.col.z1 = z + WAGON_LEN / 2;

    // roof-surfing: the roof is a real collider so you just stand on it —
    // this carries you along and pays style for the ride
    if (!player.inCar && !player.inHeli && !player.inBoat && player.onGround &&
        onTrackX && player.pos.y > ROOF_TOP - 0.8 && player.pos.y < ROOF_TOP + 1 &&
        player.pos.z > w.col.z0 - 0.6 && player.pos.z < w.col.z1 + 0.6) {
      player.pos.z += dz + wrapped;
      riding = true;
      w.hadRider = true;
      world.style = (world.style || 0) + 6 * dt * (world.perks?.style ?? 1);
      if (!tr.surfed) {
        tr.surfed = true;
        showToast('TRAIN SURFING — ride it down the whole waterfront');
        showNews('a figure was seen standing on the harbor freight at full speed');
      }
    }
  }

  // guards ride their wagons and defend the roofline
  const focus = player.inHeli ? player.inHeli.pos : player.pos;
  let guardsAlive = 0;
  for (const gd of tr.guards) {
    const w = tr.wagons[gd.wagonIdx];
    gd.pos.set(TRACK_X + gd.off.x, gd.dead ? ROOF_TOP + 0.25 : ROOF_TOP, tr.t + w.off + gd.off.z);
    if (gd.dead) continue;
    guardsAlive++;
    if (gd.webT > 0) { gd.webT -= dt; continue; }
    const d = gd.pos.distanceTo(focus);
    gd.mesh.rotation.y = Math.atan2(focus.x - gd.pos.x, focus.z - gd.pos.z);
    gd.ch.rArm.rotation.x = -Math.PI / 2;
    gd.shootT -= dt;
    if (gd.shootT <= 0 && d < 34 && (player.pos.y > 5 || player.inHeli)) {
      gd.shootT = 1.4 + Math.random() * 0.7;
      sfxShot('pistol');
      const aim = focus.clone();
      aim.y += 1 + (Math.random() - 0.5) * 0.7;
      addTracer(gd.pos.clone().setY(ROOF_TOP + 1.4), aim);
      addFlash(aim, 0xffd080, 0.2);
      if (Math.random() < 0.4 && !(player.dodgeT > 0)) {
        if (player.inHeli) player.inHeli.health -= 5;
        else player.health -= 6;
      }
    }
  }

  // the freight yard sign: take the contract
  tr.cooldownT = Math.max(0, tr.cooldownT - dt);
  if (!tr.heist) {
    const ds = Math.hypot(player.pos.x - tr.signPos.x, player.pos.z - tr.signPos.z);
    if (ds < 3.6 && !player.inCar && !player.inHeli) {
      if (tr.cooldownT > 0) {
        world.trainHint = `HARBOR LINE — next shipment in ${Math.ceil(tr.cooldownT)}s`;
      } else {
        world.trainHint = `Press <b>E</b> for the TRAIN HEIST — $${REWARD} in the gold wagon, guards on the roof`;
        if (pressed['KeyE']) {
          tr.heist = true;
          tr.cracked = false;
          tr.crackT = 0;
          tr.guards = [
            makeGuard(world, 0, { x: 0, z: -2.5 }),
            makeGuard(world, 1, { x: -0.8, z: 2 }),
            makeGuard(world, 1, { x: 0.8, z: -2 }),
            makeGuard(world, 2, { x: 0, z: 1.5 }),
          ];
          sfxMissionFail();
          showMissionMsg('TRAIN HEIST', 'Board the moving train. Clear the roof. Crack the gold wagon.', '#d0a020');
          showNews('the harbor freight rolls out with unusual security tonight');
        }
      }
    }
    return;
  }

  // heist live: blip tracks the cargo wagon
  const cargo = tr.wagons[1];
  world.trainBlip = { x: TRACK_X, z: tr.t + cargo.off };

  if (guardsAlive > 0) {
    world.trainHint = `TRAIN HEIST — guards left: <b>${guardsAlive}</b> · get on the roof`;
    return;
  }

  // roof clear: stand on the gold wagon and crack it
  const onCargo = riding && player.pos.z > cargo.col.z0 - 0.6 && player.pos.z < cargo.col.z1 + 0.6;
  if (!tr.cracked) {
    if (onCargo && keys['KeyE']) {
      tr.crackT += dt;
      world.trainHint = `CRACKING THE WAGON... ${Math.ceil((2.5 - tr.crackT) * 10) / 10}s — don't fall off`;
      addSparks(player.pos.clone().setY(player.pos.y - 0.4), 2);
      if (tr.crackT >= 2.5) {
        tr.cracked = true;
        tr.heist = false;
        tr.cooldownT = HEIST_COOLDOWN;
        clearGuards(world);
        world.money += REWARD;
        addRep(world, 250);
        addChaos(world, 25);
        addCrime(world, 2);
        if (world.stats) world.stats.trainHeists = (world.stats.trainHeists || 0) + 1;
        sfxMissionPass();
        showMissionMsg('CARGO CRACKED', `+$${REWARD} — now get off before the next station`, '#ffd24a');
        showNews('the harbor freight arrived light one very heavy crate');
        world.onSave?.();
      }
    } else {
      tr.crackT = Math.max(0, tr.crackT - dt);
      world.trainHint = onCargo
        ? 'Hold <b>E</b> to crack the gold wagon'
        : 'Roof clear — ride the <b>gold wagon</b> and hold <b>E</b>';
    }
  }
}
