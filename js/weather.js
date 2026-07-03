import * as THREE from 'three';
import { sfxThunder, setRain } from './sound.js';

// Dynamic weather: clear skies and rainstorms alternate. Rain is a volume of
// falling line streaks that follows the camera; storms bring thunder and
// lightning flashes (applied to the scene lights by main.js).

const DROPS = 1100;
const VOL_XZ = 55; // half-extent of the rain volume around the camera
const VOL_Y = 50;

export function initWeather(scene) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(DROPS * 6); // two verts per streak
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const drops = [];
  for (let i = 0; i < DROPS; i++) {
    drops.push({
      x: (Math.random() * 2 - 1) * VOL_XZ,
      y: Math.random() * VOL_Y,
      z: (Math.random() * 2 - 1) * VOL_XZ,
      v: 34 + Math.random() * 16,
    });
  }
  const mat = new THREE.LineBasicMaterial({ color: 0x9db8cc, transparent: true, opacity: 0, depthWrite: false });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  lines.visible = false;
  scene.add(lines);

  return {
    lines, mat, drops,
    state: 'clear',
    intensity: 0,
    target: 0,
    switchT: 40 + Math.random() * 50, // first storm arrives fairly soon
    thunderT: 0,
    flash: 0,
  };
}

export function updateWeather(w, dt, camera) {
  w.switchT -= dt;
  if (w.switchT <= 0) {
    if (w.state === 'clear') {
      w.state = 'rain';
      w.target = 0.6 + Math.random() * 0.4;
      w.switchT = 50 + Math.random() * 50;
      w.thunderT = 4 + Math.random() * 6;
    } else {
      w.state = 'clear';
      w.target = 0;
      w.switchT = 80 + Math.random() * 90;
    }
  }

  // slow fade in/out of the storm
  w.intensity += (w.target - w.intensity) * Math.min(1, 0.3 * dt);
  if (Math.abs(w.intensity - w.target) < 0.01) w.intensity = w.target;

  // lightning
  w.flash = Math.max(0, w.flash - 3 * dt);
  if (w.state === 'rain' && w.intensity > 0.35) {
    w.thunderT -= dt;
    if (w.thunderT <= 0) {
      w.thunderT = 7 + Math.random() * 15;
      w.flash = 1;
      sfxThunder();
    }
  }

  setRain(w.intensity);

  const visible = w.intensity > 0.02;
  w.lines.visible = visible;
  if (!visible) return w;

  w.mat.opacity = 0.38 * w.intensity;
  const arr = w.lines.geometry.attributes.position.array;
  const cx = camera.position.x;
  const cy = Math.max(0, camera.position.y - 12);
  const cz = camera.position.z;
  for (let i = 0; i < DROPS; i++) {
    const d = w.drops[i];
    d.y -= d.v * dt;
    if (d.y < 0) {
      d.y += VOL_Y;
      d.x = (Math.random() * 2 - 1) * VOL_XZ;
      d.z = (Math.random() * 2 - 1) * VOL_XZ;
    }
    const x = cx + d.x;
    const y = cy + d.y;
    const z = cz + d.z;
    arr[i * 6] = x;
    arr[i * 6 + 1] = y;
    arr[i * 6 + 2] = z;
    arr[i * 6 + 3] = x + 0.06;
    arr[i * 6 + 4] = y + 0.9;
    arr[i * 6 + 5] = z;
  }
  w.lines.geometry.attributes.position.needsUpdate = true;
  return w;
}
