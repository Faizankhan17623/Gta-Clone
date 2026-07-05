import * as THREE from 'three';
import { initInput, endFrame, pollGamepad, keys, pressed, mouse } from './input.js';
import { buildCity, resolveCircle, pointBlocked, groundHeight, blockStart, BLOCK, HALF, N } from './city.js';
import { createCharacter, animateWalk, animateIdle } from './characters.js';
import { physStep, separateCars, darkenCar } from './car.js';
import { spawnPeds, updatePeds, killPed, spawnTraffic, updateTraffic, disableTraffic, spawnParked } from './npc.js';
import { updatePolice, addCrime, copDie, clearCops } from './police.js';
import { makeHeli, physStepHeli, spinRotors, explodeHeli, updateFallingHeli, updatePoliceHelis } from './heli.js';
import { initEffects, addTracer, addExplosion, addFlash, addSmoke, addSparks, addSkid, updateEffects } from './effects.js';
import { initHUD, updateHUD, setHint, showBanner, hideBanner, showToast, showNews } from './hud.js';
import { initSound, sfxShot, sfxCrash, sfxPickup, sfxWeb, sfxMissionPass, engine, setEngine, rotor, siren, setSiren, rainAmb, setRadioStation, RADIO_STATIONS, cityHum, setHum, chase, setChase, setMasterVolume } from './sound.js';
import { createSkyDome, applyDayNight, DAY_START } from './daynight.js';
import { initMissions, updateMissions, failMission, mission } from './missions.js';
import { initWeather, updateWeather } from './weather.js';
import { initWeb, fireWeb, releaseWeb, swingStep, updateWebVisual, poseSwing, poseFall } from './web.js';
import { initShops, updateShops, ensureGarageVehicle, garageCheck } from './shops.js';
import { initTouch, isTouch, showTouchUI, showKioskButtons } from './touch.js';
import { initMenu, openMenu, closeMenu, openMap, closeMap, drawBigMap } from './menu.js';
import { vibrate, goFullscreen, grabCanvas, saveOrShare, openCamera, closeCamera, cameraSupported } from './device.js';
import { initStunts, updateStunts, placeTrampoline, tryBounce, checkRamp, bounceFx } from './stunts.js';
import { initGang, updateGang, killGangMember } from './gangs.js';
import { updateArmy, killTank } from './army.js';
import { initAmbient, updateAmbient } from './ambient.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ---------- renderer / scene ----------

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(('ontouchstart' in window || navigator.maxTouchPoints > 0)
  ? 1 : Math.min(window.devicePixelRatio, 2)); // phones render lighter
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; // film-grade color response
renderer.toneMappingExposure = 1.1;
renderer.domElement.id = 'game';
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x9db8d2, 150, 520);

// soft studio reflections for car paint and glass
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1900);

// post-processing: subtle bloom makes lit windows, lamps and explosions glow
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight), 0.28, 0.55, 0.82
);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const hemi = new THREE.HemisphereLight(0xd5e4f2, 0x4a463c, 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d0, 1.3);
sun.castShadow = true;
sun.shadow.mapSize.set(...(('ontouchstart' in window || navigator.maxTouchPoints > 0) ? [1024, 1024] : [2048, 2048]));
sun.shadow.camera.left = -90;
sun.shadow.camera.right = 90;
sun.shadow.camera.top = 90;
sun.shadow.camera.bottom = -90;
sun.shadow.camera.far = 600;
scene.add(sun);
scene.add(sun.target);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- world ----------

const city = buildCity(scene);
const sky = createSkyDome(scene);
const weather = initWeather(scene);
initEffects(scene);
initHUD();
initInput();
initTouch(); // phones get a joystick + buttons
const web = initWeb(scene);

// web parachute canopy
const chuteMesh = new THREE.Mesh(
  new THREE.SphereGeometry(1.7, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xf2f2ec, transparent: true, opacity: 0.65, side: THREE.DoubleSide })
);
chuteMesh.visible = false;
scene.add(chuteMesh);

// persistent progress
const SAVE_KEY = 'opencity-save-v1';
let save = {};
try { save = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') || {}; } catch { save = {}; }

const playerChar = createCharacter({ shirt: '#cfcfc6', pants: '#27406b', skin: '#c98e63' });
scene.add(playerChar.group);

const player = {
  ch: playerChar,
  mesh: playerChar.group,
  pos: playerChar.group.position,
  vel: new THREE.Vector3(),
  heading: 0,
  health: 100,
  inCar: null,
  inHeli: null,
  animT: 0,
  vy: 0,
  onGround: true,
  glide: false, // floaty hang-time after releasing a swing
  wallT: 3,     // wall-run stamina (~22m of vertical sprint)
  dodgeT: 0,    // dodge-roll i-frames
};
player.pos.copy(city.spawn);

const world = {
  scene,
  city,
  player,
  peds: spawnPeds(scene, city, 70),
  traffic: spawnTraffic(scene, city, 18),
  parked: spawnParked(scene, 26),
  cops: [],
  helis: [],
  policeHelis: [],
  pickups: [],
  wanted: 0,
  wantedTimer: 0,
  bustedT: 0,
  busted: false,
  money: save.money || 0,
  damageFlash: 0,
  time: 0,
  lastShot: null,
  weaponName: 'PISTOL',
  shake: 0,
  clock: DAY_START, // in-game hour, 24 real minutes per day
  sunDir: new THREE.Vector3(0.5, 1, 0.4).normalize(),
  maxHealth: 100,
  tanks: [],
  style: 0, // swing style points, cashed out on landing
  radioSt: save.radio | 0,
  targets: [], // unified shootable extras: SWAT, drones, hunters, rooftop marks
  swat: [],
  drones: [],
  garageKind: save.garage || null,
  xp: save.xp | 0,
  level: 1,
  stats: { swungM: 0, styleBest: 0, missions: 0, fares: 0, tanks: 0, jackpots: 0, ...(save.stats || {}) },
  ach: { ...(save.ach || {}) },
  suitSaved: save.suit || 'street',
  suitsOwnedSaved: save.suits || {},
  settings: { volume: 1, sens: 1, invertY: false, lowGfx: false, ...(save.settings || {}) },
  perks: { style: 1, melee: 1, webDur: 6, decay: 24, busted: 1.6 },
  waypoint: null,
  barks: [],
  tokensGot: [...(save.tokens || [])],
  slowmoT: 0,
};
world.level = 1 + Math.floor(Math.sqrt(world.xp / 120));
world.bark = (pos, text) => {
  if (world.barks.length > 4) world.barks.shift();
  world.barks.push({ pos, text, t: 2.6, sx: -999, sy: -999 });
};

// rideable helicopters on the park helipads
for (const pad of city.helipads) {
  world.helis.push(makeHeli(scene, pad.x, pad.y, pad.z, Math.random() * Math.PI * 2, false));
}
let heliRespawnT = 0;

// missions + saved progress
initMissions(scene, world, save.missions || 0);
const shopsState = initShops(scene, world, save.upg);
const gang = initGang(scene, world, save.gang);
const flocks = initAmbient(scene);
const stuntsState = initStunts(scene, world);
ensureGarageVehicle(shopsState, world);
world.mapRamps = stuntsState.ramps;
world.mapSkulls = stuntsState.skulls;

// cyan waypoint beam, set from the big map
const wpMarker = new THREE.Group();
{
  const ring = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 0.6, 22, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x4ad2ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.position.y = 0.5;
  wpMarker.add(ring);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 1.1, 46, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x4ad2ff, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false })
  );
  beam.position.y = 23;
  wpMarker.add(beam);
  wpMarker.visible = false;
  scene.add(wpMarker);
}

function applySettings() {
  const st = world.settings;
  setMasterVolume(st.volume);
  sun.castShadow = !st.lowGfx;
  renderer.setPixelRatio(st.lowGfx ? 1 : (isTouch ? 1 : Math.min(window.devicePixelRatio, 2)));
  saveGame();
}

initMenu({
  settings: world.settings,
  onSettings: applySettings,
  onResume: resumeGame,
  onRestart: () => { closeMenu(); respawn(); gameState = 'play'; showTouchUI(isTouch); },
  onPhoto: enterPhotoMode,
  onCamera: () => {
    closeMenu();
    openCamera(() => { if (gameState === 'pause') openMenu(world); }).then((r) => {
      if (r !== 'ok') { openMenu(world); showToast(r === 'denied' ? 'Camera permission denied' : r === 'unsupported' ? 'No camera on this device' : 'Camera unavailable (needs HTTPS)'); }
    });
  },
  cameraSupported: cameraSupported(),
  onWaypoint: (x, z) => {
    world.waypoint = new THREE.Vector3(Math.max(-HALF, Math.min(HALF, x)), 0, Math.max(-HALF, Math.min(HALF, z)));
    wpMarker.position.set(world.waypoint.x, 0, world.waypoint.z);
    wpMarker.visible = true;
    closeBigMap();
    showToast('WAYPOINT SET');
  },
});

function pauseGame() {
  if (gameState !== 'play') return;
  gameState = 'pause';
  showTouchUI(false);
  document.exitPointerLock?.();
  openMenu(world);
}

function resumeGame() {
  closeMenu();
  gameState = 'play';
  showTouchUI(isTouch);
  if (!isTouch) renderer.domElement.requestPointerLock?.();
}

function openBigMap() {
  if (gameState !== 'play') return;
  gameState = 'map';
  showTouchUI(false);
  document.exitPointerLock?.();
  openMap(world);
}

function closeBigMap() {
  closeMap();
  gameState = 'play';
  showTouchUI(isTouch);
  if (!isTouch) renderer.domElement.requestPointerLock?.();
}

// ---------- photo mode ----------

const PHOTO_FILTERS = ['', 'grayscale(1) contrast(1.15)', 'sepia(0.5) saturate(1.5) contrast(1.05)'];
let photoFilter = 0;
const photoPos = new THREE.Vector3();

function enterPhotoMode() {
  closeMenu();
  gameState = 'photo';
  photoPos.copy(camera.position);
  document.getElementById('hud').style.display = 'none';
  showTouchUI(false);
  showToast('');
  if (!isTouch) renderer.domElement.requestPointerLock?.();
}

function exitPhotoMode() {
  gameState = 'play';
  renderer.domElement.style.filter = '';
  photoFilter = 0;
  document.getElementById('hud').style.display = 'block';
  showTouchUI(isTouch);
}

const _photoDir = new THREE.Vector3();

function updatePhoto(dt) {
  camYaw -= mouse.dx * 0.0024;
  camPitch = Math.max(-1.4, Math.min(1.4, camPitch + mouse.dy * 0.0018));
  _photoDir.set(Math.sin(camYaw) * Math.cos(camPitch), Math.sin(camPitch), Math.cos(camYaw) * Math.cos(camPitch));
  const spd = keys['ShiftLeft'] ? 60 : 24;
  if (keys['KeyW']) photoPos.addScaledVector(_photoDir, spd * dt);
  if (keys['KeyS']) photoPos.addScaledVector(_photoDir, -spd * dt);
  _right.set(Math.cos(camYaw), 0, -Math.sin(camYaw));
  if (keys['KeyD']) photoPos.addScaledVector(_right, -spd * dt);
  if (keys['KeyA']) photoPos.addScaledVector(_right, spd * dt);
  if (keys['Space']) photoPos.y += spd * 0.6 * dt;
  photoPos.y = Math.max(0.5, photoPos.y);
  camera.position.copy(photoPos);
  camera.lookAt(photoPos.clone().add(_photoDir));
  if (pressed['KeyF']) { // cycle filters
    photoFilter = (photoFilter + 1) % PHOTO_FILTERS.length;
    renderer.domElement.style.filter = PHOTO_FILTERS[photoFilter];
  }
  if (mouse.down || pressed['Enter'] || pressed['KeyG']) world.captureNext = true; // snap
  if (pressed['KeyP'] || pressed['Escape']) exitPhotoMode();
}

function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: world.money, missions: mission.done, mg: ammo.mg, rpg: ammo.rpg,
      upg: world.upgrades, gang: { owned: gang.owned, kills: gang.kills }, radio: world.radioSt,
      garage: world.garageKind, xp: world.xp, stats: world.stats, ach: world.ach,
      tokens: world.tokensGot,
      suit: world.suit, suits: world.suitsOwned, settings: world.settings,
    }));
  } catch {}
}
world.onSave = saveGame;

// player-car headlights at night (persistent light => no shader recompiles)
const headlight = new THREE.SpotLight(0xffeecb, 0, 55, 0.62, 0.45, 1.4);
headlight.castShadow = false;
scene.add(headlight);
scene.add(headlight.target);

// ---------- weapons ----------

const WEAPONS = [
  { name: 'PISTOL', rate: 0.26, dmg: 34, spread: 0.012, sfx: 'pistol' },
  { name: 'MACHINE GUN', rate: 0.085, dmg: 12, spread: 0.04, sfx: 'mg', ammo: 'mg' },
  { name: 'RPG', rate: 1.4, rocket: true, sfx: 'rpg', ammo: 'rpg' },
];
const ammo = { mg: save.mg ?? 60, rpg: save.rpg ?? 3 };
let weaponIdx = 0;
let shootT = 0;
const rockets = [];

function switchWeapon(i) {
  weaponIdx = i;
  const w = WEAPONS[i];
  showToast(w.ammo ? `${w.name} — ${ammo[w.ammo]} AMMO` : w.name);
}

// ---------- pickups ----------

function randomSidewalkPoint() {
  const bi = (Math.random() * N) | 0;
  const bj = (Math.random() * N) | 0;
  const edge = (Math.random() * 4) | 0;
  const t = Math.random() * (BLOCK - 4) + 2;
  const sx = blockStart(bi);
  const sz = blockStart(bj);
  if (edge === 0) return new THREE.Vector3(sx + t, 0, sz + 2);
  if (edge === 1) return new THREE.Vector3(sx + t, 0, sz + BLOCK - 2);
  if (edge === 2) return new THREE.Vector3(sx + 2, 0, sz + t);
  return new THREE.Vector3(sx + BLOCK - 2, 0, sz + t);
}

function makePickup(type) {
  const color = type === 'money' ? 0x4cdc6a : type === 'ammo' ? 0xffc94a : 0xe05555;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.7, 0.7),
    new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.6 })
  );
  const p = randomSidewalkPoint();
  mesh.position.set(p.x, 1.0, p.z);
  scene.add(mesh);
  world.pickups.push({ type, mesh, pos: mesh.position });
}
for (let i = 0; i < 24; i++) makePickup('money');
for (let i = 0; i < 6; i++) makePickup('health');
for (let i = 0; i < 8; i++) makePickup('ammo');

function updatePickups(dt) {
  const focus = player.inHeli ? player.inHeli.pos : player.inCar ? player.inCar.pos : player.pos;
  if (player.inHeli && player.inHeli.pos.y > 3) return; // can't grab them from the sky
  if (!player.inHeli && !player.inCar && player.pos.y > 3) return; // nor while web-swinging overhead
  for (const pk of world.pickups) {
    pk.mesh.rotation.y += dt * 2.5;
    pk.mesh.position.y = 1.0 + Math.sin(world.time * 3 + pk.pos.x) * 0.15;
    const dx = pk.pos.x - focus.x;
    const dz = pk.pos.z - focus.z;
    if (dx * dx + dz * dz < (player.inCar || player.inHeli ? 7 : 3.2)) {
      if (pk.type === 'money') {
        world.money += 150;
        showToast('+$150');
      } else if (pk.type === 'ammo') {
        ammo.mg += 45;
        ammo.rpg += 2;
        showToast('+45 MG · +2 RPG');
      } else {
        player.health = Math.min(world.maxHealth, player.health + 50);
        showToast('+50 HEALTH');
      }
      sfxPickup();
      saveGame();
      const p = randomSidewalkPoint();
      pk.mesh.position.set(p.x, 1.0, p.z);
    }
  }
}

// ---------- camera ----------

let camYaw = 0;
let camPitch = 0.12;
const camPos = new THREE.Vector3(0, 4, -10);
const _camTarget = new THREE.Vector3();
const _camDesired = new THREE.Vector3();

function updateCamera(dt) {
  const sens = world.settings.sens || 1;
  const inv = world.settings.invertY ? -1 : 1;
  camYaw -= mouse.dx * 0.0024 * sens;
  camPitch = Math.max(-0.35, Math.min(0.75, camPitch + mouse.dy * 0.0018 * sens * inv));
  if (keys['ArrowLeft']) camYaw += 1.8 * dt;
  if (keys['ArrowRight']) camYaw -= 1.8 * dt;

  let focusSpeed = 0;

  if (player.inHeli) {
    const h = player.inHeli;
    focusSpeed = h.vel.length();
    let diff = h.heading - camYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    camYaw += diff * Math.min(1, 2.6 * dt);

    _camDesired.set(
      h.pos.x - Math.sin(camYaw) * 17,
      h.pos.y + 6.5 + camPitch * 8,
      h.pos.z - Math.cos(camYaw) * 17
    );
    camPos.lerp(_camDesired, Math.min(1, 5 * dt));
    camera.position.copy(camPos);
    _camTarget.set(h.pos.x, h.pos.y + 1.5, h.pos.z);
    camera.lookAt(_camTarget);
  } else if (player.inCar) {
    const car = player.inCar;
    focusSpeed = car.vel.length();
    let diff = car.heading - camYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    camYaw += diff * Math.min(1, 3.2 * dt);

    _camDesired.set(
      car.pos.x - Math.sin(camYaw) * 9.5,
      4.2 + camPitch * 6,
      car.pos.z - Math.cos(camYaw) * 9.5
    );
    camPos.lerp(_camDesired, Math.min(1, 7 * dt));
    camera.position.copy(camPos);
    _camTarget.set(car.pos.x, 1.6, car.pos.z);
    camera.lookAt(_camTarget);
  } else {
    if (web.attached) focusSpeed = player.vel.length();
    const dist = web.attached ? 7.6 : 5.6;
    _camDesired.set(
      player.pos.x - Math.sin(camYaw) * dist * Math.cos(camPitch),
      player.pos.y + 2.1 + Math.sin(camPitch) * dist,
      player.pos.z - Math.cos(camYaw) * dist * Math.cos(camPitch)
    );
    camPos.lerp(_camDesired, Math.min(1, 11 * dt));
    camera.position.copy(camPos);
    _camTarget.set(player.pos.x, player.pos.y + 1.55, player.pos.z);
    camera.lookAt(_camTarget);
  }

  // sense of speed: widen FOV as you go faster
  const targetFov = Math.min(84, 70 + focusSpeed * 0.32);
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, 5 * dt);
    camera.updateProjectionMatrix();
  }

  // impact shake
  if (world.shake > 0.001) {
    camera.position.x += (Math.random() - 0.5) * world.shake;
    camera.position.y += (Math.random() - 0.5) * world.shake;
    camera.position.z += (Math.random() - 0.5) * world.shake;
    world.shake *= Math.max(0, 1 - 7 * dt);
  }

  const focus = player.inHeli ? player.inHeli.pos : player.inCar ? player.inCar.pos : player.pos;
  sun.position.copy(focus).addScaledVector(world.sunDir, 180);
  sun.target.position.set(focus.x, 0, focus.z);
}

// ---------- player on foot ----------

const _move = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function updateOnFoot(dt) {
  _fwd.set(Math.sin(camYaw), 0, Math.cos(camYaw));
  _right.copy(_fwd).cross(UP);

  _move.set(0, 0, 0);
  if (keys['KeyW']) _move.add(_fwd);
  if (keys['KeyS']) _move.sub(_fwd);
  if (keys['KeyD']) _move.add(_right);
  if (keys['KeyA']) _move.sub(_right);

  const moving = _move.lengthSq() > 0;
  const sprintSpeed = world.level >= 8 ? 12 : 10; // parkour sprint skill
  const speed = keys['ShiftLeft'] || keys['ShiftRight'] ? sprintSpeed : 5.5;

  if (moving) {
    _move.normalize();
    if (player.onGround) {
      player.vel.x = _move.x * speed;
      player.vel.z = _move.z * speed;
    } else {
      // airborne: nudge instead of override, so web-swing momentum survives
      player.vel.x += _move.x * 16 * dt;
      player.vel.z += _move.z * 16 * dt;
    }
    const targetH = Math.atan2(_move.x, _move.z);
    let diff = targetH - player.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    player.heading += diff * Math.min(1, 14 * dt);
  } else if (player.onGround) {
    player.vel.x *= Math.max(0, 1 - 12 * dt);
    player.vel.z *= Math.max(0, 1 - 12 * dt);
  }

  if (pressed['Space'] && player.onGround) {
    player.vy = 7.5;
    player.onGround = false;
    player.dblJump = false;
  } else if (pressed['Space'] && !player.onGround && world.level >= 2 && !player.dblJump && player.vy < 5 && !keys['KeyW']) {
    player.dblJump = true; // level 2 skill (W+Space stays reserved for the parachute)
    player.vy = 7;
    addStyle(4);
  }

  // melee on the ground, web-dash (level 4) in the air
  meleeT -= dt;
  comboT -= dt;
  if (comboT <= 0) combo = 0;
  if (pressed['KeyF'] && meleeT <= 0) {
    if (player.onGround) melee();
    else if (world.level >= 4) { // web-dash burst
      meleeT = 0.5;
      camera.getWorldDirection(_rayDir);
      player.vel.x += _rayDir.x * 18;
      player.vel.z += _rayDir.z * 18;
      player.vy += _rayDir.y * 12 + 2;
      sfxWeb();
      addStyle(8);
    }
  }
  player.dodgeT = Math.max(0, player.dodgeT - dt);
  checkDodge();

  // point-launch: hold C to coil down, release to rocket upward
  if (player.onGround && keys['KeyC']) {
    player.charge = Math.min(1.1, (player.charge || 0) + dt);
    player.mesh.scale.y = 1 - player.charge * 0.25;
  } else if ((player.charge || 0) > 0.15 && player.onGround) {
    player.vy = 9 + player.charge * 13;
    player.onGround = false;
    player.glide = true;
    addStyle(player.charge * 18);
    sfxWeb();
    player.charge = 0;
  } else {
    player.charge = 0;
    player.mesh.scale.y += (1 - player.mesh.scale.y) * Math.min(1, 12 * dt);
  }

  // web parachute: hold Space while falling to drift down gently
  const chuting = !player.onGround && player.vy < -2 && keys['Space'];
  chuteMesh.visible = chuting;

  // after a swing release the web's drag floats you — seconds of hang-time
  player.vy -= (player.glide && !player.onGround ? 11 : 22) * dt;
  if (player.glide && player.vy < -16) player.vy = -16; // drift down, don't plummet
  if (chuting) {
    if (player.vy < -4.5) player.vy = -4.5;
    chuteMesh.position.set(player.pos.x, player.pos.y + 3.2, player.pos.z);
    addStyle(3 * dt);
  }
  const prevY = player.pos.y;
  player.pos.y += player.vy * dt;
  // probe from the pre-fall height so a fast frame can't punch through a roof
  const groundY = groundHeight(player.pos, city.colliders, 0.1, prevY);
  if (player.pos.y <= groundY) {
    const bounce = tryBounce(world, player.pos, player.vy);
    if (bounce) { // sprung off a web trampoline
      player.vy = bounce;
      player.pos.y = Math.max(player.pos.y, 0.6);
      player.glide = true;
      bounceFx(player.pos);
      sfxWeb();
      addStyle(8);
    } else {
      if (player.vy < -24) { // hard landing hurts
        player.health -= (-player.vy - 24) * 2.2;
        world.shake = 0.25;
        world.style = 0; // face-planting is not stylish
      }
      player.pos.y = groundY;
      player.vy = 0;
      player.onGround = true;
      player.glide = false;
      player.wallT = 3.0; // wall-run stamina recharges on the ground
      cashOutStyle();
    }
  } else if (player.vy < 0 && player.pos.y > groundY + 0.05) {
    player.onGround = false; // walked off a roof edge
  }

  // parapet grind: hold Shift along a rooftop edge to skate it
  if (player.onGround && player.pos.y > 5 && (keys['ShiftLeft'] || keys['ShiftRight'])) {
    const c = city.colliders.find((c) =>
      Math.abs(c.h - 0.3 - player.pos.y) < 0.6 &&
      player.pos.x > c.x0 - 0.5 && player.pos.x < c.x1 + 0.5 &&
      player.pos.z > c.z0 - 0.5 && player.pos.z < c.z1 + 0.5);
    if (c) {
      const dx0 = player.pos.x - c.x0;
      const dx1 = c.x1 - player.pos.x;
      const dz0 = player.pos.z - c.z0;
      const dz1 = c.z1 - player.pos.z;
      const m = Math.min(dx0, dx1, dz0, dz1);
      if (m < 1.4) {
        const alongX = m === dz0 || m === dz1; // near a z-edge: grind along x
        if (alongX) {
          player.vel.x = (Math.sign(player.vel.x) || 1) * 14;
          player.vel.z = 0;
          player.pos.z = m === dz0 ? c.z0 + 0.4 : c.z1 - 0.4;
        } else {
          player.vel.z = (Math.sign(player.vel.z) || 1) * 14;
          player.vel.x = 0;
          player.pos.x = m === dx0 ? c.x0 + 0.4 : c.x1 - 0.4;
        }
        player.heading = Math.atan2(player.vel.x, player.vel.z);
        addStyle(10 * dt);
        if (Math.random() < 10 * dt) addSparks(player.pos.clone().setY(player.pos.y + 0.1), 4);
      }
    }
  }

  // T: sling a web trampoline onto the street ahead
  if (pressed['KeyT'] && placeTrampoline(scene, world, camera, player.pos)) sfxWeb();

  player.pos.x += player.vel.x * dt;
  player.pos.z += player.vel.z * dt;
  const wallHit = resolveCircle(player.pos, 0.5, city.colliders, player.pos.y + 0.5);

  // wall-run: push into a building in mid-air while holding W to sprint up it
  // (stamina covers ~22m — enough to run straight up the smaller towers)
  if (wallHit && !player.onGround && keys['KeyW'] && player.wallT > 0) {
    player.wallT -= dt;
    player.vy = Math.max(player.vy, 7.5);
    addStyle(12 * dt);
    if (pressed['Space']) { // kick off the wall
      player.vy = 8;
      player.vel.x += wallHit.nx * 9;
      player.vel.z += wallHit.nz * 9;
      player.wallT = 0;
    }
  }

  if (player.pos.y < 2) {
    for (const v of world.traffic) pushOutOfCar(v);
    for (const v of world.parked) pushOutOfCar(v);
    for (const v of world.cops) if (!v.dead) pushOutOfCar(v);
  }

  const B = HALF - 1.5;
  player.pos.x = Math.max(-B, Math.min(B, player.pos.x));
  player.pos.z = Math.max(-B, Math.min(B, player.pos.z));

  const sp = Math.hypot(player.vel.x, player.vel.z);
  if (!player.onGround) {
    poseFall(player.ch);
  } else if (sp > 0.5) {
    player.animT += sp * dt * 2.0;
    animateWalk(player.ch, player.animT, sp > 7 ? 0.95 : 0.6);
  } else {
    animateIdle(player.ch);
  }
  player.mesh.rotation.y = player.heading;
  player.mesh.rotation.x *= Math.max(0, 1 - 10 * dt); // settle out of the swing lean

  // weapon switching (digits buy upgrades while at the web den)
  if (!world.nearDen) {
    if (pressed['Digit1']) switchWeapon(0);
    if (pressed['Digit2']) switchWeapon(1);
    if (pressed['Digit3']) switchWeapon(2);
  }

  // enter vehicle or helicopter
  const nearVeh = findNearestVehicle(3.8);
  const nearHeli = findNearestHeli(6.5);
  if (nearHeli) setHint('Press <b>E</b> to fly helicopter');
  else if (nearVeh) setHint('Press <b>E</b> to enter vehicle');
  else if (world.shopHint) setHint(world.shopHint);
  else setHint(null);
  if (pressed['KeyE']) {
    if (nearHeli) enterHeli(nearHeli);
    else if (nearVeh) enterCar(nearVeh);
  }

  // shooting
  shootT -= dt;
  if (mouse.down && shootT <= 0 && (document.pointerLockElement || isTouch)) {
    shootT = WEAPONS[weaponIdx].rate;
    shoot();
  }

  // web swing: hold right mouse to fire a strand at a building
  web.cooldown = Math.max(0, web.cooldown - dt);
  if (mouse.rdown && web.cooldown <= 0 && (document.pointerLockElement || isTouch)) {
    web.cooldown = 0.25;
    tryStartSwing();
  }

  // Q: web an enemy or car in place
  webAtkT -= dt;
  if (pressed['KeyQ'] && webAtkT <= 0) {
    webAtkT = 1.1;
    webAttack();
  }
}

function pushOutOfCar(v) {
  const dx = player.pos.x - v.pos.x;
  const dz = player.pos.z - v.pos.z;
  const d2 = dx * dx + dz * dz;
  const R = 2.1;
  if (d2 < R * R && d2 > 1e-6) {
    const d = Math.sqrt(d2);
    player.pos.x += (dx / d) * (R - d);
    player.pos.z += (dz / d) * (R - d);
  }
}

function findNearestVehicle(maxDist) {
  let best = null;
  let bestD = maxDist;
  const check = (v) => {
    if (v.dead) return;
    const d = Math.hypot(v.pos.x - player.pos.x, v.pos.z - player.pos.z);
    if (d < bestD) { bestD = d; best = v; }
  };
  for (const v of world.parked) check(v);
  for (const v of world.traffic) check(v);
  for (const v of world.tanks) check(v); // yes, you can steal the tank
  return best;
}

function findNearestHeli(maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const h of world.helis) {
    // parked is relative: a heli sitting on a rooftop next to you counts
    if (h.dead || Math.abs(h.pos.y - player.pos.y) > 4) continue;
    const d = Math.hypot(h.pos.x - player.pos.x, h.pos.z - player.pos.z);
    if (d < bestD) { bestD = d; best = h; }
  }
  return best;
}

function enterCar(v) {
  let idx = world.parked.indexOf(v);
  if (idx >= 0) world.parked.splice(idx, 1);
  idx = world.traffic.indexOf(v);
  if (idx >= 0) {
    world.traffic.splice(idx, 1);
    addCrime(world, 1);
    showToast('CARJACKED!');
  }
  v.ai = null;
  player.inCar = v;
  player.mesh.visible = false;
  setHint(null);
  camYaw = v.heading;
  engine.start();
  if (world.radioSt > 0) setRadioStation(world.radioSt);
  if (v.tank) {
    showToast('TANK! LEFT CLICK = CANNON');
    showNews('a battle tank has been stolen from the army');
  }
}

function exitCar() {
  const car = player.inCar;
  _fwd.set(Math.sin(car.heading), 0, Math.cos(car.heading));
  _right.copy(_fwd).cross(UP);
  player.pos.set(car.pos.x - _right.x * 2.6, 0, car.pos.z - _right.z * 2.6);
  resolveCircle(player.pos, 0.5, city.colliders);
  player.vel.set(0, 0, 0);
  player.vy = 0;
  player.mesh.visible = true;
  player.heading = car.heading;
  player.inCar = null;
  if (!car.dead && !car.tank) world.parked.push(car);
  camYaw = car.heading;
  engine.stop();
  setRadioStation(0);
  garageCheck(shopsState, world, car); // parked on the garage pad?
}

function enterHeli(h) {
  player.inHeli = h;
  player.mesh.visible = false;
  setHint(null);
  camYaw = h.heading;
  rotor.start();
  showToast('SPACE = UP, SHIFT = DOWN');
}

function exitHeli() {
  const h = player.inHeli;
  _fwd.set(Math.sin(h.heading), 0, Math.cos(h.heading));
  _right.copy(_fwd).cross(UP);
  player.pos.set(h.pos.x - _right.x * 3.4, h.pos.y, h.pos.z - _right.z * 3.4);
  // step out onto whatever the heli landed on — rooftop or street
  let py = groundHeight(player.pos, city.colliders, 0.1, h.pos.y);
  if (py < h.pos.y - 3) {
    // that side hangs over the edge — climb out beside the skids instead
    player.pos.set(h.pos.x + _right.x * 3.4, h.pos.y, h.pos.z + _right.z * 3.4);
    py = groundHeight(player.pos, city.colliders, 0.1, h.pos.y);
  }
  player.pos.y = py;
  resolveCircle(player.pos, 0.5, city.colliders, player.pos.y + 0.5);
  player.vel.set(0, 0, 0);
  player.vy = 0;
  player.mesh.visible = true;
  player.heading = h.heading;
  player.inHeli = null;
  camYaw = h.heading;
  rotor.stop();
}

// ---------- XP, levels & skills ----------
// Unlocks: L2 double-jump · L4 web-dash (F in air) · L6 slow-mo aim · L8 fast sprint

function addXP(n) {
  world.xp += n;
  const lvl = 1 + Math.floor(Math.sqrt(world.xp / 120));
  if (lvl > world.level) {
    world.level = lvl;
    sfxMissionPass();
    const unlock = { 2: 'DOUBLE JUMP', 4: 'WEB-DASH (F in air)', 6: 'SLOW-MO AIM (airborne)', 8: 'PARKOUR SPRINT' }[lvl];
    showToast(`LEVEL ${lvl}!${unlock ? ' UNLOCKED: ' + unlock : ''}`);
    showNews(`the web-slinger reaches level ${lvl}`);
    saveGame();
  }
}
world.addXP = addXP;

// ---------- achievements ----------

const ACHIEVEMENTS = [
  ['webhead', 'WEBHEAD — 1 km swung', (w) => w.stats.swungM > 1000],
  ['marathon', 'MARATHON — 10 km swung', (w) => w.stats.swungM > 10000],
  ['stylist', 'STYLIST — $200 style cash-out', (w) => w.stats.styleBest >= 200],
  ['tankdown', 'TANK BUSTER — destroy a tank', (w) => w.stats.tanks >= 1],
  ['turfboss', 'TURF BOSS — own the district', (w) => w.gang?.owned],
  ['jackpot', 'LUCKY 7 — hit a jackpot', (w) => w.stats.jackpots >= 1],
  ['veteran', 'VETERAN — reach level 5', (w) => w.level >= 5],
  ['committed', 'COMMITTED — 9 missions passed', (w) => w.stats.missions >= 9],
  ['tycoon', 'TYCOON — hold $10,000', (w) => w.money >= 10000],
  ['cabbie', 'CABBIE — 5 fares delivered', (w) => w.stats.fares >= 5],
  ['collector', 'COLLECTOR — all 20 hidden packages', (w) => w.stats.tokens >= 20],
  ['rivaldown', 'ONLY ONE SPIDER — beat the rival swinger', (w) => (w.stats.rivals | 0) >= 1],
];
world.achTotal = ACHIEVEMENTS.length;
let achT = 0;

function checkAchievements(dt) {
  achT -= dt;
  if (achT > 0) return;
  achT = 2;
  for (const [key, name, test] of ACHIEVEMENTS) {
    if (world.ach[key] || !test(world)) continue;
    world.ach[key] = 1;
    sfxMissionPass();
    showToast('🏆 ' + name);
    showNews('achievement unlocked: ' + name.split(' — ')[0]);
    saveGame();
  }
}

// ---------- melee & dodge ----------

let meleeT = 0;
let combo = 0;
let comboT = 0;

function melee() {
  meleeT = 0.35;
  comboT = 1.1;
  combo = Math.min(3, combo + 1);
  // swing the arm
  player.ch.rArm.rotation.x = -1.8;
  _fwd.set(Math.sin(player.heading), 0, Math.cos(player.heading));
  const reach = 2.4;
  const inRange = (pos) => {
    const dx = pos.x - player.pos.x;
    const dz = pos.z - player.pos.z;
    return dx * dx + dz * dz < reach * reach && (dx * _fwd.x + dz * _fwd.z) > 0;
  };
  let hit = false;
  for (const p2 of world.peds) {
    if (!p2.dead && inRange(p2.pos)) { killPed(world, p2, true); hit = true; break; }
  }
  if (!hit) for (const m of world.gangPeds) {
    if (!m.dead && inRange(m.pos)) { killGangMember(world, m); hit = true; break; }
  }
  if (!hit) for (const tg of world.targets) {
    if (!tg.dead && Math.abs(tg.pos.y + (tg.aimY ?? 0) - player.pos.y - 1) < 2.5 && inRange(tg.pos)) {
      tg.hit(world);
      hit = true;
      break;
    }
  }
  if (!hit) { // punch cars — the symbiote suit dents them hard
    for (const group of [world.traffic, world.parked, world.cops]) {
      for (const v of group) {
        if (v.dead || !inRange(v.pos)) continue;
        v.health -= 12 * combo * (world.perks.melee ?? 1);
        addSparks(v.pos.clone().setY(1), 6);
        sfxCrash(8);
        if (v.health <= 0) {
          if (v.police) copDie(world, v);
          else explodeVehicle(v);
        }
        hit = true;
        break;
      }
      if (hit) break;
    }
  }
  if (hit) {
    sfxCrash(6 + combo * 2);
    addStyle(6 * combo);
    addXP(10);
    if (combo === 3) showToast('COMBO x3!');
  }
}

const lastTap = Object.create(null);

function checkDodge() {
  for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) {
    if (!pressed[k]) continue;
    const now = world.time;
    if (now - (lastTap[k] || -9) < 0.28 && player.onGround && player.dodgeT <= 0) {
      player.dodgeT = 0.6; // i-frames: gunfire misses a rolling target
      _fwd.set(Math.sin(camYaw), 0, Math.cos(camYaw));
      _right.copy(_fwd).cross(UP);
      const dir = k === 'KeyW' ? _fwd : k === 'KeyS' ? _fwd.multiplyScalar(-1)
        : k === 'KeyD' ? _right : _right.multiplyScalar(-1);
      player.vel.x = dir.x * 16;
      player.vel.z = dir.z * 16;
      addStyle(5);
    }
    lastTap[k] = now;
  }
}

// ---------- style meter ----------
// Flashy traversal earns style points; touch the ground to bank them as cash.

function addStyle(n) {
  world.style += n * (world.perks?.style ?? 1);
}

function cashOutStyle() {
  const pts = Math.round(world.style);
  world.style = 0;
  if (pts < 25) return;
  world.money += pts;
  world.stats.styleBest = Math.max(world.stats.styleBest, pts);
  addXP(pts * 0.5);
  showToast(`STYLE BONUS +$${pts}`);
}

// ---------- web attack ----------
// Q fires a glob of webbing that pins a pedestrian, gangster or car in place.

let webAtkT = 0;
const _atkFrom = new THREE.Vector3();

function webAttack() {
  camera.getWorldDirection(_rayDir);
  _rayOrigin.copy(camera.position);
  const RANGE = 45;
  let bestT = RANGE;
  let hitPed = null;
  let hitVeh = null;

  for (const group of [world.peds, world.gangPeds]) {
    for (const p of group) {
      if (p.dead) continue;
      const t = raySphere(_rayOrigin, _rayDir, _sphere.set(p.pos.x, 1.1, p.pos.z), 1.0);
      if (t < bestT) { bestT = t; hitPed = p; hitVeh = null; }
    }
  }
  for (const group of [world.cops, world.traffic, world.tanks]) {
    for (const v of group) {
      if (v.dead || v === player.inCar) continue;
      const t = raySphere(_rayOrigin, _rayDir, _sphere.set(v.pos.x, 0.8, v.pos.z), 2.2);
      if (t < bestT) { bestT = t; hitVeh = v; hitPed = null; }
    }
  }

  // webbable extras (drones love this)
  let hitTgt = null;
  for (const tg of world.targets) {
    if (tg.dead || !tg.webbable) continue;
    const t = raySphere(_rayOrigin, _rayDir, _sphere.set(tg.pos.x, tg.pos.y + (tg.aimY ?? 0), tg.pos.z), tg.r ?? 1);
    if (t < bestT) { bestT = t; hitTgt = tg; hitPed = null; hitVeh = null; }
  }

  sfxWeb();
  if (hitTgt) {
    hitTgt.web();
    addTracer(player.pos.clone().setY(player.pos.y + 1.5), _sphere.set(hitTgt.pos.x, hitTgt.pos.y + (hitTgt.aimY ?? 0), hitTgt.pos.z).clone());
    showToast('WEBBED OUT OF THE SKY!');
    addStyle(20);
    return;
  }
  const tgt = hitPed || hitVeh;
  if (!tgt) return;

  _atkFrom.copy(player.pos);
  _atkFrom.y += 1.5;
  addTracer(_atkFrom.clone(), _sphere.set(tgt.pos.x, 1.1, tgt.pos.z).clone());
  addFlash(_sphere.clone(), 0xffffff, 0.4);

  if (hitPed && hitPed.webT === undefined) hitPed.webT = 0;
  if (hitPed && hitPed.webT > 0) { // web-yank finisher: rip a webbed enemy down
    killPed(world, hitPed, true);
    addStyle(25);
    addXP(10);
    showToast('WEB-YANK!');
    return;
  }
  if (hitPed) {
    hitPed.webT = world.perks?.webDur ?? 6;
    if (!hitPed.webWrap) {
      hitPed.webWrap = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 1.9, 0.9),
        new THREE.MeshBasicMaterial({ color: 0xf2f2ec, transparent: true, opacity: 0.55 })
      );
      hitPed.webWrap.position.y = 0.98;
      hitPed.mesh.add(hitPed.webWrap);
    }
    hitPed.webWrap.visible = true;
    showToast('WEBBED!');
  } else {
    hitVeh.webT = 5;
    hitVeh.vel.set(0, 0, 0);
    showToast(hitVeh.police ? 'COP CAR WEBBED!' : 'CAR WEBBED!');
  }
  addStyle(15);
}

// ---------- web swinging ----------

const _hand = new THREE.Vector3();

function tryStartSwing() {
  if (player.inCar || player.inHeli || web.attached) return false;
  if (!fireWeb(web, player, camera, city.colliders)) return false;
  sfxWeb();
  addFlash(web.anchor.clone(), 0xeeeeee, 0.45);
  setHint(null);
  web.attachT = 0;
  if (!player.onGround) addStyle(15); // mid-air catch
  player.onGround = false;
  player.vel.y = player.vy;
  // launch assist so a standing thwip still turns into a real swing
  const sp = Math.hypot(player.vel.x, player.vel.z);
  if (sp < 12) {
    _fwd.set(Math.sin(camYaw), 0, Math.cos(camYaw));
    player.vel.x += _fwd.x * (12 - sp);
    player.vel.z += _fwd.z * (12 - sp);
  }
  if (!web.used) {
    web.used = true;
    showToast('WEB SWING — hold to swing · SPACE reel in · release to fly');
  }
  return true;
}

function stopSwing() {
  releaseWeb(web);
  const sp = Math.hypot(player.vel.x, player.vel.z);
  // release slingshot: letting go at speed flings you upward like Spidey
  player.vy = player.vel.y + Math.min(5, sp * 0.2);
  player.vel.y = 0;
  player.glide = sp > 8; // carry swing speed = hang in the air
  if (sp > 15) addStyle(sp * 0.6);
}

function updateSwinging(dt) {
  _fwd.set(Math.sin(camYaw), 0, Math.cos(camYaw));
  _right.copy(_fwd).cross(UP);
  _move.set(0, 0, 0);
  if (keys['KeyW']) _move.add(_fwd);
  if (keys['KeyS']) _move.sub(_fwd);
  if (keys['KeyD']) _move.add(_right);
  if (keys['KeyA']) _move.sub(_right);
  if (_move.lengthSq() > 0) _move.normalize();

  const prevY = player.pos.y;
  const px0 = player.pos.x;
  const pz0 = player.pos.z;
  swingStep(web, player.pos, player.vel, dt, {
    move: _move,
    pump: !!keys['KeyW'],
    reelIn: !!keys['Space'],
    reelOut: !!(keys['ShiftLeft'] || keys['ShiftRight']),
  });

  world.stats.swungM += Math.hypot(player.pos.x - px0, player.pos.z - pz0);

  const B = HALF - 1.5;
  player.pos.x = Math.max(-B, Math.min(B, player.pos.x));
  player.pos.z = Math.max(-B, Math.min(B, player.pos.z));

  // slide along walls, losing only the speed that went into them
  const hit = resolveCircle(player.pos, 0.5, city.colliders, player.pos.y + 0.5);
  if (hit) {
    const vn = player.vel.x * hit.nx + player.vel.z * hit.nz;
    if (vn < 0) {
      player.vel.x -= hit.nx * vn;
      player.vel.z -= hit.nz * vn;
    }
  }

  // touch down on the street or a rooftop — a swing landing is a superhero
  // roll, so it's far more forgiving than a plain fall (probe from the
  // pre-step height so fast dives can't pass through a roof)
  const groundY = groundHeight(player.pos, city.colliders, 0.1, Math.max(prevY, player.pos.y));
  if (player.pos.y <= groundY && player.vel.y <= 0) {
    if (player.vel.y < -32) {
      player.health -= (-player.vel.y - 32) * 1.5;
      world.shake = 0.25;
    }
    player.pos.y = groundY;
    player.vy = 0;
    player.vel.y = 0;
    player.onGround = true;
    player.glide = false;
    player.wallT = 3.0;
    releaseWeb(web);
    return;
  }

  // quick tap = zip: reel straight to the anchor point instead of swinging
  web.attachT += dt;
  if (!mouse.rdown && web.attachT < 0.22) {
    web.zip = true;
    return;
  }

  // button released: keep the momentum and fly
  if (!mouse.rdown) {
    stopSwing();
    return;
  }

  // Q: web an enemy mid-swing
  webAtkT -= dt;
  if (pressed['KeyQ'] && webAtkT <= 0) {
    webAtkT = 1.1;
    webAttack();
  }

  // face the direction of travel and lean into the swing
  const sp = Math.hypot(player.vel.x, player.vel.z);
  if (sp > 1) {
    const targetH = Math.atan2(player.vel.x, player.vel.z);
    let diff = targetH - player.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    player.heading += diff * Math.min(1, 8 * dt);
  }
  player.mesh.rotation.y = player.heading;
  player.mesh.rotation.x = Math.min(0.7, sp * 0.03);
  poseSwing(player.ch, world.time);

  _hand.copy(player.pos);
  _hand.y += 2.1;
  updateWebVisual(web, _hand);

  // one hand stays free for the pistol
  shootT -= dt;
  if (mouse.down && shootT <= 0 && (document.pointerLockElement || isTouch)) {
    shootT = WEAPONS[weaponIdx].rate;
    shoot();
  }
}

// Zip line: a tapped web reels the player straight to the anchor point.
const _zipDir = new THREE.Vector3();

function updateZip(dt) {
  _zipDir.subVectors(web.anchor, player.pos);
  _zipDir.y -= 1.6; // aim the chest, not the feet, at the anchor
  const d = _zipDir.length();
  if (d < 4) { // arrived: pop up onto the ledge
    releaseWeb(web);
    player.vy = 5.5;
    player.vel.multiplyScalar(0.25);
    player.vel.y = 0;
    player.glide = true;
    addStyle(10);
    return;
  }
  _zipDir.multiplyScalar(1 / d);
  player.vel.set(_zipDir.x * 34, _zipDir.y * 34, _zipDir.z * 34);
  const prevY = player.pos.y;
  player.pos.addScaledVector(player.vel, dt);

  // zipping downward can't pass through a roof either
  const zg = groundHeight(player.pos, city.colliders, 0.1, Math.max(prevY, player.pos.y));
  if (player.pos.y < zg) {
    player.pos.y = zg;
    releaseWeb(web);
    player.vy = 0;
    player.vel.set(0, 0, 0);
    player.onGround = true;
    return;
  }

  const hit = resolveCircle(player.pos, 0.5, city.colliders, player.pos.y + 0.5);
  if (hit) { // clipped a wall on the way — drop into a glide
    releaseWeb(web);
    player.vy = 2;
    player.vel.multiplyScalar(0.3);
    player.vel.y = 0;
    player.glide = true;
    return;
  }

  player.heading = Math.atan2(_zipDir.x, _zipDir.z);
  player.mesh.rotation.y = player.heading;
  player.mesh.rotation.x = 0.5;
  poseSwing(player.ch, world.time);
  _hand.copy(player.pos);
  _hand.y += 2.1;
  updateWebVisual(web, _hand);
}

// ---------- driving ----------

function updateDriving(dt) {
  const car = player.inCar;
  const ctl = {
    throttle: (keys['KeyW'] ? 1 : 0) + (keys['KeyS'] ? -1 : 0),
    steer: (keys['KeyA'] ? 1 : 0) + (keys['KeyD'] ? -1 : 0),
    handbrake: !!keys['Space'],
  };
  // nitro: hold Shift for a burning speed burst (tank excluded, it's heavy enough)
  player.nitro = player.nitro ?? 100;
  const boosting = (keys['ShiftLeft'] || keys['ShiftRight']) && player.nitro > 1 && ctl.throttle > 0 && !car.tank;
  if (boosting) {
    player.nitro = Math.max(0, player.nitro - 40 * dt);
    _fwd.set(Math.sin(car.heading), 0, Math.cos(car.heading));
    car.vel.addScaledVector(_fwd, 15 * dt);
    car.nitroFxT = (car.nitroFxT || 0) - dt;
    if (car.nitroFxT <= 0) {
      car.nitroFxT = 0.06;
      addFlash(car.pos.clone().add(new THREE.Vector3(-_fwd.x * 2.1, 0.55, -_fwd.z * 2.1)), 0x66aaff, 0.5);
    }
    addStyle(4 * dt);
  } else {
    player.nitro = Math.min(100, player.nitro + 9 * dt);
  }

  const impact = physStep(car, ctl, dt, city.colliders);
  checkRamp(stuntsState, world, car, dt); // stunt ramps launch fast cars
  if (impact > 8) {
    addFlash(car.pos.clone().setY(1), 0xffcc66, 1.2);
    addSparks(car.pos.clone().setY(0.7), 10);
    sfxCrash(impact);
    world.shake = Math.min(0.5, impact * 0.03);
  }
  setEngine(car.vel.length());

  // tyre smoke + rubber stripes while drifting
  if (ctl.handbrake && car.vel.length() > 9) {
    car.skidT = (car.skidT || 0) - dt;
    if (car.skidT <= 0) {
      car.skidT = 0.06;
      const back = car.pos.clone().add(new THREE.Vector3(-Math.sin(car.heading) * 1.6, 0.3, -Math.cos(car.heading) * 1.6));
      back.x += (Math.random() - 0.5) * 1.4;
      back.z += (Math.random() - 0.5) * 1.4;
      addSmoke(back, 0.55);
      const side = new THREE.Vector3(Math.cos(car.heading), 0, -Math.sin(car.heading));
      addSkid(car.pos.clone().addScaledVector(side, 0.85), car.heading);
      addSkid(car.pos.clone().addScaledVector(side, -0.85), car.heading);
    }
  }

  // radio
  if (pressed['KeyR']) {
    world.radioSt = (world.radioSt + 1) % RADIO_STATIONS.length;
    setRadioStation(world.radioSt);
    showToast(RADIO_STATIONS[world.radioSt]);
  }

  // tank cannon: left click lobs a shell where you're looking
  if (car.tank) {
    car.shootT = (car.shootT || 0) - dt;
    if (mouse.down && car.shootT <= 0 && (document.pointerLockElement || isTouch)) {
      car.shootT = 1.3;
      camera.getWorldDirection(_rayDir);
      sfxShot('rpg');
      fireRocket(car.pos.clone().setY(2.1));
      world.shake = 0.3;
      if (world.wanted === 0) addCrime(world, 1);
    }
  }

  for (const t of world.traffic) {
    if (t.dead) continue;
    const imp = separateCars(car, t, false);
    if (imp > 5) {
      car.health -= (imp - 5) * 1.4;
      t.health -= imp * 2.5;
      sfxCrash(imp);
      world.shake = Math.min(0.5, imp * 0.025);
      if (t.health <= 0 && !t.dead) explodeVehicle(t);
      else if (imp > 8) disableTraffic(t);
    }
  }
  for (const p of world.parked) {
    const imp = separateCars(car, p, false);
    if (imp > 5) {
      car.health -= (imp - 5) * 1.2;
      p.health -= imp * 2;
      sfxCrash(imp);
      world.shake = Math.min(0.5, imp * 0.025);
      if (p.health <= 0 && !p.dead) explodeVehicle(p);
    }
  }

  if (car.health < 45 && !car.dead) {
    car.smokeT -= dt;
    if (car.smokeT <= 0) {
      car.smokeT = 0.12;
      addSmoke(car.pos.clone().add(new THREE.Vector3(Math.sin(car.heading) * 1.8, 0.9, Math.cos(car.heading) * 1.8)));
    }
  }

  if (car.health <= 0 && !car.dead) {
    explodeVehicle(car);
    player.health -= 55;
    exitCar();
    return;
  }

  if (pressed['KeyE']) {
    if (car.vel.length() < 5) exitCar();
    else showToast('Slow down to exit!');
  }
}

// ---------- flying ----------

function updateFlying(dt) {
  const h = player.inHeli;
  const ctl = {
    fwd: (keys['KeyW'] ? 1 : 0) + (keys['KeyS'] ? -1 : 0),
    yaw: (keys['KeyA'] ? 1 : 0) + (keys['KeyD'] ? -1 : 0),
    // Space wins over Shift, so a held-over sprint key can't pin you to the ground
    up: keys['Space'] ? 1 : keys['ShiftLeft'] || keys['ShiftRight'] ? -1 : 0,
  };
  physStepHeli(h, ctl, dt, city.colliders);

  if (h.health < 45 && !h.dead) {
    h.smokeT -= dt;
    if (h.smokeT <= 0) {
      h.smokeT = 0.1;
      addSmoke(h.pos.clone().add(new THREE.Vector3(0, 2, -3)), 1);
    }
  }

  if (h.health <= 0 && !h.dead) {
    explodeHeli(world, h, false);
    player.health -= 100;
    exitHeli();
    return;
  }

  if (pressed['KeyE']) {
    // "landed" is relative to what's underneath — rooftops count
    if (h.pos.y - groundHeight(h.pos, city.colliders, 0.3, h.pos.y) < 2.2) exitHeli();
    else showToast('Land first!');
  }
}

// idle helis: rotors wind down; dead ones fall
function updateHelis(dt) {
  for (let i = world.helis.length - 1; i >= 0; i--) {
    const h = world.helis[i];
    if (h.dead) {
      if (h === player.inHeli) continue;
      if (updateFallingHeli(world, h, dt)) world.helis.splice(i, 1);
      continue;
    }
    if (h === player.inHeli) continue;
    h.rotorSpeed = Math.max(0, h.rotorSpeed - dt * 0.25);
    spinRotors(h, dt);
  }

  // respawn a fresh helicopter on a free pad
  if (world.helis.length < city.helipads.length) {
    heliRespawnT += dt;
    if (heliRespawnT > 20) {
      heliRespawnT = 0;
      for (const pad of city.helipads) {
        const taken = world.helis.some((h) => Math.hypot(h.pos.x - pad.x, h.pos.z - pad.z) < 10);
        if (!taken) {
          world.helis.push(makeHeli(scene, pad.x, pad.y, pad.z, Math.random() * Math.PI * 2, false));
          break;
        }
      }
    }
  }
}

function explodeVehicle(v) {
  v.dead = true;
  v.ai = null;
  v.vel.set(0, 0, 0);
  addExplosion(v.pos);
  darkenCar(v);
  if (world.rampageT > 0) {
    world.rampageCount++;
    world.money += 150;
    showToast(`RAMPAGE x${world.rampageCount} +$150`);
  }
  if (!player.inCar) {
    const d = Math.hypot(v.pos.x - player.pos.x, v.pos.z - player.pos.z);
    if (d < 6) player.health -= (6 - d) * 12;
  }
  world.shake = 0.4;
}

// ---------- shooting ----------

const _rayDir = new THREE.Vector3();
const _rayOrigin = new THREE.Vector3();
const _hitPoint = new THREE.Vector3();
const _toTarget = new THREE.Vector3();
const _sphere = new THREE.Vector3();

function raySphere(origin, dir, center, radius) {
  _toTarget.subVectors(center, origin);
  const t = _toTarget.dot(dir);
  if (t < 0) return Infinity;
  const d2 = _toTarget.lengthSq() - t * t;
  if (d2 > radius * radius) return Infinity;
  return t - Math.sqrt(radius * radius - d2);
}

function shoot() {
  const w = WEAPONS[weaponIdx];
  if (w.ammo && world.rampageT <= 0) { // rampage = unlimited everything
    if (ammo[w.ammo] <= 0) {
      showToast('OUT OF AMMO — grab a yellow crate');
      switchWeapon(0);
      return;
    }
    ammo[w.ammo]--;
  }
  camera.getWorldDirection(_rayDir);
  sfxShot(w.sfx);
  world.lastShot = { pos: player.pos.clone(), t: world.time };
  if (world.wanted === 0) addCrime(world, 1);

  if (w.rocket) {
    fireRocket();
    return;
  }

  _rayDir.x += (Math.random() - 0.5) * w.spread * 2;
  _rayDir.y += (Math.random() - 0.5) * w.spread * 2;
  _rayDir.z += (Math.random() - 0.5) * w.spread * 2;
  _rayDir.normalize();
  _rayOrigin.copy(camera.position);

  const RANGE = 80;
  let bestT = RANGE;
  let hitPed = null;
  let hitGang = null;
  let hitVeh = null;
  let hitHeli = null;

  for (const p of world.peds) {
    if (p.dead) continue;
    const t = raySphere(_rayOrigin, _rayDir, _sphere.set(p.pos.x, 1.1, p.pos.z), 0.85);
    if (t < bestT) { bestT = t; hitPed = p; hitGang = null; hitVeh = null; hitHeli = null; }
  }
  for (const p of world.gangPeds) {
    if (p.dead) continue;
    const t = raySphere(_rayOrigin, _rayDir, _sphere.set(p.pos.x, 1.1, p.pos.z), 0.9);
    if (t < bestT) { bestT = t; hitGang = p; hitPed = null; hitVeh = null; hitHeli = null; }
  }
  for (const group of [world.cops, world.traffic, world.parked, world.tanks]) {
    for (const v of group) {
      if (v.dead) continue;
      const t = raySphere(_rayOrigin, _rayDir, _sphere.set(v.pos.x, 0.8, v.pos.z), v.tank ? 2.8 : 2.0);
      if (t < bestT) { bestT = t; hitVeh = v; hitPed = null; hitGang = null; hitHeli = null; }
    }
  }
  for (const group of [world.policeHelis, world.helis]) {
    for (const h of group) {
      if (h.dead) continue;
      const t = raySphere(_rayOrigin, _rayDir, _sphere.set(h.pos.x, h.pos.y + 1.8, h.pos.z), 3.2);
      if (t < bestT) { bestT = t; hitHeli = h; hitPed = null; hitGang = null; hitVeh = null; }
    }
  }
  // unified extras: SWAT, drones, bounty hunters, rooftop marks
  let hitTarget = null;
  for (const tg of world.targets) {
    if (tg.dead) continue;
    const t = raySphere(_rayOrigin, _rayDir, _sphere.set(tg.pos.x, tg.pos.y + (tg.aimY ?? 0), tg.pos.z), tg.r ?? 1);
    if (t < bestT) { bestT = t; hitTarget = tg; hitPed = null; hitGang = null; hitVeh = null; hitHeli = null; }
  }

  _hitPoint.copy(_rayOrigin).addScaledVector(_rayDir, bestT);
  const muzzle = player.pos.clone();
  muzzle.y += 1.4;
  addTracer(muzzle, _hitPoint.clone());
  addFlash(_hitPoint.clone(), 0xffd080, 0.35);

  if (hitPed) {
    killPed(world, hitPed, true);
  } else if (hitGang) {
    killGangMember(world, hitGang); // gang war, no heat
  } else if (hitVeh) {
    hitVeh.health -= w.dmg;
    if (hitVeh.health <= 0) {
      if (hitVeh.tank) killTank(world, hitVeh);
      else if (hitVeh.police) copDie(world, hitVeh);
      else explodeVehicle(hitVeh);
    } else if (hitVeh.ai && !hitVeh.police) {
      disableTraffic(hitVeh);
    }
  } else if (hitHeli) {
    hitHeli.health -= w.dmg;
    if (hitHeli.health <= 0) explodeHeli(world, hitHeli, true);
  } else if (hitTarget) {
    hitTarget.hit(world);
  }
}

function fireRocket(origin) {
  const mesh = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 0.9, 6),
    new THREE.MeshLambertMaterial({ color: 0x4a4a3a })
  );
  body.rotation.x = Math.PI / 2;
  mesh.add(body);
  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(0.13, 0.3, 6),
    new THREE.MeshLambertMaterial({ color: 0x802222 })
  );
  tip.rotation.x = Math.PI / 2;
  tip.position.z = 0.55;
  mesh.add(tip);

  const dir = _rayDir.clone();
  const pos = origin ? origin.clone() : player.pos.clone();
  if (!origin) pos.y = player.pos.y + 1.5;
  pos.addScaledVector(dir, origin ? 3.2 : 1.4);
  mesh.position.copy(pos);
  mesh.lookAt(pos.clone().add(dir));
  scene.add(mesh);
  rockets.push({ mesh, pos: mesh.position, dir, t: 0, smokeT: 0 });
}

function updateRockets(dt) {
  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i];
    r.t += dt;
    r.pos.addScaledVector(r.dir, 62 * dt);
    r.smokeT -= dt;
    if (r.smokeT <= 0) {
      r.smokeT = 0.03;
      addSmoke(r.pos.clone(), 0.45);
    }

    let boom = r.t > 4 || r.pos.y <= 0.15 || pointBlocked(r.pos, city.colliders);
    if (!boom) {
      for (const group of [world.cops, world.traffic, world.parked, world.tanks]) {
        for (const v of group) {
          if (v === player.inCar) continue;
          if (!v.dead && Math.hypot(v.pos.x - r.pos.x, v.pos.z - r.pos.z) < 2.6 && r.pos.y < 4) { boom = true; break; }
        }
        if (boom) break;
      }
    }
    if (!boom) {
      for (const group of [world.policeHelis, world.helis]) {
        for (const h of group) {
          if (h === player.inHeli || h.dead) continue;
          if (r.pos.distanceTo(_sphere.set(h.pos.x, h.pos.y + 1.8, h.pos.z)) < 4) { boom = true; break; }
        }
        if (boom) break;
      }
    }

    if (boom) {
      explodeRocket(r.pos);
      scene.remove(r.mesh);
      rockets.splice(i, 1);
    }
  }
}

function explodeRocket(pos) {
  addExplosion(pos);
  world.shake = 0.5;

  for (const group of [world.cops, world.traffic, world.parked, world.tanks]) {
    for (const v of group) {
      if (v.dead || v === player.inCar) continue;
      const d = Math.hypot(v.pos.x - pos.x, v.pos.z - pos.z) + Math.abs(pos.y - 1);
      if (d < 9) {
        v.health -= (9 - d) * (v.tank ? 14 : 25);
        if (v.health <= 0) {
          if (v.tank) killTank(world, v);
          else if (v.police) copDie(world, v);
          else explodeVehicle(v);
        }
      }
    }
  }
  for (const group of [world.policeHelis, world.helis]) {
    for (const h of group) {
      if (h.dead || h === player.inHeli) continue;
      const d = pos.distanceTo(_sphere.set(h.pos.x, h.pos.y + 1.8, h.pos.z));
      if (d < 9) {
        h.health -= (9 - d) * 30;
        if (h.health <= 0) explodeHeli(world, h, true);
      }
    }
  }
  for (const p of world.peds) {
    if (!p.dead && Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z) < 6 && pos.y < 5) killPed(world, p, true);
  }
  for (const p of world.gangPeds) {
    if (!p.dead && Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z) < 6 && pos.y < 5) killGangMember(world, p);
  }
  for (const tg of world.targets) {
    if (tg.dead) continue;
    if (Math.hypot(tg.pos.x - pos.x, tg.pos.z - pos.z) < 7 && Math.abs(tg.pos.y + (tg.aimY ?? 0) - pos.y) < 9) tg.hit(world);
  }
  if (!player.inCar && !player.inHeli) {
    const d = player.pos.distanceTo(pos);
    if (d < 7) player.health -= (7 - d) * 14;
  }
  if (player.inCar) {
    const d = player.inCar.pos.distanceTo(pos);
    if (d < 7) player.inCar.health -= (7 - d) * 12;
  }
}

// ---------- death / arrest ----------

let gameState = 'start'; // start | play | over
let overTimer = 0;

function triggerOver(text, color) {
  gameState = 'over';
  overTimer = 3.2;
  showBanner(text, color);
  failMission(world, text === 'WASTED' ? 'You got wasted' : 'You got busted');
  engine.stop();
  rotor.stop();
  setRadioStation(0);
  world.style = 0;
  world.slowmoT = 1.1; // brief slow motion as you go down
  renderer.domElement.style.filter = 'grayscale(0.85)';
  if (text === 'WASTED' && !player.inCar && !player.inHeli) {
    // keel over like the peds do
    player.mesh.rotation.z = Math.PI / 2;
    player.mesh.position.y = player.pos.y + 0.25;
  }
}

function respawn() {
  hideBanner();
  renderer.domElement.style.filter = '';
  if (player.inCar) {
    player.inCar.vel.set(0, 0, 0);
    if (!player.inCar.dead && !player.inCar.tank) world.parked.push(player.inCar);
    player.inCar = null;
  }
  if (player.inHeli) {
    player.inHeli.vel.set(0, 0, 0);
    player.inHeli = null;
  }
  releaseWeb(web);
  player.glide = false;
  player.mesh.rotation.x = 0;
  player.mesh.rotation.z = 0;
  player.mesh.visible = true;
  player.pos.copy(city.spawn).add(new THREE.Vector3(3, 0, 3));
  player.pos.y = 0;
  player.vel.set(0, 0, 0);
  player.vy = 0;
  player.health = world.maxHealth;
  world.style = 0;
  world.wanted = 0;
  world.wantedTimer = 0;
  world.busted = false;
  world.bustedT = 0;
  clearCops(world);
  for (const h of world.policeHelis) scene.remove(h.mesh);
  world.policeHelis.length = 0;
  camYaw = 0;
  ensureGarageVehicle(shopsState, world); // your garaged ride comes back
  gameState = 'play';
}

// ---------- start screen / pointer lock ----------

const startEl = document.getElementById('start');
document.getElementById('playbtn').addEventListener('click', () => {
  startEl.style.display = 'none';
  initSound();
  siren.start();
  rainAmb.start();
  cityHum.start();
  chase.start();
  applySettings();
  if (gameState === 'start') gameState = 'play';
  if (!isTouch) renderer.domElement.requestPointerLock?.();
  else goFullscreen(); // phones: immersive landscape
  showTouchUI(true);
});
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && !isTouch && gameState === 'play') pauseGame();
});

// ---------- main loop ----------

const clock = new THREE.Clock();

function updateSiren() {
  let nearest = Infinity;
  const focus = player.inHeli ? player.inHeli.pos : player.inCar ? player.inCar.pos : player.pos;
  for (const cop of world.cops) {
    if (cop.dead) continue;
    const d = Math.hypot(cop.pos.x - focus.x, cop.pos.z - focus.z);
    if (d < nearest) nearest = d;
  }
  setSiren(nearest === Infinity ? 0 : Math.max(0, 1 - nearest / 140));
}

const heliHooks = { onShot: () => sfxShot('mg') };
const armyHooks = { boom: (pos) => explodeRocket(pos) };

let prevHealth = 100;
let saveT = 0;

function update(dt) {
  world.time += dt;

  // day/night cycle: 1 real minute = 1 game hour
  world.clock = (world.clock + dt / 60) % 24;
  const dn = applyDayNight(world.clock, { scene, sun, hemi, sky, camera, city });
  world.sunDir.copy(dn.sunDir);

  // weather: rain dims the sky and thickens the fog; lightning washes the scene
  const wx = updateWeather(weather, dt, camera);
  if (wx.intensity > 0.01) {
    const r = wx.intensity;
    scene.fog.near *= 1 - r * 0.45;
    scene.fog.far *= 1 - r * 0.5;
    sun.intensity *= 1 - r * 0.6;
    hemi.intensity *= 1 - r * 0.25;
    sky.uniforms.topColor.value.multiplyScalar(1 - r * 0.4);
    sky.uniforms.horizonColor.value.multiplyScalar(1 - r * 0.35);
    sky.uniforms.sunHaze.value *= 1 - r * 0.7;
    sky.stars.material.opacity *= 1 - r;
  }
  if (wx.flash > 0.01) {
    hemi.intensity += wx.flash * 1.8;
    sun.intensity += wx.flash * 0.8;
  }

  // bloom breathes with the night: stronger glow when the city lights are on
  bloom.strength = world.settings.lowGfx ? 0 : 0.22 + dn.glow * 0.33;

  // headlights when driving after dark
  const pcar = player.inCar;
  if (pcar && !pcar.dead && (dn.glow > 0.35 || wx.intensity > 0.4)) {
    const fx = Math.sin(pcar.heading);
    const fz = Math.cos(pcar.heading);
    headlight.position.set(pcar.pos.x + fx * 2.2, 1.0, pcar.pos.z + fz * 2.2);
    headlight.target.position.set(pcar.pos.x + fx * 32, 0.2, pcar.pos.z + fz * 32);
    headlight.intensity = 300;
  } else {
    headlight.intensity = 0;
  }

  // hurt feedback
  if (player.health < prevHealth - 0.5) {
    world.damageFlash = Math.min(1, world.damageFlash + (prevHealth - player.health) * 0.03 + 0.25);
    vibrate(Math.min(120, (prevHealth - player.health) * 6)); // phone buzzes when hurt
  }
  prevHealth = player.health;
  world.damageFlash = Math.max(0, world.damageFlash - dt * 1.6);

  // weapon HUD label with live ammo count
  const wpn = WEAPONS[weaponIdx];
  world.weaponName = wpn.ammo ? `${wpn.name} · ${ammo[wpn.ammo]}` : wpn.name;

  // autosave every 10s
  saveT += dt;
  if (saveT > 10) { saveT = 0; saveGame(); }

  if (gameState === 'over') {
    overTimer -= dt;
    if (overTimer <= 0) respawn();
    updateEffects(dt);
    updateCamera(dt);
    updateHUD(world);
    return;
  }

  if (player.inHeli) updateFlying(dt);
  else if (player.inCar) updateDriving(dt);
  else if (web.zip) updateZip(dt);
  else if (web.attached) updateSwinging(dt);
  else updateOnFoot(dt);

  updatePeds(world, dt);
  updateTraffic(world, dt);
  updatePolice(world, dt);
  updatePoliceHelis(world, dt, heliHooks);
  updateHelis(dt);
  updateRockets(dt);
  updatePickups(dt);
  updateMissions(world, dt);
  updateShops(shopsState, world, dt, keys, pressed);
  updateGang(world, dt);
  updateArmy(world, dt, armyHooks);
  updateAmbient(flocks, world, dt);
  updateStunts(stuntsState, world, dt);
  updateEffects(dt);

  // ambience follows the clock
  const hum = world.clock > 6.5 && world.clock < 21.5 ? 1 : 0.55;
  if (hum !== world._hum) { world._hum = hum; setHum(hum); }
  if (player.inCar || player.inHeli || web.attached || web.zip) chuteMesh.visible = false;

  // chase music swells with the heat
  if (world.wanted !== world._chase) { world._chase = world.wanted; setChase(world.wanted / 5); }

  // NPC speech bubbles: project into screen space for the HUD
  for (let i = world.barks.length - 1; i >= 0; i--) {
    const b = world.barks[i];
    b.t -= dt;
    if (b.t <= 0) { world.barks.splice(i, 1); continue; }
    _sphere.set(b.pos.x, (b.pos.y || 0) + 2.4, b.pos.z).project(camera);
    b.sx = (_sphere.x * 0.5 + 0.5) * window.innerWidth;
    b.sy = (-_sphere.y * 0.5 + 0.5) * window.innerHeight;
    if (_sphere.z > 1) b.sy = -999; // behind the camera
  }

  // waypoint arrival
  if (world.waypoint) {
    wpMarker.rotation.y += dt;
    if (Math.hypot(player.pos.x - world.waypoint.x, player.pos.z - world.waypoint.z) < 6) {
      world.waypoint = null;
      wpMarker.visible = false;
      showToast('WAYPOINT REACHED');
    }
  }

  checkAchievements(dt);

  // pause / big map / screenshot
  if (pressed['KeyP']) pauseGame();
  if (pressed['KeyM']) openBigMap();
  if (pressed['KeyG']) world.captureNext = true;

  // phones get 1-4 buttons while standing at a kiosk
  if (isTouch && world.nearKiosk !== world._kioskUi) {
    world._kioskUi = world.nearKiosk;
    showKioskButtons(world.nearKiosk);
  }
  updateCamera(dt);
  updateSiren();
  updateHUD(world);

  if (player.health <= 0) triggerOver('WASTED', '#c0392b');
  else if (world.busted) triggerOver('BUSTED', '#4a8cff');
}

let introT = 0;
const _introFrom = new THREE.Vector3(HALF * 0.55, 130, HALF * 0.55);
const _introTo = new THREE.Vector3();

function animate() {
  requestAnimationFrame(animate);
  pollGamepad();
  let dt = Math.min(clock.getDelta(), 0.05);

  // dramatic slow-mo: dying, or the level-6 airborne aim skill
  if (world.slowmoT > 0) {
    world.slowmoT -= dt;
    dt *= 0.35;
  } else if (world.level >= 6 && gameState === 'play' &&
      !player.onGround && !player.inCar && !player.inHeli && mouse.down && player.pos.y > 3) {
    dt *= 0.45;
  }

  if (gameState === 'start') {
    // slow flyover of the skyline behind the menu
    introT += dt * 0.05;
    const t = Math.min(1, introT);
    _introTo.set(city.spawn.x + 20, 26, city.spawn.z + 46);
    camera.position.lerpVectors(_introFrom, _introTo, t * (2 - t));
    camera.lookAt(city.spawn.x, 8, city.spawn.z);
  } else if (gameState === 'photo') {
    updatePhoto(dt);
  } else if (gameState === 'map') {
    drawBigMap(world);
    if (pressed['KeyM'] || pressed['Escape']) closeBigMap();
  } else if (gameState === 'pause') {
    // frozen — menu handles everything
  } else {
    update(dt);
  }
  composer.render();
  if (world.captureNext) {
    world.captureNext = false;
    grabCanvas(renderer.domElement).then((b) => saveOrShare(b, 'open-city-photo.png'));
    showToast('📸 PHOTO SAVED');
    vibrate(30);
  }
  endFrame();
}

animate();

// debug handle for automated testing
window.__debug = {
  world,
  player,
  mission,
  weather,
  ammo,
  web,
  startSwing: tryStartSwing,
  stopSwing,
  webAttack,
  gang,
  shops: shopsState,
  flocks,
  stunts: stuntsState,
  addXP,
  melee,
  pauseGame,
  openBigMap,
  getSuit: () => world.suit,
  snapPhoto: () => { world.captureNext = true; },
  getCamYaw: () => camYaw,
  setCamYaw: (v) => { camYaw = v; },
  setCamPitch: (v) => { camPitch = v; },
  getState: () => gameState,
  setClock: (h) => { world.clock = h; },
};
