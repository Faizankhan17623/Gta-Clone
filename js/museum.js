import * as THREE from 'three';
import { blockStart, pointBlocked } from './city.js';
import { showToast, showNews, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxMissionFail, sfxPickup } from './sound.js';
import { addRep, addChaos } from './economy.js';
import { addCrime } from './police.js';
import { addFlash } from './effects.js';

// The City Museum's sculpture garden keeps one priceless golden canvas on an
// open-air pedestal, guarded at night by sweeping laser beams and boundless
// institutional confidence. Cross the garden clean, lift the painting, and
// walk it across town to a fence who "asks zero questions, pays six grand."
// Touch a beam and the whole grid knows your name.

const REWARD = 6000;
const GARDEN_W = 26; // x span
const GARDEN_D = 16; // z span

export function initMuseum(scene, world, save) {
  // garden on a probed corner
  let gx = blockStart(6) + 30;
  let gz = blockStart(8) + 30;
  const probe = new THREE.Vector3(gx, 1, gz);
  for (const [bi, bj] of [[6, 8], [8, 5], [2, 4], [5, 7]]) {
    probe.set(blockStart(bi) + 30, 1, blockStart(bj) + 30);
    if (!pointBlocked(probe, world.city.colliders, 8)) { gx = probe.x; gz = probe.z; break; }
  }

  // marble floor + low fence + entry gap on the south side
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(GARDEN_W, 0.3, GARDEN_D),
    new THREE.MeshLambertMaterial({ color: 0xb8b4a6 })
  );
  floor.position.set(gx, 0.15, gz);
  floor.receiveShadow = true;
  scene.add(floor);
  const fenceMat = new THREE.MeshLambertMaterial({ color: 0x6a6656 });
  for (const [w, x, z, d] of [
    [GARDEN_W, gx, gz - GARDEN_D / 2, 0.4],
    [10, gx - 8, gz + GARDEN_D / 2, 0.4],
    [10, gx + 8, gz + GARDEN_D / 2, 0.4],
    [0.4, gx - GARDEN_W / 2, gz, GARDEN_D],
    [0.4, gx + GARDEN_W / 2, gz, GARDEN_D],
  ]) {
    const seg = new THREE.Mesh(new THREE.BoxGeometry(w, 1.1, d), fenceMat);
    seg.position.set(x, 0.55, z);
    scene.add(seg);
  }

  // the pedestal + the golden canvas, north end
  const pedestal = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 1.2, 1.4),
    new THREE.MeshLambertMaterial({ color: 0xd8d2c0 })
  );
  const pedPos = new THREE.Vector3(gx, 0.6, gz - GARDEN_D / 2 + 2.2);
  pedestal.position.copy(pedPos);
  scene.add(pedestal);
  const painting = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 1.5, 0.12),
    new THREE.MeshStandardMaterial({ color: 0xd0a020, metalness: 0.8, roughness: 0.25, emissive: 0x403000 })
  );
  painting.position.copy(pedPos).add(new THREE.Vector3(0, 1.5, 0));
  scene.add(painting);

  // sweeping laser beams across the walkway
  const beams = [];
  for (let i = 0; i < 4; i++) {
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(GARDEN_W - 1.5, 0.08, 0.08),
      new THREE.MeshBasicMaterial({ color: 0xff2030 })
    );
    beam.position.set(gx, 0.9, gz + GARDEN_D / 2 - 4 - i * 3);
    beam.visible = false;
    scene.add(beam);
    beams.push({ mesh: beam, base: beam.position.z, phase: i * 1.7, speed: 0.7 + i * 0.22 });
  }

  const c = document.createElement('canvas');
  c.width = 160; c.height = 40;
  const g = c.getContext('2d');
  g.fillStyle = '#2a2a24'; g.fillRect(0, 0, 160, 40);
  g.fillStyle = '#d8d2c0'; g.font = 'bold 16px Georgia'; g.textAlign = 'center';
  g.fillText('CITY MUSEUM', 80, 25);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  sign.position.set(gx, 2, gz + GARDEN_D / 2 + 0.2);
  scene.add(sign);

  // the fence (the person, not the railing) waits near the gang turf
  const fencePos = world.city.spawn.clone().add(new THREE.Vector3(120, 0, -90));
  const fProbe = new THREE.Vector3(fencePos.x, 1, fencePos.z);
  if (pointBlocked(fProbe, world.city.colliders, 1.5)) fencePos.set(world.city.spawn.x - 120, 0, world.city.spawn.z + 90);
  const shack = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 2.2, 2.2),
    new THREE.MeshLambertMaterial({ color: 0x2a2018 })
  );
  shack.position.copy(fencePos).setY(1.1);
  scene.add(shack);

  world.museum = {
    center: new THREE.Vector3(gx, 0, gz),
    pedPos, painting, beams, fencePos,
    carrying: false,
    lockedDay: -1,
    doneDay: save?.museumDay ?? -1,
    holdT: 0,
  };
}

// wasted/busted with the canvas: it finds its way home overnight
export function endMuseum(world) {
  const m = world.museum;
  if (!m?.carrying) return;
  m.carrying = false;
  m.painting.visible = true;
  showNews('the golden canvas reappears on its pedestal; the museum calls it "performance art"');
}

export function updateMuseum(world, dt, keys) {
  const m = world.museum;
  if (!m) return;
  const player = world.player;
  world.museumHint = null;
  world.museumBlip = null;
  const night = world.clock >= 22 || world.clock < 4;

  // beams sweep only at night — daytime it's just a very smug garden
  for (const b of m.beams) {
    b.mesh.visible = night && !m.carrying && m.doneDay !== world.dailyDay;
    if (b.mesh.visible) {
      b.mesh.position.z = b.base + Math.sin(world.time * b.speed + b.phase) * 3.2;
      b.mesh.position.y = 0.6 + Math.abs(Math.sin(world.time * b.speed * 0.7 + b.phase)) * 0.9;
    }
  }

  if (m.carrying) {
    // walk it to the fence — heat stays on you the whole way
    world.museumBlip = { x: m.fencePos.x, z: m.fencePos.z };
    world.museumHint = 'GOLDEN CANVAS — get it to the <b>fence</b> (purple blip). Don\'t get caught holding it.';
    const focus = player.inCar ? player.inCar.pos : player.pos;
    if (Math.hypot(focus.x - m.fencePos.x, focus.z - m.fencePos.z) < 4.5) {
      m.carrying = false;
      m.doneDay = world.dailyDay;
      const pay = Math.round(REWARD * (world.payMult || 1));
      world.money += pay;
      addRep(world, 400);
      addChaos(world, 20);
      if (world.stats) world.stats.paintings = (world.stats.paintings || 0) + 1;
      sfxMissionPass();
      showMissionMsg('FENCED', `+$${pay} — "lovely brushwork," says a man who will melt it down`, '#c95aff');
      showNews('art critics mourn the stolen canvas; one notes it "was probably fake anyway"');
      world.onSave?.();
    }
    return;
  }

  if (m.doneDay === world.dailyDay) return;
  const inGarden = Math.abs(player.pos.x - m.center.x) < GARDEN_W / 2 &&
    Math.abs(player.pos.z - m.center.z) < GARDEN_D / 2 && player.pos.y < 3;

  if (!night) {
    if (inGarden) world.museumHint = 'CITY MUSEUM — the good stuff is only worth stealing after 22:00';
    return;
  }

  // laser contact = the loudest possible mistake (the pedestal pocket itself
  // is clean — the beams guard the approach, as is traditional)
  const atPedestal = Math.hypot(player.pos.x - m.pedPos.x, player.pos.z - m.pedPos.z) < 2.8;
  if (inGarden && !atPedestal && m.lockedDay !== world.dailyDay && !player.inCar) {
    for (const b of m.beams) {
      if (!b.mesh.visible) continue;
      if (Math.abs(player.pos.z - b.mesh.position.z) < 0.5 &&
          Math.abs(player.pos.x - m.center.x) < GARDEN_W / 2 - 0.5 &&
          player.pos.y < b.mesh.position.y + 1 && player.pos.y + 1.8 > b.mesh.position.y) {
        m.lockedDay = world.dailyDay;
        addCrime(world, 3);
        sfxMissionFail();
        addFlash(player.pos.clone().setY(1.2), 0xff2030, 1);
        showMissionMsg('ALARM', 'The canvas drops into a vault. Tonight is over — the police are not.', '#ff2030');
        showNews('museum lasers catch an intruder mid-tiptoe; sirens converge');
        return;
      }
    }
  }

  if (m.lockedDay === world.dailyDay) {
    if (inGarden) world.museumHint = 'MUSEUM — the canvas is vaulted until tomorrow night. Take a brochure.';
    return;
  }

  // the lift
  const d = Math.hypot(player.pos.x - m.pedPos.x, player.pos.z - m.pedPos.z);
  if (inGarden) {
    world.museumHint = d < 2.4
      ? 'Hold <b>E</b> to lift the GOLDEN CANVAS'
      : 'MUSEUM GARDEN — cross the beams, reach the pedestal';
  }
  if (d < 2.4 && !player.inCar && keys['KeyE']) {
    m.holdT += dt;
    if (m.holdT > 2) {
      m.holdT = 0;
      m.carrying = true;
      m.painting.visible = false;
      addCrime(world, 2);
      sfxPickup();
      showMissionMsg('THE LIFT', 'It\'s heavier than it looks. Everything priceless is.', '#c95aff');
      showNews('the museum\'s pride is missing; the night guard blames "modern art"');
    }
  } else {
    m.holdT = Math.max(0, m.holdT - dt * 2);
  }
}
