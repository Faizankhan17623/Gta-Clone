import * as THREE from 'three';
import { showNews } from './hud.js';
import { addFlash, addSparks } from './effects.js';

// WEATHER THAT BITES: reads the existing weather + day/night state and turns
// it into gameplay. Rain -> less grip and longer stops. Heavy rain/storm ->
// tighter fog. Lightning can strike a tall building and knock its lit
// windows dark for a while. Toggle WEATHER FX in settings (on by default).

export function initWeatherHazards(scene, world) {
  if (world.settings.weatherFx === undefined) world.settings.weatherFx = true;
  world.wxfx = { strikeT: 6, dark: [], baseFogNear: null, baseFogFar: null };
}

// Called from updateDriving with the player's car. Returns a grip multiplier
// (1 = dry). Applied by scaling the lateral velocity bleed.
export function roadGrip(world) {
  if (!world.settings.weatherFx) return 1;
  const wet = world.weather?.intensity || 0;
  return 1 - wet * 0.4; // up to 40% less grip in a downpour
}

export function updateWeatherHazards(world, dt) {
  const fx = world.wxfx;
  if (!fx || !world.settings.weatherFx) {
    // restore fog if we turned it off mid-storm
    if (fx && fx.baseFogNear != null && world.scene.fog) {
      world.scene.fog.near = fx.baseFogNear;
      world.scene.fog.far = fx.baseFogFar;
      fx.baseFogNear = fx.baseFogFar = null;
    }
    return;
  }
  const w = world.weather;
  const wet = w?.intensity || 0;

  // fog closes in during a real storm (day/night already sets a baseline)
  const fog = world.scene.fog;
  if (fog) {
    if (fx.baseFogNear == null) { fx.baseFogNear = fog.near; fx.baseFogFar = fog.far; }
    fog.near = fx.baseFogNear - wet * 40;
    fog.far = fx.baseFogFar - wet * 180;
  }

  // lightning strikes on tall buildings during a storm
  if (wet > 0.4) {
    fx.strikeT -= dt;
    if (fx.strikeT <= 0) {
      fx.strikeT = 9 + Math.random() * 16;
      strike(world);
    }
  }

  // relit windows come back after a while
  for (let i = fx.dark.length - 1; i >= 0; i--) {
    const d = fx.dark[i];
    d.t -= dt;
    if (d.t <= 0) {
      if (d.mat) d.mat.emissiveIntensity = d.was;
      fx.dark.splice(i, 1);
    }
  }
}

function strike(world) {
  const buildings = world.city.buildings;
  if (!buildings || !buildings.length) return;
  // prefer tall ones near the player
  const p = world.player.pos;
  let best = null, bestScore = -1;
  for (let n = 0; n < 12; n++) {
    const b = buildings[(Math.random() * buildings.length) | 0];
    const d = Math.hypot(b.x - p.x, b.z - p.z);
    const score = b.h / 6 - d / 60;
    if (score > bestScore) { bestScore = score; best = b; }
  }
  if (!best) return;

  const top = new THREE.Vector3(best.x, best.h + 1, best.z);
  addFlash(top, 0xcfe6ff, 3.4);
  addSparks(top, 20);
  world.shake = Math.max(world.shake || 0, 0.14);
  if (world.weather) world.weather.flash = 1;

  // knock this building's lit windows out for a bit
  const fx = world.wxfx;
  const mats = Array.isArray(best.mesh.material) ? best.mesh.material : [best.mesh.material];
  for (const m of mats) {
    if (m && m.emissive && m.emissiveIntensity > 0.2) {
      fx.dark.push({ mat: m, was: m.emissiveIntensity, t: 18 + Math.random() * 10 });
      m.emissiveIntensity = 0.02;
    }
  }
  if (Math.random() < 0.5) showNews('lightning strikes a downtown tower');
}
