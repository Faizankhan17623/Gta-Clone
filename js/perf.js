// Performance governor + frame meter.
//
// Two jobs:
//  1. Measure a rolling median frame time and, when the game is consistently
//     missing frame budget, quietly shed non-essential per-frame work
//     (`world.perf.detail` drops toward 0; the main loop uses it to stagger
//     character / vehicle close-up detail passes). It steps back up when
//     there's headroom. This never changes the graphics TIER (that needs a
//     reload) — only the soft, per-frame extras.
//  2. An optional on-screen FPS / frame-time / draw-call readout (settings:
//     SHOW FPS METER), handy for players reporting slowdowns.

let world;
let meter = null;
let renderer = null;

const HIST = 90;              // ~1.5s of frames at 60fps
const times = new Float32Array(HIST);
let ti = 0, filled = 0;
let coolT = 0;                // debounce between quality steps
let displayT = 0;

export function initPerf(w, rend) {
  world = w;
  renderer = rend;
  world.perf = {
    fps: 60,
    frameMs: 16.7,
    // 1 = full detail every frame; 0.5 = every other frame; 0 = minimum.
    detail: 1,
    // convenience the main loop calls once per frame: returns true if the
    // expensive detail pass should run THIS frame for a given lane (0..n).
    detailTick(lane = 0) {
      if (world.perf.detail >= 1) return true;
      if (world.perf.detail <= 0.34) return (world._perfFrame % 3) === (lane % 3);
      return (world._perfFrame % 2) === (lane % 2);
    },
  };
  world._perfFrame = 0;
  if (world.settings.showFps === undefined) world.settings.showFps = false;
  buildMeter();
}

function median(n) {
  const a = Array.from(times.subarray(0, n)).sort((x, y) => x - y);
  return a[a.length >> 1];
}

// Called first thing each frame with the real (unscaled) delta in seconds.
export function updatePerf(dtReal) {
  world._perfFrame++;
  const ms = dtReal * 1000;
  times[ti] = ms;
  ti = (ti + 1) % HIST;
  filled = Math.min(HIST, filled + 1);

  if (coolT > 0) coolT -= dtReal;

  if (filled >= 30) {
    const med = median(filled);
    world.perf.frameMs = med;
    world.perf.fps = 1000 / med;

    // Budget: 60fps desktop-ish target is ~17ms; give a comfortable 22ms band
    // before shedding, and require 14ms sustained to add work back.
    if (coolT <= 0) {
      if (med > 24 && world.perf.detail > 0) {
        world.perf.detail = Math.max(0, world.perf.detail - 0.33);
        coolT = 2.5;
      } else if (med < 15 && world.perf.detail < 1) {
        world.perf.detail = Math.min(1, world.perf.detail + 0.33);
        coolT = 3.5;
      }
    }
  }

  // meter
  displayT += dtReal;
  if (meter && world.settings.showFps) {
    meter.style.display = 'block';
    if (displayT > 0.25) {
      displayT = 0;
      const info = renderer?.info?.render;
      meter.textContent =
        `${world.perf.fps.toFixed(0)} FPS  ${world.perf.frameMs.toFixed(1)} ms` +
        (info ? `  ·  ${info.calls} draws  ${(info.triangles / 1000).toFixed(0)}k tris` : '') +
        (world.perf.detail < 1 ? `  ·  detail ${Math.round(world.perf.detail * 100)}%` : '');
    }
  } else if (meter) {
    meter.style.display = 'none';
  }
}

function buildMeter() {
  meter = document.createElement('div');
  meter.id = 'fpsmeter';
  meter.style.cssText =
    'position:fixed;top:8px;left:8px;z-index:7;display:none;pointer-events:none;' +
    'font:700 11px/1.4 Consolas,ui-monospace,monospace;color:#7cf78c;' +
    'background:rgba(6,11,18,.7);padding:3px 8px;border:1px solid rgba(124,247,140,.3);' +
    'letter-spacing:.05em;text-shadow:0 1px 2px #000;';
  document.body.appendChild(meter);
}
