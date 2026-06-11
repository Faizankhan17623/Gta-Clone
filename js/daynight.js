import * as THREE from 'three';

// One in-game day = 24 real minutes (1 real minute = 1 game hour), GTA-style.
export const DAY_START = 10; // spawn at 10:00

// Keyframes across the 24h cycle. glow = how "night" it is (drives lit windows, lamps).
const KEYS = [
  // night stays bright enough to play: strong moonlight + ambient
  { h: 0.0, top: 0x121d34, hor: 0x243048, sun: 0x8fa4cc, sunI: 0.7, hemiI: 0.75, glow: 1.0 },
  { h: 4.5, top: 0x141f38, hor: 0x26324a, sun: 0x8fa4cc, sunI: 0.7, hemiI: 0.75, glow: 1.0 },
  { h: 6.0, top: 0x2c3a60, hor: 0xc97a4e, sun: 0xff9a55, sunI: 0.6, hemiI: 0.6, glow: 0.75 },
  { h: 7.5, top: 0x5d84b4, hor: 0xd9b08c, sun: 0xffd9a8, sunI: 1.0, hemiI: 0.78, glow: 0.25 },
  { h: 10.0, top: 0x6fa0d4, hor: 0xb4c8da, sun: 0xfff0d0, sunI: 1.3, hemiI: 0.92, glow: 0.0 },
  { h: 15.0, top: 0x76a6d8, hor: 0xbccde0, sun: 0xfff4dc, sunI: 1.3, hemiI: 0.95, glow: 0.0 },
  { h: 17.5, top: 0x5b7cb0, hor: 0xd9a878, sun: 0xffc890, sunI: 1.0, hemiI: 0.78, glow: 0.2 },
  { h: 19.0, top: 0x2e3658, hor: 0xd07840, sun: 0xff8844, sunI: 0.6, hemiI: 0.62, glow: 0.7 },
  { h: 20.5, top: 0x16213a, hor: 0x28344c, sun: 0x8fa4cc, sunI: 0.7, hemiI: 0.75, glow: 1.0 },
  { h: 24.0, top: 0x121d34, hor: 0x243048, sun: 0x8fa4cc, sunI: 0.7, hemiI: 0.75, glow: 1.0 },
];

const _a = new THREE.Color();
const _b = new THREE.Color();

function sample(hours) {
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].h <= hours) i++;
  const k0 = KEYS[i];
  const k1 = KEYS[i + 1];
  const t = (hours - k0.h) / (k1.h - k0.h);
  return {
    top: _a.setHex(k0.top).lerp(_b.setHex(k1.top), t).clone(),
    hor: _a.setHex(k0.hor).lerp(_b.setHex(k1.hor), t).clone(),
    sun: _a.setHex(k0.sun).lerp(_b.setHex(k1.sun), t).clone(),
    sunI: k0.sunI + (k1.sunI - k0.sunI) * t,
    hemiI: k0.hemiI + (k1.hemiI - k0.hemiI) * t,
    glow: k0.glow + (k1.glow - k0.glow) * t,
  };
}

export function createSkyDome(scene) {
  const uniforms = {
    topColor: { value: new THREE.Color(0x6fa0d4) },
    horizonColor: { value: new THREE.Color(0xb4c8da) },
    sunDir: { value: new THREE.Vector3(0, 1, 0) },
    sunColor: { value: new THREE.Color(0xfff0d0) },
    sunHaze: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 sunColor;
      uniform vec3 sunDir;
      uniform float sunHaze;
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 col = mix(horizonColor, topColor, pow(h, 0.55));
        float s = max(dot(d, sunDir), 0.0);
        col += sunColor * (pow(s, 1200.0) * 2.2 + pow(s, 10.0) * 0.18 * sunHaze);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(860, 28, 14), mat);
  dome.frustumCulled = false;
  dome.renderOrder = -10;
  scene.add(dome);
  return { dome, uniforms };
}

const _sunDir = new THREE.Vector3();

// Apply time-of-day to the whole scene. Returns the glow factor (1 = full night).
export function applyDayNight(hours, ctx) {
  const { scene, sun, hemi, sky, camera, city } = ctx;
  const s = sample(hours);

  // sun travels east -> west between 06:00 and 18:00; otherwise a dim "moon"
  const ang = ((hours - 6) / 12) * Math.PI;
  const elev = Math.sin(ang);
  if (elev > 0.04) {
    _sunDir.set(Math.cos(ang) * 0.85, elev, 0.4).normalize();
  } else {
    _sunDir.set(-0.35, 0.72, -0.5).normalize(); // moonlight
  }

  sun.color.copy(s.sun);
  sun.intensity = s.sunI;
  hemi.intensity = s.hemiI;
  hemi.color.copy(s.top).lerp(_a.setHex(0xd5e4f2), 0.35);
  hemi.groundColor.setHex(0x4a463c).multiplyScalar(0.4 + (1 - s.glow) * 0.6);

  sky.uniforms.topColor.value.copy(s.top);
  sky.uniforms.horizonColor.value.copy(s.hor);
  sky.uniforms.sunColor.value.copy(s.sun);
  sky.uniforms.sunDir.value.copy(_sunDir);
  sky.uniforms.sunHaze.value = 0.4 + (1 - s.glow) * 0.8;
  sky.dome.position.copy(camera.position);

  scene.fog.color.copy(s.hor);
  scene.fog.near = 150 - s.glow * 40;
  scene.fog.far = 520 - s.glow * 140;
  if ('environmentIntensity' in scene) scene.environmentIntensity = 0.25 + (1 - s.glow) * 0.75;

  // city lights up at night
  for (const m of city.windowMats) m.emissiveIntensity = 0.06 + s.glow * 1.15;
  city.lampGlowMat.opacity = s.glow * 0.5;
  city.bulbMat.emissiveIntensity = 0.25 + s.glow * 1.3;

  return { glow: s.glow, sunDir: _sunDir };
}
