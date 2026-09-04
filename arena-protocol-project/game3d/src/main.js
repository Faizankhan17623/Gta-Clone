import * as THREE from 'three';
import Stats from 'stats.js';
import { createRenderer } from './renderer.js';
import { createCamera } from './camera.js';
import { createScene } from './scene.js';
import { createLoop } from './loop.js';
import { createCollider } from './collision.js';
import { createPlayer } from './player.js';
import { createHud } from './hud.js';
import { createWeapon } from './weapon.js';
import { createEffects } from './effects.js';
import { createEnemies } from './enemies.js';
import { createShooting } from './shooting.js';
import { createGame } from './game.js';
import { createNetwork } from './network.js';
import { createRemotePlayers } from './remotePlayers.js';
import { createNetHud } from './netHud.js';
import { createPickups } from './pickups.js';
import { sfx } from './audio.js';

// --- Core setup (Phase 1) ---
const renderer = createRenderer();
const camera = createCamera();
const scene = createScene();

// --- Phase 3: first-person controls + collision ---
const collider = createCollider(scene.userData.obstacles, { radius: 0.4 });

// --- Phase 6/7: networking. Created before the player so the player can send
//     input commands to the server for prediction/reconciliation. ---
const remotePlayers = createRemotePlayers(scene);
let player, game, hud, effects;
const net = createNetwork({
  onInit(data) {
    // Step 52/53: we received our unique id and the current roster.
    console.log('[net] init: you are', data.id, '—', data.players.length, 'others online');
    for (const p of data.players) remotePlayers.add(p);
  },
  onPlayerJoined(p) { remotePlayers.add(p); },
  onPlayerLeft(id) { remotePlayers.remove(id); }, // Step 59
  onSnapshot(snap) {
    // Step 64: reconcile OUR predicted position against the server's authority.
    const self = snap.p.find((q) => q.id === net.selfId);
    if (self) player.reconcile(self);
    // Step 61: interpolate the OTHER players smoothly.
    remotePlayers.applySnapshot(snap.p, net.selfId, snap.t);
  },
  onEvent(event, data) {
    if (!hud) return;
    if (event === 'kill') hud.toast(`${data.killerName} eliminated ${data.victimName}`, 'danger');
    if (event === 'victory') hud.toast(`${data.name} wins the round!`, 'good');
    if (event === 'you-hit') game?.takeDamage(Math.max(0, game.state.health - data.health));
    if (event === 'respawn') player?.resetTo(data.x, 1.7, data.z);
    if (event === 'hit-confirmed') hud.toast('PLAYER HIT', 'good');
  },
});

// Step 63/65: player predicts locally and sends inputs to the authoritative server.
player = createPlayer(camera, scene, collider, renderer.domElement, {
  sendInput: (cmd) => net.sendInput(cmd),
});

// Note: PointerLockControls.getObject() returns the camera itself, and
// createPlayer adds it to the scene — so the camera-attached gun renders fine.

// --- HUD (crosshair, overlay, ammo, health, score, game-over) ---
hud = createHud(player.controls);

// --- Phase 4: weapon, effects, enemies, shooting ---
const weapon = createWeapon(camera);
effects = createEffects(scene);
const enemies = createEnemies(scene, collider);
const pickups = createPickups(scene);

// --- Phase 5: game state (declared before shooting so onKill is available) ---
const shooting = createShooting({
  camera, scene, weapon, effects, enemies, hud,
  onKill: (headshot, type) => game.onKill(headshot, type),
  onHit: headshot => { if (headshot) hud.toast('HEADSHOT +50', 'good'); },
  sendShot: shot => net.sendShot(shot),
});
game = createGame({ hud, enemies, player, shooting, pickups });
hud.onSettings((id, value) => {
  if (id === 'difficulty') game.setDifficulty(value);
  if (id === 'sensitivity') player.setSensitivity(value);
  if (id === 'volume') sfx.setVolume(value);
  if (id === 'graphics') renderer.setPixelRatio(Math.min(window.devicePixelRatio, value));
});

// Start the first wave once the player locks in (also start immediately so the
// HUD shows correct values before the first click).
game.start();
player.controls.addEventListener('lock', () => {
  if (!game.state.alive) return; // game-over restart handles its own start
});

// Step 68: network/ping display.
const netHud = createNetHud();
document.addEventListener('keydown', e => { if (e.code === 'KeyP') game.togglePause(); });

// --- Step 18: FPS counter ---
const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

// --- Step 10: resize handling ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

// --- Render loop: update player, weapon, shooting, effects, game each frame ---
const loop = createLoop(renderer, scene, camera, {
  stats,
  onUpdate(delta) {
    // player.update predicts movement and sends inputs to the server itself.
    player.update(delta);
    weapon.update(delta);
    shooting.update(delta);
    effects.update(delta);
    game.update(delta);

    // Step 61: interpolate other players toward their buffered server states.
    remotePlayers.update();

    // Step 68: refresh the lag display.
    netHud.update(net.ping, net.connected, remotePlayers.count);
    hud.setNetwork(net.connected ? `ONLINE · ${net.ping} MS · ${remotePlayers.count + 1} PLAYERS` : 'SOLO · SERVER OFFLINE');
  },
});

loop.start();

// Debug handle.
window.__game = { THREE, renderer, camera, scene, player, enemies, game, loop };
