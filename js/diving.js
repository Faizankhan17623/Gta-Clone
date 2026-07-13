import * as THREE from 'three';
import { WATER_X0, WATER_X1, WATER_Z, WATER_Y, inWater } from './water.js';
import { showToast, showNews, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxPickup } from './sound.js';
import { addRep } from './economy.js';
import { addSmoke, addFlash } from './effects.js';

// Deep Harbor: buy a scuba rig at the dive shack and drop below the surface.
// Down in the dark: two sunken wrecks with loot chests, six pearls scattered
// across the floor, and — if you've met the harbor thing — the occasional
// reminder that you're a guest down there.

const SCUBA_COST = 500;
const BREATH = 60;
const PEARL_PAY = 300;
const CHEST_PAY = 800;
const ALL_PEARLS_BONUS = 5000;

const WRECKS = [
  { x: WATER_X0 + 90, z: -110 },
  { x: WATER_X0 + 160, z: 150 },
];
const PEARLS = [
  [WATER_X0 + 70, -60], [WATER_X0 + 120, -140], [WATER_X0 + 60, 90],
  [WATER_X0 + 150, 40], [WATER_X0 + 190, 170], [WATER_X0 + 210, -40],
];

export function initDiving(scene, world, save) {
  // dive shack on the south pier
  const shackPos = new THREE.Vector3(WATER_X0 + 6, 1.3, -24);
  const shack = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 2.2, 2.6),
    new THREE.MeshLambertMaterial({ color: 0x1a4a52 })
  );
  shack.position.copy(shackPos).setY(2.4);
  scene.add(shack);
  const c = document.createElement('canvas');
  c.width = 128; c.height = 40;
  const g = c.getContext('2d');
  g.fillStyle = '#06141a'; g.fillRect(0, 0, 128, 40);
  g.fillStyle = '#4ad2ff'; g.font = 'bold 16px Arial'; g.textAlign = 'center';
  g.fillText('DEEP HARBOR', 64, 17);
  g.font = 'bold 10px Arial';
  g.fillText('dive shack', 64, 33);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.75), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  sign.position.copy(shackPos).setY(3.9);
  scene.add(sign);

  // wrecks: capsized hulls resting on the deep floor
  const wrecks = WRECKS.map((w, i) => {
    const hull = new THREE.Mesh(
      new THREE.CylinderGeometry(2.4, 3.2, 14, 8),
      new THREE.MeshLambertMaterial({ color: 0x24303a })
    );
    hull.rotation.z = Math.PI / 2 + 0.25;
    hull.rotation.y = i * 1.2;
    hull.position.set(w.x, -9.4, w.z);
    scene.add(hull);
    const chest = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.8, 0.8),
      new THREE.MeshStandardMaterial({ color: 0x6b4d2e, metalness: 0.3, roughness: 0.6, emissive: 0x201404 })
    );
    chest.position.set(w.x + 4, -10.5, w.z + 2);
    scene.add(chest);
    return { pos: chest.position, chest, key: 'wreck' + i, looted: (save?.chests || []).includes('wreck' + i) };
  });
  for (const w of wrecks) if (w.looted) w.chest.visible = false;

  // pearls: soft glow in the black
  const got = new Set(save?.pearls || []);
  const pearls = PEARLS.map(([x, z], i) => {
    const p = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 10, 8),
      new THREE.MeshLambertMaterial({ color: 0xe8f2f8, emissive: 0x8aa8b8, emissiveIntensity: 0.9 })
    );
    p.position.set(x, -10.6, z);
    p.visible = !got.has(i);
    scene.add(p);
    return { mesh: p, idx: i, got: got.has(i) };
  });

  world.diving = {
    on: false,
    scuba: !!save?.scuba,
    breath: BREATH,
    shackPos,
    wrecks,
    pearls,
    cameoT: 0,
    cameoDone: false,
  };
}

const _dv = new THREE.Vector3();

export function updateDivingShack(world, dt, pressed) {
  const dv = world.diving;
  if (!dv || dv.on) return;
  const player = world.player;
  world.diveHint = null;
  const d = Math.hypot(player.pos.x - dv.shackPos.x, player.pos.z - dv.shackPos.z);
  if (d > 4 || player.inCar || player.inHeli || player.inBoat) return;

  if (!dv.scuba) {
    world.diveHint = `Press <b>E</b> to buy a SCUBA RIG — $${SCUBA_COST} (the harbor keeps secrets down deep)`;
    if (pressed['KeyE']) {
      if (world.money < SCUBA_COST) { showToast('Not enough cash'); return; }
      world.money -= SCUBA_COST;
      dv.scuba = true;
      sfxPickup();
      showToast('SCUBA RIG — press E here again to dive');
      world.onSave?.();
    }
    return;
  }
  world.diveHint = 'Press <b>E</b> to DIVE — wrecks and pearls wait on the harbor floor';
  if (pressed['KeyE']) {
    dv.on = true;
    dv.breath = BREATH;
    player.swim = false;
    player.pos.set(dv.shackPos.x + 5, WATER_Y - 2, dv.shackPos.z);
    player.vel.set(0, 0, 0);
    player.vy = 0;
    showMissionMsg('DEEP HARBOR', 'W = swim toward camera aim · SPACE up · SHIFT down · watch your air', '#4ad2ff');
  }
}

// full-3D underwater movement; replaces the surface swim while on
export function updateDive(world, dt, keys, getCamDir) {
  const dv = world.diving;
  const player = world.player;
  player.swim = true; // reuse the swim pose

  const dir = getCamDir(); // normalized camera forward from main
  _dv.set(0, 0, 0);
  if (keys['KeyW']) _dv.add(dir);
  if (keys['KeyS']) _dv.sub(dir);
  if (keys['Space']) _dv.y += 1;
  if (keys['ShiftLeft'] || keys['ShiftRight']) _dv.y -= 1;
  if (_dv.lengthSq() > 0) {
    _dv.normalize();
    player.vel.lerp(_dv.multiplyScalar(6.5), Math.min(1, 4 * dt));
  } else {
    player.vel.multiplyScalar(Math.max(0, 1 - 2.5 * dt));
  }
  player.pos.addScaledVector(player.vel, dt);
  player.vy = 0;

  // stay inside the water box, above the floor, below the surface
  player.pos.x = Math.max(WATER_X0 + 2, Math.min(WATER_X1 - 3, player.pos.x));
  player.pos.z = Math.max(-WATER_Z + 3, Math.min(WATER_Z - 3, player.pos.z));
  player.pos.y = Math.max(-10.4, player.pos.y);
  if (player.pos.y > WATER_Y - 0.8) {
    // surfaced: hand back to the normal swim
    dv.on = false;
    player.pos.y = WATER_Y - 1.2;
    showToast(dv.breath < 10 ? 'AIR — that was close' : 'SURFACED');
    return;
  }

  // heading follows travel
  const sp = Math.hypot(player.vel.x, player.vel.z);
  if (sp > 0.5) {
    player.heading = Math.atan2(player.vel.x, player.vel.z);
    player.mesh.rotation.y = player.heading;
  }
  player.mesh.rotation.x = 1.1; // prone glide
  player.animT += dt * 3;

  // air
  dv.breath -= dt;
  const depth = Math.max(0, WATER_Y - player.pos.y).toFixed(1);
  world.diveHint = `🫧 AIR ${Math.max(0, Math.ceil(dv.breath))}s · depth ${depth}m` +
    (dv.breath < 12 ? ' — <b>GET UP</b>' : '');
  if (dv.breath <= 0) {
    player.health -= 6 * dt;
    player.pos.y += 3.5 * dt; // survival instinct floats you
    world.damageFlash = Math.min(1, (world.damageFlash || 0) + dt);
  }
  if (Math.random() < dt * 2) addSmoke(player.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), 0.2); // bubbles

  // ---- loot ----
  for (const w of dv.wrecks) {
    if (w.looted) continue;
    if (player.pos.distanceTo(w.pos) < 2.4) {
      w.looted = true;
      w.chest.visible = false;
      const pay = Math.round(CHEST_PAY * (world.payMult || 1));
      world.money += pay;
      sfxMissionPass();
      addFlash(w.pos.clone(), 0xffd24a, 0.8);
      showToast(`SUNKEN CHEST +$${pay}`);
      showNews('a diver surfaces grinning; the harbormaster pretends not to see');
      world.onSave?.();
    }
  }
  for (const p of dv.pearls) {
    if (p.got) continue;
    p.mesh.rotation.y += dt;
    if (player.pos.distanceTo(p.mesh.position) < 2) {
      p.got = true;
      p.mesh.visible = false;
      world.money += PEARL_PAY;
      sfxPickup();
      const total = dv.pearls.filter((x) => x.got).length;
      showToast(`🦪 PEARL +$${PEARL_PAY} (${total}/6)`);
      if (total === 6) {
        const bonus = Math.round(ALL_PEARLS_BONUS * (world.payMult || 1));
        world.money += bonus;
        addRep(world, 400);
        if (world.stats) world.stats.pearls = 6;
        sfxMissionPass();
        showMissionMsg('PEARL DIVER', `All six — +$${bonus}. The harbor has no secrets left. Almost.`, '#4ad2ff');
        showNews('a jeweler downtown suddenly has an unexplained pearl collection');
      }
      world.onSave?.();
    }
  }

  // the harbor thing pays its respects to a fellow deep-diver
  if (!dv.cameoDone && world.myths?.done?.has('seamonster')) {
    dv.cameoT += dt;
    if (dv.cameoT > 20) {
      dv.cameoDone = true;
      world.shake = 0.25;
      for (let i = 0; i < 4; i++) addSmoke(player.pos.clone().add(new THREE.Vector3(i * 2 - 3, -1, 4)), 1.5);
      showToast('...something enormous just passed beneath you');
      showNews('harbor sonar logs a contact swimming ALONGSIDE a diver, briefly');
    }
  }
}
