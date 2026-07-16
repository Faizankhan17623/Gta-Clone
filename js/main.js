import * as THREE from 'three';
import { initInput, endFrame, pollGamepad, keys, pressed, mouse } from './input.js';
import { buildCity, resolveCircle, pointBlocked, groundHeight, blockStart, BLOCK, HALF, N } from './city.js';
import { createCharacter, animateWalk, animateIdle, animateLand, CHARACTERS } from './characters.js';
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
import { buildLandmarks, updateLandmarks } from './landmarks.js';
import { initWeb, fireWeb, releaseWeb, swingStep, updateWebVisual, poseSwing, poseFall } from './web.js';
import { initShops, updateShops, ensureGarageVehicle, garageCheck } from './shops.js';
import { initTouch, isTouch, showTouchUI, showKioskButtons, showContextButtons } from './touch.js';
import { initMenu, openMenu, closeMenu, openMap, closeMap, drawBigMap } from './menu.js';
import { vibrate, goFullscreen, keepAwake, grabCanvas, saveOrShare, openCamera, closeCamera, cameraSupported } from './device.js';
import { initStunts, updateStunts, placeTrampoline, tryBounce, checkRamp, bounceFx } from './stunts.js';
import { initGang, updateGang, killGangMember } from './gangs.js';
import { updateArmy, killTank } from './army.js';
import { initAmbient, updateAmbient } from './ambient.js';
import { initArena, updateArena, endArena } from './arena.js';
import { initEconomy, updateEconomy, addChaos, resetChaos, trackDaily, newDay } from './economy.js';
import { showInterstitial } from './ads.js';
import { initRaces, updateRaces, endRace } from './races.js';
import { initWater, updateWater, physStepBoat, inWater, WATER_Y } from './water.js';
import { initDog, updateDog } from './dog.js';
import { initHeist, updateHeist, failHeist } from './heist.js';
import { initTurfWar, updateTurfWar } from './turfwar.js';
import { initBlackjack, openBlackjack } from './blackjack.js';
import { initVigilante, updateVigilante, endVigilante } from './vigilante.js';
import { initArmored, updateArmored } from './armored.js';
import { initSlots, openSlots } from './slots.js';
import { initRoulette, openRoulette } from './roulette.js';
import { initPropRaids, updatePropRaids } from './propraid.js';
import { initJetpack, updateJetpackPad, updateJetpack } from './jetpack.js';
import { initAmbulance, updateAmbulance } from './ambulance.js';
import { initExport, updateExport } from './export.js';
import { initBounty, updateBounty } from './bounty.js';
import { initBaseJump, updateBaseJump } from './basejump.js';
import { initHoops, updateHoops } from './hoops.js';
import { initUfo, updateUfo } from './ufo.js';
import { initLottery, updateLottery } from './lottery.js';
import { initFightClub, updateFightClub, endFightClub } from './fightclub.js';
import { initPoker, openPoker } from './poker.js';
import { initLegend, openLegend, updateLegend, forceCrown, initFable } from './legend.js';
import { initCheats } from './cheats.js';
import { initFinale, updateFinale, endFinale } from './finale.js';
import { initNemesis, updateNemesis, forceNemesis, endNemesisFight } from './nemesis.js';
import { initZombies, updateZombies, startOutbreak, endOutbreak } from './zombies.js';
import { initTrain, updateTrain, endTrainHeist } from './train.js';
import { initDisasters, updateDisasters, forceDisaster } from './disasters.js';
import { initPrison, updatePrison, prisonIntake } from './prison.js';
import { initMyths, updateMyths } from './myths.js';
import { initStranger, updateStranger } from './stranger.js';
import { initCasinoHeist, updateCasinoHeist, endCasinoHeist } from './casinoheist.js';
import { initDerby, updateDerby, tryStartDerby, abortDerby } from './derby.js';
import { initPlane, updatePlaneFlight, updatePlaneDock } from './plane.js';
import { initEmpire, updateEmpire, tryEmpireTakeover, endEmpireFights } from './empire.js';
import { initDiving, updateDivingShack, updateDive } from './diving.js';
import { initPaparazzi, updatePaparazzi } from './paparazzi.js';
import { initMayor, updateMayor } from './mayor.js';
import { initPrestige, updatePrestige } from './prestige.js';
import { initGauntlet, updateGauntlet, endGauntlet } from './gauntlet.js';
import { initSwingRaces, updateSwingRaces, endSwingRace } from './swingrace.js';
import { initFirefight, updateFirefight, forceFireEvent } from './firefight.js';
import { initMuseum, updateMuseum, endMuseum } from './museum.js';
import { initKaiju, updateKaiju, forceKaiju } from './kaiju.js';
import { initSyndicate, updateSyndicate, endSyndicate } from './syndicate.js';
import { initSkydive, updateSkydivePad, updateSkydive, bailFromPlane } from './skydive.js';
import { initTournament, updateTournament, abortTournament } from './tournament.js';
import { initCrew, updateCrew } from './crew.js';
import { initContracts, updateContracts, endContract } from './contracts.js';
import { initSubway, updateSubway } from './subway.js';
import { initBusking, updateBusking, abortBusking } from './busking.js';
import { initWorkbench, updateWorkbench } from './workbench.js';
import { initStormChaser, updateStormChaser } from './stormchaser.js';
import { initFerry, updateFerry } from './ferry.js';
import { initZipline, updateZipline } from './zipline.js';
import { initBalloon, updateBalloonPad, updateBalloon } from './balloon.js';
import { initDrone, updateDronePad, updateDrone } from './drone.js';
import { initTaxi, updateTaxi } from './taxi.js';
import { initValet, updateValet } from './valet.js';
import { initCarwash, updateCarwash } from './carwash.js';
import { initBarber, updateBarber } from './barber.js';
import { initArmsdealer, updateArmsdealer } from './armsdealer.js';
import { initDruglab, updateDruglab, endDruglab } from './druglab.js';
import { initFishing, updateFishing } from './fishing.js';
import { initNightclub, updateNightclub } from './nightclub.js';
import { initSkateboard, updateSkateboard } from './skateboard.js';
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
const landmarks = buildLandmarks(scene, city);
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

// chosen playable character (saved between sessions)
const charDef = CHARACTERS.find((c) => c.key === save.char) || CHARACTERS[0];
const playerChar = createCharacter(charDef.colors);
scene.add(playerChar.group);

const player = {
  ch: playerChar,
  mesh: playerChar.group,
  pos: playerChar.group.position,
  vel: new THREE.Vector3(),
  heading: 0,
  health: charDef.health,
  charDef,
  inCar: null,
  inHeli: null,
  inBoat: null,
  inPlane: null,
  swim: false,
  animT: 0,
  vy: 0,
  onGround: true,
  glide: false, // floaty hang-time after releasing a swing
  wallT: 3,     // wall-run stamina (~22m of vertical sprint)
  dodgeT: 0,    // dodge-roll i-frames
  landT: 0,     // landing-crouch timer
};
player.pos.copy(city.spawn);

const world = {
  scene,
  city,
  player,
  peds: spawnPeds(scene, city, 100),   // more life for the bigger city
  traffic: spawnTraffic(scene, city, 28),
  parked: spawnParked(scene, 38),
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
  maxHealth: charDef.health,
  charKey: charDef.key,
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
const shopsState = initShops(scene, world, save.upg, save.mods);
const gang = initGang(scene, world, save.gang);
const flocks = initAmbient(scene);
const stuntsState = initStunts(scene, world);
ensureGarageVehicle(shopsState, world);
world.mapRamps = stuntsState.ramps;
world.mapSkulls = stuntsState.skulls;

// meta systems: properties/rep/dailies, the stadium arena, races, the harbor
world.cityFns = { blockStart, BLOCK };
initEconomy(scene, world, save);
initArena(scene, world, save);
const racesState = initRaces(scene, world, save);
const waterState = initWater(scene, world);
initDog(scene, world, save);
initHeist(scene, world, save);
initTurfWar(scene, world);
initVigilante(world, save);
initArmored(world);
initBlackjack({ onClose: leaveCards, onSlots: () => openSlots(world), onRoulette: () => openRoulette(world), onPoker: () => openPoker(world) });
initSlots({ onClose: leaveCards, onTable: () => openBlackjack(world), onRoulette: () => openRoulette(world) });
initRoulette({ onClose: leaveCards, onTable: () => openBlackjack(world), onSlots: () => openSlots(world) });
initPoker({ onClose: leaveCards, onTable: () => openBlackjack(world) });
initPropRaids(scene, world);
initJetpack(scene, world, save);
initAmbulance(scene, world);
initExport(scene, world, save);
initBounty(scene, world);
initBaseJump(scene, world);
initHoops(scene, world, save);
initUfo(scene, world);
initLottery(scene, world, save);
initFightClub(scene, world);
initLegend({ onClose: leaveCards, saveKey: SAVE_KEY }, world, save);
initFable(scene, world, save);
initFinale({
  freeze: () => { gameState = 'cards'; showTouchUI(false); document.exitPointerLock?.(); },
  unfreeze: leaveCards,
}, scene, world, save);
initPrestige(scene, world, save, { saveKey: SAVE_KEY }); // first: NG+ difficulty feeds the rest
initNemesis(scene, world, save);
initZombies(scene, world);
initTrain(scene, world);
initDisasters(scene, world);
initPrison(scene, world);
initMyths(scene, world, save);
initStranger(scene, world, save);
initCasinoHeist(scene, world, save);
initDerby(scene, world);
initPlane(scene, world);
initEmpire(scene, world, save);
initDiving(scene, world, save);
initPaparazzi(scene, world);
initMayor(scene, world, save);
initGauntlet(scene, world);
initSwingRaces(scene, world, save);
initFirefight(scene, world);
initMuseum(scene, world, save);
initFishing(scene, world);
initNightclub(scene, world, save);
initSkateboard(scene, world, save);
initKaiju(scene, world);
initSyndicate(scene, world, save);
initSkydive(scene, world);
initTournament(scene, world, save);
initCrew(scene, world, save);
initContracts(scene, world, save);
initSubway(scene, world);
initBusking(scene, world, save);
initWorkbench(scene, world, save);
initStormChaser(scene, world, save);
initFerry(scene, world);
initZipline(scene, world);
initBalloon(scene, world);
initDrone(scene, world);
initTaxi(world);
initValet(scene, world);
initCarwash(scene, world);
initBarber(scene, world, save);
initArmsdealer(scene, world);
initDruglab(scene, world, save);
initCheats({
  cash: () => { world.money += 10000; },
  clear: () => { world.wanted = 0; world.wantedTimer = 0; clearCops(world); },
  boom: () => {
    for (const group of [world.traffic, world.parked]) {
      for (const v of group) {
        if (v.dead || v === player.inCar) continue;
        if (Math.hypot(v.pos.x - player.pos.x, v.pos.z - player.pos.z) < 40) explodeVehicle(v);
      }
    }
  },
  heli: () => { world.helis.push(makeHeli(scene, player.pos.x + 6, 0.5, player.pos.z + 6, 0, false)); },
  dog: () => { world.dog?.owned && world.dog.pos.set(player.pos.x + 2, 0, player.pos.z + 2); },
  slowmo: () => { world.slowmoT = 6; },
  heal: () => { player.health = world.maxHealth; },
  crown: () => forceCrown(world),
  night: () => { world.clock = 21.5; },
  cashrain: () => {
    let n = 0;
    for (const pk of world.pickups) {
      if (pk.type !== 'money' || n >= 10) continue;
      const a = (n / 10) * Math.PI * 2;
      pk.mesh.position.set(player.pos.x + Math.sin(a) * 5, 1.0, player.pos.z + Math.cos(a) * 5);
      n++;
    }
  },
  nemesis: () => forceNemesis(world),
  outbreak: () => { if (world.clock > 6 && world.clock < 21) world.clock = 22.2; startOutbreak(world); },
  disaster: () => forceDisaster(world),
  fire: () => forceFireEvent(world),
  kaiju: () => forceKaiju(world),
});
let prevMissionDone = mission.done;
let prevTokens = world.tokensGot.length;
let prevClock = world.clock;

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

// ---------- blackjack at the Lucky 7 ----------

function enterCards() {
  gameState = 'cards';
  showTouchUI(false);
  document.exitPointerLock?.();
  openBlackjack(world);
}

function leaveCards() {
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
      sg: ammo.sg, sn: ammo.sn, gren: ammo.gren,
      upg: world.upgrades, gang: { owned: gang.owned, kills: gang.kills }, radio: world.radioSt,
      garage: world.garageKind, xp: world.xp, stats: world.stats, ach: world.ach,
      tokens: world.tokensGot,
      suit: world.suit, suits: world.suitsOwned, settings: world.settings,
      char: world.charKey,
      props: world.props?.owned, rep: world.rep, chaosBest: world.chaosBest,
      dailyDay: world.dailyDay, dailyDone: world.dailyDone,
      arenaBest: world.arena?.best, races: world.raceBest, mods: world.garageMods,
      dog: world.dog?.owned, heistDay: world.heist?.doneDay, vigBest: world.vig?.best,
      jet: world.jetpack?.owned, hoops: [...(world.hoops?.got || [])], crowned: world.crowned,
      lastStand: world.finale?.won, fable: world.fable?.found,
      lottoDay: world.lottery?.ticketDay, expDay: world.exportJob?.day, expIdx: world.exportJob?.idx,
      nemLvl: world.nemesis?.lvl, nemBeaten: world.nemesis?.beaten,
      mythsGraf: [...(world.myths?.graf || [])], mythsDone: [...(world.myths?.done || [])],
      strangerStage: world.stranger?.stage,
      cheistDay: world.cheist?.doneDay,
      empire: world.empire ? world.empire.zones.filter((z) => z.owned).map((z) => z.key) : [],
      scuba: world.diving?.scuba,
      pearls: world.diving ? world.diving.pearls.filter((p) => p.got).map((p) => p.idx) : [],
      chests: world.diving ? world.diving.wrecks.filter((w) => w.looted).map((w) => w.key) : [],
      mayor: world.mayor?.elected, policy: world.policy, salaryDay: world.mayor?.salaryDay,
      prestige: world.prestige,
      swingBest: world.swing ? Object.fromEntries(world.swing.courses.map((c) => [c.key, c.best])) : {},
      museumDay: world.museum?.doneDay, club: world.club?.owned, deck: world.skate?.owned,
      synd: world.synd?.chapter,
      tourneyRung: world.tourney?.rung, tourneyChamp: world.tourney?.champCar,
      crew: world.crew?.members.filter((m) => m.hired).map((m) => m.role.key),
      contractRank: world.contracts?.rank,
      fame: world.busking?.fame,
      gunMods: world.gunMods,
      stormRank: world.storm?.rank,
      hair: world.barber?.hair,
      druglabDay: world.druglab?.doneDay,
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
  { name: 'SHOTGUN', rate: 0.8, dmg: 15, spread: 0.075, pellets: 6, sfx: 'pistol', ammo: 'sg' },
  { name: 'SNIPER', rate: 1.35, dmg: 130, spread: 0.001, sfx: 'pistol', ammo: 'sn', zoom: true },
  { name: 'RPG', rate: 1.4, rocket: true, sfx: 'rpg', ammo: 'rpg' },
  { name: 'GRENADE', rate: 0.9, grenade: true, sfx: 'pistol', ammo: 'gren' },
];
const ammo = { mg: save.mg ?? 60, rpg: save.rpg ?? 3, sg: save.sg ?? 24, sn: save.sn ?? 8, gren: save.gren ?? 5 };
let weaponIdx = 0;
let shootT = 0;
const rockets = [];

// the extended-mag mod (workbench.js) tightens the cooldown between shots
function weaponRate() {
  const w = WEAPONS[weaponIdx];
  return world.gunMods?.mag ? w.rate * 0.72 : w.rate;
}

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
  if (player.inBoat) return; // nothing to scoop up out on the water
  const focus = player.inHeli ? player.inHeli.pos : player.inCar ? player.inCar.pos : player.pos;
  if (player.inHeli && player.inHeli.pos.y > 3) return; // can't grab them from the sky
  const magnetized = world.upgrades?.magnet && web.attached; // magnet webs: loot chases the swinger
  if (!player.inHeli && !player.inCar && player.pos.y > 3 && !magnetized) return;
  for (const pk of world.pickups) {
    pk.mesh.rotation.y += dt * 2.5;
    pk.mesh.position.y = 1.0 + Math.sin(world.time * 3 + pk.pos.x) * 0.15;
    if (magnetized && pk.type === 'money') {
      const md = Math.hypot(pk.pos.x - player.pos.x, pk.pos.z - player.pos.z);
      if (md < 18 && md > 1) {
        pk.mesh.position.x += ((player.pos.x - pk.pos.x) / md) * 14 * dt;
        pk.mesh.position.z += ((player.pos.z - pk.pos.z) / md) * 14 * dt;
      }
    }
    const dx = pk.pos.x - focus.x;
    const dz = pk.pos.z - focus.z;
    if (dx * dx + dz * dz < (player.inCar || player.inHeli ? 7 : 3.2)) {
      if (pk.type === 'money') {
        world.money += 150;
        showToast('+$150');
      } else if (pk.type === 'ammo') {
        ammo.mg += 45;
        ammo.rpg += 2;
        ammo.sg += 12;
        ammo.sn += 4;
        ammo.gren += 3;
        showToast('+45 MG · +12 SG · +4 SNIPER · +2 RPG · +3 GRENADE');
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

  if (player.inPlane) {
    const p = player.inPlane;
    focusSpeed = p.vel.length();
    let diff = p.heading - camYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    camYaw += diff * Math.min(1, 2.4 * dt);

    _camDesired.set(
      p.pos.x - Math.sin(camYaw) * 19,
      p.pos.y + 6 + camPitch * 9,
      p.pos.z - Math.cos(camYaw) * 19
    );
    camPos.lerp(_camDesired, Math.min(1, 4.5 * dt));
    camera.position.copy(camPos);
    _camTarget.set(p.pos.x, p.pos.y + 1.5, p.pos.z);
    camera.lookAt(_camTarget);
  } else if (player.inHeli) {
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
  } else if (player.inBoat) {
    const b = player.inBoat;
    focusSpeed = b.vel.length();
    let diff = b.heading - camYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    camYaw += diff * Math.min(1, 2.8 * dt);

    _camDesired.set(
      b.pos.x - Math.sin(camYaw) * 12,
      5.2 + camPitch * 6,
      b.pos.z - Math.cos(camYaw) * 12
    );
    camPos.lerp(_camDesired, Math.min(1, 6 * dt));
    camera.position.copy(camPos);
    _camTarget.set(b.pos.x, 1.6, b.pos.z);
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

  // sense of speed: widen FOV as you go faster — unless scoping the sniper
  let targetFov = Math.min(84, 70 + focusSpeed * 0.32);
  if (!player.inCar && !player.inHeli && !player.inBoat && !web.attached &&
      WEAPONS[weaponIdx].zoom && gameState === 'play') {
    targetFov = 42;
  }
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

// City streets end at HALF, but the harbor opens the east edge to the water.
function clampPlayerBounds(pos) {
  const B = HALF - 1.5;
  const WZ = HALF + 36;
  if (pos.x > B && Math.abs(pos.z) < WZ) {
    pos.x = Math.min(pos.x, HALF + 256);
    pos.z = Math.max(-WZ, Math.min(WZ, pos.z));
  } else {
    pos.x = Math.max(-B, Math.min(B, pos.x));
    pos.z = Math.max(-B, Math.min(B, pos.z));
  }
}

function updateSwim(dt) {
  player.swim = true;
  _fwd.set(Math.sin(camYaw), 0, Math.cos(camYaw));
  _right.copy(_fwd).cross(UP);
  _move.set(0, 0, 0);
  if (keys['KeyW']) _move.add(_fwd);
  if (keys['KeyS']) _move.sub(_fwd);
  if (keys['KeyD']) _move.add(_right);
  if (keys['KeyA']) _move.sub(_right);
  const spd = (keys['ShiftLeft'] || keys['ShiftRight'] ? 7 : 4.5) * player.charDef.speed;
  if (_move.lengthSq() > 0) {
    _move.normalize();
    player.vel.x = _move.x * spd;
    player.vel.z = _move.z * spd;
    const targetH = Math.atan2(_move.x, _move.z);
    let diff = targetH - player.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    player.heading += diff * Math.min(1, 8 * dt);
  } else {
    player.vel.x *= Math.max(0, 1 - 4 * dt);
    player.vel.z *= Math.max(0, 1 - 4 * dt);
  }
  player.pos.x += player.vel.x * dt;
  player.pos.z += player.vel.z * dt;
  clampPlayerBounds(player.pos);
  // ride just below the surface with a gentle bob
  const swimY = WATER_Y - 1.25 + Math.sin(world.time * 2) * 0.06;
  player.pos.y += (swimY - player.pos.y) * Math.min(1, 6 * dt);
  player.vy = 0;
  player.onGround = false;
  player.glide = false;

  // kick out of the water — enough to haul up onto a pier
  if (pressed['Space']) {
    player.vy = 8.5;
    player.pos.y = WATER_Y + 0.5;
    player.swim = false;
    addStyle(3);
    return;
  }

  // lazy crawl stroke (bob anchored at the swim line, not the street)
  player.mesh.userData.baseY = player.pos.y;
  player.animT += dt * 4;
  animateWalk(player.ch, player.animT, 0.45);
  player.mesh.rotation.y = player.heading;
  player.mesh.rotation.x += (0.9 - player.mesh.rotation.x) * Math.min(1, 6 * dt);

  const nearBoat = findNearestBoat(4.5);
  if (nearBoat) setHint('Press <b>E</b> to board the boat');
  else if (world.planeHint) setHint(world.planeHint); // the seaplane bobs at swim level
  else if (world.diveHint) setHint(world.diveHint);
  else setHint(null);
  if (pressed['KeyE'] && nearBoat) enterBoat(nearBoat);
}

function updateOnFoot(dt) {
  // falling or wading into harbor water starts a swim (vy > 0 = mid-hop out)
  if (inWater(player.pos.x, player.pos.z) && player.pos.y < WATER_Y + 0.4 && player.vy <= 0) {
    updateSwim(dt);
    return;
  }
  player.swim = false;
  _fwd.set(Math.sin(camYaw), 0, Math.cos(camYaw));
  _right.copy(_fwd).cross(UP);

  _move.set(0, 0, 0);
  if (keys['KeyW']) _move.add(_fwd);
  if (keys['KeyS']) _move.sub(_fwd);
  if (keys['KeyD']) _move.add(_right);
  if (keys['KeyA']) _move.sub(_right);

  const moving = _move.lengthSq() > 0;
  const sprintSpeed = world.level >= 8 ? 12 : 10; // parkour sprint skill
  const cs = player.charDef.speed * (world.skateOn ? 1.55 : 1); // deck beats sneakers
  const speed = (keys['ShiftLeft'] || keys['ShiftRight'] ? sprintSpeed : 5.5) * cs;

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
    player.vy = 7.5 * player.charDef.jump;
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
    const fellFar = player.vy < -11;
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
      if (fellFar) player.landT = 0.28; // crouch on a real drop
      cashOutStyle();
    }
  } else if (player.vy < 0 && player.pos.y > groundY + 0.05) {
    player.onGround = false; // walked off a roof edge
  }
  // anchor the walk/idle bob to the surface underfoot — without this the
  // pose animations slam a rooftop (or train-roof) player back to street level
  player.mesh.userData.baseY = player.onGround ? groundY : 0;

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

  clampPlayerBounds(player.pos);

  const sp = Math.hypot(player.vel.x, player.vel.z);
  player.landT = Math.max(0, player.landT - dt);
  if (!player.onGround) {
    poseFall(player.ch);
  } else if (player.landT > 0) {
    animateLand(player.ch, 1 - player.landT / 0.28);
  } else if (sp > 0.5) {
    player.animT += sp * dt * 2.0;
    animateWalk(player.ch, player.animT, sp > 7 ? 0.95 : 0.6);
  } else {
    animateIdle(player.ch);
  }
  player.mesh.rotation.y = player.heading;
  player.mesh.rotation.x *= Math.max(0, 1 - 10 * dt); // settle out of the swing lean

  // weapon switching (digits are shop keys while at any kiosk); X cycles
  if (!world.nearDen && !world.nearKiosk) {
    for (let i = 0; i < WEAPONS.length; i++) {
      if (pressed['Digit' + (i + 1)]) switchWeapon(i);
    }
  }
  if (pressed['KeyX']) switchWeapon((weaponIdx + 1) % WEAPONS.length);

  // enter vehicle, helicopter or boat
  const nearVeh = findNearestVehicle(3.8);
  const nearHeli = findNearestHeli(6.5);
  const nearBoat = findNearestBoat(5.5);
  // the Lucky 7 blackjack table sits at the casino property spot
  world.cardsHint = null;
  const casino = world.propMarks?.find((m) => m.def.key === 'casino');
  if (casino && !nearVeh && !nearHeli && !nearBoat && !(world.cheist?.stage > 0) &&
      Math.hypot(player.pos.x - casino.pos.x, player.pos.z - casino.pos.z) < 5) {
    world.cardsHint = 'Press <b>E</b> to play BLACKJACK at the Lucky 7';
  }

  if (nearHeli) setHint('Press <b>E</b> to fly helicopter');
  else if (nearVeh) setHint('Press <b>E</b> to enter vehicle');
  else if (nearBoat) setHint('Press <b>E</b> to take the ' + (nearBoat.kind === 'jet' ? 'jet-ski' : 'boat'));
  else if (world.finaleHint) setHint(world.finaleHint);
  else if (world.nemesisHint) setHint(world.nemesisHint);
  else if (world.zombieHint) setHint(world.zombieHint);
  else if (world.prisonHint) setHint(world.prisonHint);
  else if (world.heistHint) setHint(world.heistHint);
  else if (world.trainHint) setHint(world.trainHint);
  else if (world.cheistHint) setHint(world.cheistHint);
  else if (world.cardsHint) setHint(world.cardsHint);
  else if (world.shopHint) setHint(world.shopHint);
  else if (world.arenaHint) setHint(world.arenaHint);
  else if (world.propHint) setHint(world.propHint);
  else if (world.raceHint) setHint(world.raceHint);
  else if (world.dogHint) setHint(world.dogHint);
  else if (world.turfHint) setHint(world.turfHint);
  else if (world.raidHint) setHint(world.raidHint);
  else if (world.bountyHint) setHint(world.bountyHint);
  else if (world.fightHint) setHint(world.fightHint);
  else if (world.expHint) setHint(world.expHint);
  else if (world.jetHint) setHint(world.jetHint);
  else if (world.lottoHint) setHint(world.lottoHint);
  else if (world.medHint) setHint(world.medHint);
  else if (world.empireHint) setHint(world.empireHint);
  else if (world.derbyHint) setHint(world.derbyHint);
  else if (world.planeHint) setHint(world.planeHint);
  else if (world.diveHint) setHint(world.diveHint);
  else if (world.papHint) setHint(world.papHint);
  else if (world.mayorHint) setHint(world.mayorHint);
  else if (world.prestigeHint) setHint(world.prestigeHint);
  else if (world.gauntletHint) setHint(world.gauntletHint);
  else if (world.swingHint) setHint(world.swingHint);
  else if (world.fireHint) setHint(world.fireHint);
  else if (world.museumHint) setHint(world.museumHint);
  else if (world.clubHint) setHint(world.clubHint);
  else if (world.fishHint) setHint(world.fishHint);
  else if (world.skateHint) setHint(world.skateHint);
  else if (world.mythHint) setHint(world.mythHint);
  else if (world.syndHint) setHint(world.syndHint);
  else if (world.kaijuHint) setHint(world.kaijuHint);
  else if (world.skydiveHint) setHint(world.skydiveHint);
  else if (world.tourneyHint) setHint(world.tourneyHint);
  else if (world.crewHint) setHint(world.crewHint);
  else if (world.contractHint) setHint(world.contractHint);
  else if (world.subwayHint) setHint(world.subwayHint);
  else if (world.buskHint) setHint(world.buskHint);
  else if (world.workbenchHint) setHint(world.workbenchHint);
  else if (world.stormHint) setHint(world.stormHint);
  else if (world.ferryHint) setHint(world.ferryHint);
  else if (world.ziplineHint) setHint(world.ziplineHint);
  else if (world.balloonHint) setHint(world.balloonHint);
  else if (world.droneHint) setHint(world.droneHint);
  else if (world.taxiHint) setHint(world.taxiHint);
  else if (world.valetHint) setHint(world.valetHint);
  else if (world.carwashHint) setHint(world.carwashHint);
  else if (world.barberHint) setHint(world.barberHint);
  else if (world.armsHint) setHint(world.armsHint);
  else if (world.druglabHint) setHint(world.druglabHint);
  else if (world.strangerHint) setHint(world.strangerHint);
  else setHint(null);
  if (pressed['KeyE']) {
    if (nearHeli) enterHeli(nearHeli);
    else if (nearVeh) enterCar(nearVeh);
    else if (nearBoat) enterBoat(nearBoat);
    else if (world.cardsHint) enterCards();
  }

  // shooting
  shootT -= dt;
  if (mouse.down && shootT <= 0 && (document.pointerLockElement || isTouch)) {
    shootT = weaponRate();
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
  for (const v of world.cops) check(v); // commandeer a cruiser mid-patrol
  for (const v of world.tanks) check(v); // yes, you can steal the tank
  return best;
}

function findNearestBoat(maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const b of world.boats) {
    if (b.dead) continue;
    const d = Math.hypot(b.pos.x - player.pos.x, b.pos.z - player.pos.z);
    if (d < bestD) { bestD = d; best = b; }
  }
  return best;
}

function enterBoat(b) {
  player.inBoat = b;
  player.swim = false;
  player.mesh.visible = false;
  setHint(null);
  camYaw = b.heading;
  engine.start();
  if (world.radioSt > 0) setRadioStation(world.radioSt);
  showToast(b.kind === 'jet' ? 'JET-SKI — fast and loose' : 'SPEEDBOAT');
}

function exitBoat() {
  const b = player.inBoat;
  _fwd.set(Math.sin(b.heading), 0, Math.cos(b.heading));
  _right.copy(_fwd).cross(UP);
  player.pos.set(b.pos.x - _right.x * 3.2, 0.2, b.pos.z - _right.z * 3.2);
  player.vel.set(0, 0, 0);
  player.vy = 0;
  player.mesh.visible = true;
  player.heading = b.heading;
  player.inBoat = null;
  camYaw = b.heading;
  engine.stop();
  setRadioStation(0);
  // step onto a pier if one is alongside, otherwise you're in the drink
  const g = groundHeight(player.pos, city.colliders, 0.1, 2.0);
  player.pos.y = g > 0.5 ? g : 0.2;
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
  idx = world.cops.indexOf(v);
  if (idx >= 0) {
    world.cops.splice(idx, 1);
    addCrime(world, 2);
    showToast('CRUISER COMMANDEERED! Press V for vigilante work');
    showNews('a police cruiser vanishes mid-patrol');
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
        v.health -= 12 * combo * (world.perks.melee ?? 1) * (player.charDef.melee ?? 1);
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

  // electro-web den upgrade: the hit arcs to everything standing nearby
  const zapAround = (cx, cz) => {
    if (!world.upgrades?.electro) return;
    let arcs = 0;
    for (const group of [world.peds, world.gangPeds]) {
      for (const p of group) {
        if (p.dead || Math.hypot(p.pos.x - cx, p.pos.z - cz) > 6) continue;
        p.webT = Math.max(p.webT || 0, 4);
        arcs++;
      }
    }
    for (const tg of world.targets) {
      if (tg.dead || !tg.webbable) continue;
      if (Math.hypot(tg.pos.x - cx, tg.pos.z - cz) <= 6) { tg.web?.(); arcs++; }
    }
    if (arcs > 1) {
      addFlash(_sphere.set(cx, 1.4, cz).clone(), 0x8fd0ff, 0.8);
      showToast(`⚡ ELECTRO-WEB ×${arcs}`);
      addStyle(arcs * 6);
    }
  };

  sfxWeb();
  if (hitTgt) {
    hitTgt.web();
    addTracer(player.pos.clone().setY(player.pos.y + 1.5), _sphere.set(hitTgt.pos.x, hitTgt.pos.y + (hitTgt.aimY ?? 0), hitTgt.pos.z).clone());
    showToast('WEBBED OUT OF THE SKY!');
    addStyle(20);
    trackDaily(world, 'webbed');
    zapAround(hitTgt.pos.x, hitTgt.pos.z);
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
  zapAround(tgt.pos.x, tgt.pos.z);
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
  trackDaily(world, 'webbed');
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

  const swungD = Math.hypot(player.pos.x - px0, player.pos.z - pz0);
  world.stats.swungM += swungD;
  trackDaily(world, 'swungSinceDeath', swungD);

  clampPlayerBounds(player.pos);

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
    shootT = weaponRate();
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
  const nitroMax = car.bigNitro ? 170 : 100; // garage nitro-tank upgrade
  player.nitro = Math.min(nitroMax, player.nitro ?? nitroMax);
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
    player.nitro = Math.min(nitroMax, player.nitro + (car.bigNitro ? 14 : 9) * dt);
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
      // garage ram spikes: hit harder, hurt less
      car.health -= (imp - 5) * (car.spikes ? 0.7 : 1.4);
      t.health -= imp * (car.spikes ? 6 : 2.5);
      if (car.spikes) addSparks(t.pos.clone().setY(0.8), 8);
      sfxCrash(imp);
      world.shake = Math.min(0.5, imp * 0.025);
      if (t.health <= 0 && !t.dead) explodeVehicle(t);
      else if (imp > 8) disableTraffic(t);
    }
  }
  for (const p of world.parked) {
    const imp = separateCars(car, p, false);
    if (imp > 5) {
      car.health -= (imp - 5) * (car.spikes ? 0.6 : 1.2);
      p.health -= imp * (car.spikes ? 5 : 2);
      if (car.spikes) addSparks(p.pos.clone().setY(0.8), 8);
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

// ---------- boating ----------

function updateBoating(dt) {
  const b = player.inBoat;
  const ctl = {
    throttle: (keys['KeyW'] ? 1 : 0) + (keys['KeyS'] ? -1 : 0),
    steer: (keys['KeyA'] ? 1 : 0) + (keys['KeyD'] ? -1 : 0),
  };
  const bump = physStepBoat(b, ctl, dt, world.time);
  if (bump > 6) {
    sfxCrash(bump);
    world.shake = Math.min(0.4, bump * 0.02);
  }
  setEngine(b.vel.length());
  player.pos.copy(b.pos); // keep systems that read the on-foot position honest

  // spray off the stern at speed
  const sp = b.vel.length();
  if (sp > 9) {
    b.wakeT = (b.wakeT || 0) - dt;
    if (b.wakeT <= 0) {
      b.wakeT = 0.07;
      addSmoke(b.pos.clone().add(new THREE.Vector3(-Math.sin(b.heading) * 2.6, 0.3, -Math.cos(b.heading) * 2.6)), 0.4);
      addStyle(2 * dt);
    }
  }

  if (pressed['KeyR']) {
    world.radioSt = (world.radioSt + 1) % RADIO_STATIONS.length;
    setRadioStation(world.radioSt);
    showToast(RADIO_STATIONS[world.radioSt]);
  }

  if (pressed['KeyE']) {
    if (sp < 4) exitBoat();
    else showToast('Slow down to hop off!');
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
    else bailOut(); // skydive!
  }
}

// Jump out of a flying helicopter: freefall over the city, chute on Space.
// The pilotless bird drops out of the sky behind you.
function bailOut() {
  const h = player.inHeli;
  player.pos.set(h.pos.x + 2.5, h.pos.y, h.pos.z + 2.5);
  player.vel.set(h.vel.x * 0.6, 0, h.vel.z * 0.6);
  player.vy = -2;
  player.onGround = false;
  player.glide = false;
  player.mesh.visible = true;
  player.inHeli = null;
  rotor.stop();
  h.dead = true; // no pilot — she's going down
  world.slowmoT = 0.7;
  addStyle(25);
  showToast('SKYDIVE! Hold SPACE to parachute');
  showNews('daredevil leaps from a helicopter over downtown');
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
  trackDaily(world, 'wrecked');
  addChaos(world, 15);
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
  if (world.wanted === 0 && !world.gunMods?.silencer) addCrime(world, 1);

  if (w.rocket) {
    fireRocket();
    return;
  }
  if (w.grenade) {
    throwGrenade();
    return;
  }

  // shotguns fire a fan of pellets, everything else a single round
  for (let p = (w.pellets || 1); p > 0; p--) fireBullet(w);
}

function fireBullet(w) {
  camera.getWorldDirection(_rayDir);
  const spread = world.gunMods?.scope ? w.spread * 0.55 : w.spread;
  _rayDir.x += (Math.random() - 0.5) * spread * 2;
  _rayDir.y += (Math.random() - 0.5) * spread * 2;
  _rayDir.z += (Math.random() - 0.5) * spread * 2;
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

// ---------- grenades ----------

const grenades = [];
const grenGeo = new THREE.SphereGeometry(0.22, 8, 6);
const grenMat = new THREE.MeshLambertMaterial({ color: 0x2f4a2a });

function throwGrenade() {
  const mesh = new THREE.Mesh(grenGeo, grenMat);
  const pos = player.pos.clone();
  pos.y += 1.5;
  mesh.position.copy(pos);
  scene.add(mesh);
  const vel = _rayDir.clone().multiplyScalar(19);
  vel.y += 7; // lob it
  grenades.push({ mesh, pos: mesh.position, vel, t: 0 });
}

function updateGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i--) {
    const g = grenades[i];
    g.t += dt;
    g.vel.y -= 22 * dt;
    g.pos.addScaledVector(g.vel, dt);
    g.mesh.rotation.x += dt * 9;
    if (g.t > 3 || g.pos.y <= 0.2 || pointBlocked(g.pos, city.colliders)) {
      explodeRocket(g.pos.clone().setY(Math.max(0.6, g.pos.y)));
      scene.remove(g.mesh);
      grenades.splice(i, 1);
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
  endArena(world, true);
  endRace(world, true);
  failHeist(world);
  endVigilante(world, text === 'WASTED' ? 'You got wasted' : 'You got busted');
  endFightClub(world, 'knocked out cold');
  endFinale(world);
  endNemesisFight(world);
  endOutbreak(world, false);
  endTrainHeist(world);
  endCasinoHeist(world);
  endEmpireFights(world);
  abortDerby(world);
  endGauntlet(world);
  endSwingRace(world);
  endMuseum(world);
  endSyndicate(world);
  abortTournament(world);
  endContract(world);
  endDruglab(world);
  if (world.skydive) world.skydive.on = false;
  if (world.subway) world.subway.menu = null;
  if (world.workbench) world.workbench.open = false;
  abortBusking(world);
  if (world.ferry) { world.ferry.riding = 0; world.ferryLocked = false; }
  if (world.ziplines) world.ziplines.riding = null;
  if (world.balloon) world.balloon.riding = false;
  if (world.drone?.flying) { world.drone.flying = false; world.drone.mesh.visible = false; world.drone.mesh.position.copy(world.drone.padPos); }
  if (world.taxi?.active) { if (world.taxi.fare?.ch?.group?.parent) world.scene.remove(world.taxi.fare.ch.group); world.taxi.active = false; }
  if (world.valet?.active) {
    const pi = world.parked.indexOf(world.valet.car);
    if (pi >= 0) world.parked.splice(pi, 1);
    if (world.valet.car) world.scene.remove(world.valet.car.mesh);
    world.valet.active = false;
  }
  // three stars or worse when the cuffs close = a night on Harbor Island
  if (text === 'BUSTED' && world.wanted >= 3 && world.prison) world.prison.pending = true;
  if (world.jetpack) world.jetpack.on = false;
  if (world.diving) world.diving.on = false;
  if (player.inPlane) { player.inPlane = null; player.mesh.visible = true; }
  resetChaos(world);
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
  if (player.inBoat) {
    player.inBoat.vel.set(0, 0, 0);
    player.inBoat = null;
  }
  if (player.inPlane) {
    player.inPlane.speed = 0;
    player.inPlane.vel.set(0, 0, 0);
    player.inPlane = null;
  }
  if (world.diving) world.diving.on = false;
  player.swim = false;
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
  prisonIntake(world); // a 3-star bust wakes up on Harbor Island instead
  gameState = 'play';
}

// ---------- start screen / pointer lock ----------

const startEl = document.getElementById('start');

// character picker: cards on the start screen, choice saved for next time
let chosenChar = charDef.key;
(function buildCharPicker() {
  const row = document.getElementById('charrow');
  if (!row) return;
  for (const c of CHARACTERS) {
    const card = document.createElement('div');
    card.className = 'charcard' + (c.key === chosenChar ? ' sel' : '');
    card.innerHTML =
      `<div class="swatch" style="background:linear-gradient(135deg,${c.colors.shirt},${c.colors.pants})"></div>` +
      `<div class="cname">${c.name}</div><div class="ctag">${c.tagline}</div>` +
      `<div class="stat">SPD ${'★'.repeat(Math.round(c.speed * 4))}<br>HP ${c.health}<br>JMP ${'★'.repeat(Math.round(c.jump * 4))}</div>`;
    card.onclick = () => {
      chosenChar = c.key;
      document.querySelectorAll('.charcard').forEach((el) => el.classList.remove('sel'));
      card.classList.add('sel');
      applyCharacter(c);
    };
    row.appendChild(card);
  }
})();

function applyCharacter(c) {
  player.charDef = c;
  world.charKey = c.key;
  world.maxHealth = c.health;
  player.health = c.health;
  applySuitColors(c.colors);
  saveGame();
}

// recolor the player rig to a character's palette (reuses the wardrobe path)
function applySuitColors(colors) {
  const g = player.ch;
  const set = (mesh, col) => { if (col && mesh) mesh.material.color.set(col); };
  set(g.group.children[0], colors.shirt);
  set(g.group.children[1], colors.skin);
  set(g.lArm.children[0], colors.skin);
  set(g.rArm.children[0], colors.skin);
  set(g.lLeg.children[0], colors.pants);
  set(g.rLeg.children[0], colors.pants);
}

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
  else {
    goFullscreen(); // phones: immersive landscape
    keepAwake();    // and no screen dimming mid-chase
  }
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
const disasterHooks = { boom: (pos) => explodeRocket(pos), explode: (v) => explodeVehicle(v) };

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
  world.rainI = wx.intensity; // myths check the weather too
  world.lightningFlash = wx.flash; // storm chaser watches for the strike window

  // outbreak nights close in: thicker fog, dimmer sky
  if (world.zombies?.active) {
    scene.fog.near *= 0.55;
    scene.fog.far *= 0.6;
    hemi.intensity *= 0.85;
  }

  // under the harbor: green-black murk, short sightlines
  if (world.diving?.on) {
    scene.fog.color.set(0x07222e);
    scene.fog.near = 2;
    scene.fog.far = 55;
    hemi.intensity *= 0.5;
    sun.intensity *= 0.4;
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

  if (player.inPlane && pressed['KeyB']) bailFromPlane(world);
  if (player.inBoat) updateBoating(dt);
  else if (player.inPlane) updatePlaneFlight(world, dt, keys, pressed);
  else if (player.inHeli) updateFlying(dt);
  else if (player.inCar) updateDriving(dt);
  else if (world.jetpack?.on) updateJetpack(world, dt, keys, pressed, camYaw);
  else if (world.skydive?.on) updateSkydive(world, dt, keys, pressed, camYaw);
  else if (world.balloon?.riding) updateBalloon(world, dt, keys, camYaw);
  else if (world.ferryLocked) {} // scripted crossing — updateFerry already moved the player this frame
  else if (world.diving?.on) updateDive(world, dt, keys, () => camera.getWorldDirection(_rayDir));
  else if (web.zip) updateZip(dt);
  else if (web.attached) updateSwinging(dt);
  else updateOnFoot(dt);

  updatePeds(world, dt);
  updateTraffic(world, dt);
  updatePolice(world, dt);
  updatePoliceHelis(world, dt, heliHooks);
  updateHelis(dt);
  updateRockets(dt);
  updateGrenades(dt);
  updatePickups(dt);
  if (mission && mission.type === 'mech') mission._boom = explodeRocket;
  updateMissions(world, dt);
  updateShops(shopsState, world, dt, keys, pressed);
  updateGang(world, dt);
  updateArmy(world, dt, armyHooks);
  updateAmbient(flocks, world, dt);
  updateStunts(stuntsState, world, dt);
  updateLandmarks(landmarks, dt, world.time);
  updateEconomy(world, dt, keys, pressed);
  updateArena(world, dt);
  updateRaces(world, dt);
  updateWater(waterState, world, dt);
  updateDog(world, dt, pressed);
  updateHeist(world, dt, keys, pressed);
  updateTurfWar(world, dt);
  updateVigilante(world, dt, pressed);
  updateArmored(world, dt);
  updatePropRaids(world, dt);
  updateJetpackPad(world, dt, pressed);
  updateAmbulance(world, dt, keys, pressed);
  updateExport(world, dt);
  updateBounty(world, dt, pressed);
  updateBaseJump(world, dt);
  updateHoops(world, dt);
  updateUfo(world, dt);
  updateLottery(world, dt, pressed);
  updateFightClub(world, dt, pressed);
  updateLegend(world, dt);
  updateFinale(world, dt, pressed);
  updateNemesis(world, dt);
  updateZombies(world, dt);
  updateTrain(world, dt, keys, pressed);
  updateDisasters(world, dt, disasterHooks);
  updatePrison(world, dt);
  updateMyths(world, dt, keys, pressed);
  updateStranger(world, dt, pressed);
  updateCasinoHeist(world, dt, keys);
  updateDerby(world, dt);
  tryStartDerby(world, pressed);
  updateEmpire(world, dt);
  tryEmpireTakeover(world, pressed);
  updatePlaneDock(world, dt, pressed);
  updateDivingShack(world, dt, pressed);
  updatePaparazzi(world, dt, pressed, camera);
  updateMayor(world, dt, pressed);
  updatePrestige(world, dt, keys);
  updateGauntlet(world, dt, pressed);
  updateSwingRaces(world, dt, pressed);
  world._hose = !!(player.inCar?.fireTruck && (keys['KeyF'] || mouse.down));
  updateFirefight(world, dt);
  updateMuseum(world, dt, keys);
  updateFishing(world, dt, pressed);
  updateNightclub(world, dt, pressed);
  updateSkateboard(world, dt, pressed);
  updateKaiju(world, dt);
  updateSyndicate(world, dt, keys, pressed);
  updateSkydivePad(world, dt, pressed);
  updateTournament(world, dt, pressed);
  updateCrew(world, dt, pressed);
  updateContracts(world, dt, pressed);
  updateSubway(world, dt, pressed);
  updateBusking(world, dt, pressed);
  updateWorkbench(world, dt, pressed);
  updateStormChaser(world, dt, pressed, camera);
  updateFerry(world, dt, pressed, camera);
  updateZipline(world, dt, pressed);
  updateBalloonPad(world, dt, pressed);
  updateDronePad(world, dt, pressed);
  updateDrone(world, dt, keys, camYaw);
  updateTaxi(world, dt, pressed);
  updateValet(world, dt, pressed);
  updateCarwash(world, dt, keys);
  updateBarber(world, dt, pressed);
  updateArmsdealer(world, dt, pressed, ammo);
  updateDruglab(world, dt);
  updateEffects(dt);

  // job status stays on screen even from inside a vehicle
  if (player.inCar || player.inBoat || player.inHeli) {
    const drivingHint = world.nemesisHint || world.zombieHint || world.prisonHint ||
      world.heistHint || world.trainHint || world.cheistHint || world.derbyHint ||
      world.empireHint || world.papHint || world.fireHint || world.museumHint ||
      world.turfHint || world.raidHint || world.syndHint || world.kaijuHint ||
      world.medHint || world.expHint || world.bountyHint ||
      world.tourneyHint || world.contractHint || world.stormHint ||
      world.taxiHint || world.valetHint || world.carwashHint || world.druglabHint;
    if (drivingHint) setHint(drivingHint);
  }
  // ...and from the cockpit or the deep
  if (player.inPlane) setHint(world.planeHint || null);
  else if (world.diving?.on) setHint(world.diveHint || null);

  // H starts the stadium arena when you're standing in the ring
  if (pressed['KeyH']) world._startArena = true;

  // mission passed: count it for the daily, and every 3rd pass shows an ad break
  if (mission.done !== prevMissionDone) {
    if (mission.done > prevMissionDone) {
      trackDaily(world, 'missionsToday');
      if (mission.done % 3 === 0) showInterstitial();
    }
    prevMissionDone = mission.done;
  }

  // hidden packages count toward the daily too
  if (world.tokensGot.length !== prevTokens) {
    trackDaily(world, 'tokensToday', world.tokensGot.length - prevTokens);
    prevTokens = world.tokensGot.length;
  }

  // midnight rolls the daily challenge over — with fireworks over the city
  if (world.clock < prevClock) {
    newDay(world);
    world.fwT = 4;
    showNews('midnight fireworks light up the skyline');
  }
  prevClock = world.clock;
  if (world.fwT > 0) {
    world.fwT -= dt;
    world._fwTick = (world._fwTick || 0) - dt;
    if (world._fwTick <= 0) {
      world._fwTick = 0.3;
      addExplosion(player.pos.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 120, 35 + Math.random() * 25, (Math.random() - 0.5) * 120)));
    }
  }

  // ambience follows the clock
  const hum = world.clock > 6.5 && world.clock < 21.5 ? 1 : 0.55;
  if (hum !== world._hum) { world._hum = hum; setHum(hum); }
  if (player.inCar || player.inHeli || player.inBoat || player.swim || web.attached || web.zip) chuteMesh.visible = false;

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

  // pause / big map / screenshot / legend board
  if (pressed['KeyP']) pauseGame();
  if (pressed['KeyM']) openBigMap();
  if (pressed['KeyL']) {
    gameState = 'cards'; // same frozen-overlay state the casino uses
    showTouchUI(false);
    document.exitPointerLock?.();
    openLegend(world);
  }
  if (pressed['KeyG']) world.captureNext = true;

  // phones get 1-4 buttons while standing at a kiosk
  if (isTouch && world.nearKiosk !== world._kioskUi) {
    world._kioskUi = world.nearKiosk;
    showKioskButtons(world.nearKiosk);
  }
  // ...and FIGHT / BUY buttons when those actions are in reach
  if (isTouch) {
    const wantArena = !!world.arenaHint && !world.arena.active;
    const wantBuy = !!world.propHint && !wantArena;
    if (wantArena !== world._ctxArena || wantBuy !== world._ctxBuy) {
      world._ctxArena = wantArena;
      world._ctxBuy = wantBuy;
      showContextButtons({ arena: wantArena, buy: wantBuy });
    }
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
  } else if (gameState === 'pause' || gameState === 'cards') {
    // frozen — the menu / card table overlay handles everything
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
  characters: CHARACTERS,
  setCharacter: (k) => { const c = CHARACTERS.find((x) => x.key === k); if (c) applyCharacter(c); },
  getCamYaw: () => camYaw,
  setCamYaw: (v) => { camYaw = v; },
  setCamPitch: (v) => { camPitch = v; },
  getState: () => gameState,
  setClock: (h) => { world.clock = h; },
  races: racesState,
  water: waterState,
  enterCards,
  leaveCards,
  vig: () => world.vig,
  armored: () => world.armored,
  propRaid: () => world.propRaid,
  startArena: () => { world._startArena = true; },
  boardBoat: (i = 0) => enterBoat(world.boats[i]),
  exitBoat,
  teleport: (x, y, z) => { player.pos.set(x, y, z); },
  nemesis: () => world.nemesis,
  forceNemesis: () => forceNemesis(world),
  zombies: () => world.zombies,
  startOutbreak: () => startOutbreak(world),
  train: () => world.train,
  disasters: () => world.disasters,
  forceDisaster: (k) => forceDisaster(world, k),
  prison: () => world.prison,
  imprison: () => { world.prison.pending = true; prisonIntake(world); },
  myths: () => world.myths,
  stranger: () => world.stranger,
  cheist: () => world.cheist,
  gauntlet: () => world.gauntlet,
  swingrace: () => world.swing,
  firefight: () => world.firefight,
  forceFire: () => forceFireEvent(world),
  museum: () => world.museum,
  fishing: () => world.fishing,
  club: () => world.club,
  skate: () => world.skate,
  derby: () => world.derby,
  plane: () => world.plane,
  smuggle: () => world.smuggle,
  empire: () => world.empire,
  diving: () => world.diving,
  pap: () => world.pap,
  mayor: () => world.mayor,
  prestige: () => world.prestigeState,
  boardPlane: () => {
    const p = world.plane;
    player.pos.set(p.pos.x + 2, p.pos.y, p.pos.z);
    player.inPlane = p;
    player.swim = false;
    player.mesh.visible = false;
    engine.start();
  },
  enterCarDirect: (v) => enterCar(v || world.parked.find((c) => !c.dead && !c.bike)),
  kaiju: () => world.kaiju,
  forceKaiju: () => forceKaiju(world),
  synd: () => world.synd,
  skydive: () => world.skydive,
  startSkydive: () => { player.pos.copy(world.skydive.padPos); },
  tourney: () => world.tourney,
  crew: () => world.crew,
  contracts: () => world.contracts,
  subway: () => world.subway,
  busking: () => world.busking,
  gunMods: () => world.gunMods,
  storm: () => world.storm,
};
