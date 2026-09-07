import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Graphics quality tiers + realism rig (environment lighting, cascaded shadows)
//
// One place decides how heavy the renderer is allowed to be. Everything that
// used to branch on `settings.lowGfx` (a single on/off) now reads a tier:
//
//   low    - phones, weak laptops. No CSM, no AO, no bloom, thin crowd, dpr 1.
//   medium - default. CSM (2 cascades), SMAA, bloom, half crowd on touch.
//   high   - desktop with headroom. CSM (3 cascades), GTAO, SMAA, bloom, LUT.
//
// `lowGfx` in the saved settings still works: true => low, false => auto.
// ---------------------------------------------------------------------------

export const TIERS = ['low', 'medium', 'high'];

const isTouch = typeof window !== 'undefined' &&
  ('ontouchstart' in window || navigator.maxTouchPoints > 0);

// Per-tier caps. Read by main.js (crowd counts, post passes) and by this module.
const TIER_SPEC = {
  low: {
    dpr: 1,
    shadowMap: 1536,
    shadowDistance: 110,
    gtao: false,
    smaa: false,
    bloom: false,
    lut: false,
    anisotropy: 2,
  },
  medium: {
    dpr: isTouch ? 1 : Math.min((typeof devicePixelRatio === 'number' ? devicePixelRatio : 1), 1.75),
    shadowMap: 2048,
    shadowDistance: isTouch ? 150 : 200,
    gtao: false,
    smaa: true,
    bloom: true,
    lut: false,
    anisotropy: isTouch ? 4 : 8,
  },
  high: {
    dpr: Math.min((typeof devicePixelRatio === 'number' ? devicePixelRatio : 1), 2),
    shadowMap: 3072,
    shadowDistance: 300,
    gtao: true,
    smaa: true,
    bloom: true,
    lut: true,
    anisotropy: 16,
  },
};

// Cheap one-shot device probe. Runs once; result cached.
let _autoTier = null;
export function detectTier() {
  if (_autoTier) return _autoTier;
  let tier = 'medium';
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = (dbg && gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '').toLowerCase();
    const cores = navigator.hardwareConcurrency || 4;
    const mem = navigator.deviceMemory || 4;

    if (isTouch) {
      // Phones: default low unless it looks like a flagship.
      tier = /apple a1[5-9]|apple a2\d|adreno 7[3-9]|adreno 8|mali-g7[8-9]|immortalis/.test(gpu)
        ? 'medium' : 'low';
    } else if (/(intel).*(hd|uhd) graphics|llvmpipe|swiftshader|software/.test(gpu)) {
      tier = 'low';
    } else if (cores >= 8 && mem >= 8 && /rtx|radeon rx|arc a|apple m[1-9]|geforce|quadro/.test(gpu)) {
      tier = 'high';
    } else {
      tier = 'medium';
    }
  } catch { /* keep medium */ }
  _autoTier = tier;
  return tier;
}

// Resolve the active tier from saved settings.
//   settings.gfxTier: explicit 'low' | 'medium' | 'high' | 'auto'
//   settings.lowGfx : legacy boolean, true forces low
export function resolveTier(settings) {
  if (settings && settings.gfxTier && settings.gfxTier !== 'auto') {
    return TIERS.includes(settings.gfxTier) ? settings.gfxTier : 'medium';
  }
  if (settings && settings.lowGfx) return 'low';
  return detectTier();
}

export function tierSpec(tier) {
  return TIER_SPEC[tier] || TIER_SPEC.medium;
}

// ---------------------------------------------------------------------------
// Procedural sky -> environment map. Replaces RoomEnvironment (an indoor studio
// probe that made outdoor car paint look wrong). We render a gradient sky +
// sun disc + ground into a cube and PMREM it. Cheap to regenerate, so the
// day/night code can refresh it a few times per cycle.
// ---------------------------------------------------------------------------

function skyEnvScene() {
  const s = new THREE.Scene();
  const geo = new THREE.SphereGeometry(1, 24, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x74a6d8) },
      horizon: { value: new THREE.Color(0xcdd9e4) },
      ground: { value: new THREE.Color(0x5b5a52) },
      sunDir: { value: new THREE.Vector3(0.4, 0.85, 0.3) },
      sunColor: { value: new THREE.Color(0xffe6c2) },
      sunI: { value: 1.0 },
    },
    vertexShader: `
      varying vec3 vd;
      void main() { vd = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: `
      varying vec3 vd;
      uniform vec3 top; uniform vec3 horizon; uniform vec3 ground;
      uniform vec3 sunDir; uniform vec3 sunColor; uniform float sunI;
      void main() {
        vec3 d = normalize(vd);
        vec3 col;
        if (d.y >= 0.0) {
          col = mix(horizon, top, pow(clamp(d.y, 0.0, 1.0), 0.5));
        } else {
          col = mix(horizon, ground, pow(clamp(-d.y, 0.0, 1.0), 0.35));
        }
        float s = max(dot(d, normalize(sunDir)), 0.0);
        col += sunColor * sunI * (pow(s, 900.0) * 3.0 + pow(s, 8.0) * 0.25);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const dome = new THREE.Mesh(geo, mat);
  dome.scale.setScalar(10);
  s.add(dome);
  return { scene: s, uniforms: mat.uniforms };
}

export function createEnvironment(renderer, tier) {
  const spec = tierSpec(tier);
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const { scene: envScene, uniforms } = skyEnvScene();

  let rt = pmrem.fromScene(envScene, 0.02);

  function refresh(params) {
    // params: { top, horizon, ground, sunDir, sunColor, sunI }
    if (params.top) uniforms.top.value.copy(params.top);
    if (params.horizon) uniforms.horizon.value.copy(params.horizon);
    if (params.ground) uniforms.ground.value.copy(params.ground);
    if (params.sunDir) uniforms.sunDir.value.copy(params.sunDir);
    if (params.sunColor) uniforms.sunColor.value.copy(params.sunColor);
    if (typeof params.sunI === 'number') uniforms.sunI.value = params.sunI;
    const next = pmrem.fromScene(envScene, 0.02);
    rt.dispose?.();
    rt = next;
    return rt.texture;
  }

  return {
    texture: rt.texture,
    refresh,
    dispose() { rt.dispose?.(); pmrem.dispose(); },
  };
}

// ---------------------------------------------------------------------------
// Sun shadow. The old rig was a 180 m ortho box centred on the *player*, so it
// wasted half its resolution behind the camera and shimmered when walking.
//
// This keeps a single directional shadow (cheap - one extra draw of the scene,
// not one per cascade) but:
//   - centres it on a point ahead of the camera, not the player
//   - sizes the box per tier
//   - snaps the box origin to shadow-texel steps so it doesn't crawl
//   - raises resolution and softens the edge
//
// CSM was tried and rejected: 3 cascades tripled draw calls (1700 -> 5000) and
// blew the p95 frame budget on the streamed city, for a small visual gain.
// ---------------------------------------------------------------------------

export function createShadowRig(scene, camera, sun, tier) {
  const spec = tierSpec(tier);
  const half = spec.shadowDistance / 2;

  sun.castShadow = true;
  sun.shadow.mapSize.set(spec.shadowMap, spec.shadowMap);
  sun.shadow.camera.left = -half;
  sun.shadow.camera.right = half;
  sun.shadow.camera.top = half;
  sun.shadow.camera.bottom = -half;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = spec.shadowDistance * 2.2;
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.035;
  sun.shadow.camera.updateProjectionMatrix();

  const _dir = new THREE.Vector3(-0.4, 0.85, -0.3).normalize();
  const _center = new THREE.Vector3();
  const _fwd = new THREE.Vector3();
  const texel = (half * 2) / spec.shadowMap;

  return {
    csm: null,
    registerScene() {},   // single directional light needs no per-material setup
    setupMaterial() {},
    setSunDir(dir) { _dir.copy(dir).normalize(); },
    setColor(color, intensity) { sun.color.copy(color); sun.intensity = intensity; },
    // Called from updateCamera once the camera transform is final. `focus` is
    // the player / vehicle position; we bias the shadow box forward along the
    // view so more of it covers what the player is looking at.
    update(focus) {
      camera.getWorldDirection(_fwd);
      _fwd.y = 0;
      if (_fwd.lengthSq() > 1e-4) _fwd.normalize();
      _center.copy(focus).addScaledVector(_fwd, half * 0.55);
      // texel-snap in world space to stop the shadow edge from crawling
      _center.x = Math.round(_center.x / texel) * texel;
      _center.z = Math.round(_center.z / texel) * texel;
      _center.y = 0;
      sun.position.copy(_center).addScaledVector(_dir, spec.shadowDistance);
      sun.target.position.copy(_center);
      sun.target.updateMatrixWorld();
    },
    dispose() {},
  };
}
