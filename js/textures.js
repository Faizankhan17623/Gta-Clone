import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Procedural PBR surfaces. The game ships no binary texture files (keeps the
// PWA small and offline-safe), so realism-grade surfaces are generated from
// canvas noise at load: a colour map, a matching normal map derived from the
// same height field, and a roughness map so wet spots / polished patches catch
// light differently from dry aggregate.
//
// One height field -> three coherent maps. That coherence (bumps darken *and*
// push normals *and* roughen) is what separates this from a flat colour swatch.
// ---------------------------------------------------------------------------

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

// Value-noise height field, tileable, summed over a few octaves. Returns a
// Float32Array in [0,1], row-major size x size.
function heightField(size, seed, octaves = 4, persistence = 0.55) {
  let s = seed >>> 0;
  const rand = () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const out = new Float32Array(size * size);
  let amp = 1, ampSum = 0;

  for (let o = 0; o < octaves; o++) {
    const cells = 2 << o;              // 2,4,8,16 grid points, tileable
    const g = new Float32Array((cells + 1) * (cells + 1));
    for (let y = 0; y <= cells; y++) {
      for (let x = 0; x <= cells; x++) {
        // wrap the last row/col back to the first so the tile seams
        const gx = x % cells, gy = y % cells;
        g[y * (cells + 1) + x] = g[gy * (cells + 1) + gx] || rand();
      }
    }
    const step = size / cells;
    for (let y = 0; y < size; y++) {
      const fy = y / step, iy = Math.floor(fy), ty = fy - iy;
      const sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < size; x++) {
        const fx = x / step, ix = Math.floor(fx), tx = fx - ix;
        const sx = tx * tx * (3 - 2 * tx);
        const a = g[iy * (cells + 1) + ix];
        const b = g[iy * (cells + 1) + ix + 1];
        const c = g[(iy + 1) * (cells + 1) + ix];
        const d = g[(iy + 1) * (cells + 1) + ix + 1];
        const v = a * (1 - sx) * (1 - sy) + b * sx * (1 - sy) + c * (1 - sx) * sy + d * sx * sy;
        out[y * size + x] += v * amp;
      }
    }
    ampSum += amp;
    amp *= persistence;
  }

  for (let i = 0; i < out.length; i++) out[i] /= ampSum;
  return out;
}

// Sobel the height field into a tangent-space normal map.
function normalFromHeight(height, size, strength) {
  const data = new Uint8Array(size * size * 4);
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      // normal = normalize(-dx, -dy, 1)
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      data[i] = Math.round((-dx / len * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round((-dy / len * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

function grayTexture(fn, size) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = Math.round(fn(i) * 255);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------
// Asphalt: dark aggregate, coarse grain, occasional light patch and hairline
// crack. Used for the main road surface.
// ---------------------------------------------------------------------------
export function asphaltPBR({ size = 256, seed = 104, anisotropy = 8 } = {}) {
  const h = heightField(size, seed, 5, 0.5);

  // colour: dark grey, modulated by height (bumps catch light lighter,
  // pits darker), plus a few paler filler patches
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  let s = (seed * 2654435761) >>> 0;
  const rand = () => { s = Math.imul(s ^ (s >>> 15), 2246822519); s = (s ^ (s >>> 13)) >>> 0; return s / 4294967296; };
  for (let i = 0; i < size * size; i++) {
    const hv = h[i];
    let base = 46 + hv * 34;                 // 46..80
    if (rand() > 0.994) base += 22;          // filler patch fleck
    const tint = base + (rand() - 0.5) * 6;
    img.data[i * 4] = tint;
    img.data[i * 4 + 1] = tint + 1;
    img.data[i * 4 + 2] = tint + 3;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = anisotropy;
  map.needsUpdate = true;

  const normalMap = normalFromHeight(h, size, 2.6);
  normalMap.anisotropy = anisotropy;

  // roughness: mostly rough (0.9), smoother where the surface is high/polished
  const roughnessMap = grayTexture((i) => 0.96 - h[i] * 0.28, size);
  roughnessMap.anisotropy = anisotropy;

  return { map, normalMap, roughnessMap };
}

// ---------------------------------------------------------------------------
// Concrete paving: lighter, finer grain, faint slab seams handled by the
// caller's existing geometry/markings.
// ---------------------------------------------------------------------------
export function concretePBR({ size = 256, seed = 91, anisotropy = 8 } = {}) {
  const h = heightField(size, seed, 4, 0.6);

  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  let s = (seed * 40503) >>> 0;
  const rand = () => { s = Math.imul(s ^ (s >>> 15), 2246822519); s = (s ^ (s >>> 13)) >>> 0; return s / 4294967296; };
  for (let i = 0; i < size * size; i++) {
    const hv = h[i];
    let base = 118 + hv * 26;
    if (rand() > 0.997) base -= 30;          // stain
    const tint = base + (rand() - 0.5) * 5;
    img.data[i * 4] = tint + 4;
    img.data[i * 4 + 1] = tint + 3;
    img.data[i * 4 + 2] = tint;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = anisotropy;
  map.needsUpdate = true;

  const normalMap = normalFromHeight(h, size, 1.8);
  normalMap.anisotropy = anisotropy;

  const roughnessMap = grayTexture((i) => 0.9 - h[i] * 0.22, size);
  roughnessMap.anisotropy = anisotropy;

  return { map, normalMap, roughnessMap };
}
