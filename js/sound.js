// Procedural WebAudio sound: no audio files needed.
let ctx = null;
let master = null;
let noiseBuf = null;

export function initSound() {
  if (ctx) { ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);

  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
}

function noiseShot({ dur, freq, q = 1, gain, type = 'lowpass' }) {
  if (!ctx) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  src.connect(f).connect(g).connect(master);
  src.start(ctx.currentTime, Math.random());
  src.stop(ctx.currentTime + dur + 0.05);
}

export function sfxShot(kind) {
  if (!ctx) return;
  if (kind === 'mg') {
    noiseShot({ dur: 0.08, freq: 1800, gain: 0.28, type: 'bandpass', q: 0.7 });
    noiseShot({ dur: 0.05, freq: 350, gain: 0.2 });
  } else if (kind === 'rpg') {
    noiseShot({ dur: 0.5, freq: 500, gain: 0.4 });
    noiseShot({ dur: 0.25, freq: 1200, gain: 0.2, type: 'bandpass', q: 1.5 });
  } else {
    noiseShot({ dur: 0.12, freq: 2200, gain: 0.32, type: 'bandpass', q: 0.8 });
    noiseShot({ dur: 0.08, freq: 400, gain: 0.24 });
  }
}

export function sfxExplosion() {
  if (!ctx) return;
  noiseShot({ dur: 1.1, freq: 220, gain: 0.8 });
  noiseShot({ dur: 0.4, freq: 900, gain: 0.35 });
  // sub thump
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(80, ctx.currentTime);
  o.frequency.exponentialRampToValueAtTime(28, ctx.currentTime + 0.5);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.7, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
  o.connect(g).connect(master);
  o.start();
  o.stop(ctx.currentTime + 0.65);
}

export function sfxCrash(strength) {
  if (!ctx) return;
  noiseShot({ dur: 0.25, freq: 500, gain: Math.min(0.5, strength * 0.04) });
}

export function sfxPickup() {
  if (!ctx) return;
  const o = ctx.createOscillator();
  o.type = 'square';
  o.frequency.setValueAtTime(660, ctx.currentTime);
  o.frequency.setValueAtTime(990, ctx.currentTime + 0.07);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.12, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
  o.connect(g).connect(master);
  o.start();
  o.stop(ctx.currentTime + 0.2);
}

// quick "thwip" for the web shooter
export function sfxWeb() {
  if (!ctx) return;
  noiseShot({ dur: 0.14, freq: 2600, gain: 0.25, type: 'highpass' });
  noiseShot({ dur: 0.07, freq: 900, gain: 0.1, type: 'bandpass', q: 1.5 });
}

// short ascending arpeggio for mission complete
export function sfxMissionPass() {
  if (!ctx) return;
  const notes = [440, 554, 659, 880];
  notes.forEach((freq, i) => {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const g = ctx.createGain();
    const t0 = ctx.currentTime + i * 0.12;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.16, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.5);
    o.connect(g).connect(master);
    o.start(t0);
    o.stop(t0 + 0.55);
  });
}

// two descending notes for mission failed
export function sfxMissionFail() {
  if (!ctx) return;
  const notes = [392, 262];
  notes.forEach((freq, i) => {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    const g = ctx.createGain();
    const t0 = ctx.currentTime + i * 0.22;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.1, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.45);
    o.connect(g).connect(master);
    o.start(t0);
    o.stop(t0 + 0.5);
  });
}

// far = 0 (overhead) .. 1 (distant): distant strikes rumble lower and quieter
export function sfxThunder(far = Math.random()) {
  if (!ctx) return;
  noiseShot({ dur: 1.8 + far * 1.5, freq: 110 - far * 45, gain: 0.55 * (1 - far * 0.65) });
  if (far < 0.5) noiseShot({ dur: 0.5, freq: 500, gain: 0.18 });
}

// low city ambience: wind + distant traffic, louder by day
export const cityHum = makeLoop(() => {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 240;
  const g = ctx.createGain();
  g.gain.value = 0;
  src.connect(f).connect(g).connect(master);
  src.start();
  return { src, g, stoppables: [src] };
});

export function setHum(vol) {
  if (!cityHum.nodes || !ctx) return;
  cityHum.nodes.g.gain.setTargetAtTime(vol * 0.045, ctx.currentTime, 1.2);
}

// master volume 0..1 (settings menu)
export function setMasterVolume(v) {
  if (!master || !ctx) return;
  master.gain.setTargetAtTime(Math.max(0, Math.min(1, v)) * 0.5, ctx.currentTime, 0.1);
}

// tense chase layer that swells with the wanted level
export const chase = makeLoop(() => {
  const bass = ctx.createOscillator();
  bass.type = 'triangle';
  bass.frequency.value = 55;
  const pulse = ctx.createOscillator(); // pumping gate
  pulse.type = 'square';
  pulse.frequency.value = 2.2;
  const pulseG = ctx.createGain();
  pulseG.gain.value = 0.5;
  const bg = ctx.createGain();
  bg.gain.value = 0;
  pulse.connect(pulseG).connect(bg.gain);
  bass.connect(bg).connect(master);
  // driving hats for high heat
  const hat = ctx.createBufferSource();
  hat.buffer = noiseBuf;
  hat.loop = true;
  const hf = ctx.createBiquadFilter();
  hf.type = 'highpass';
  hf.frequency.value = 7000;
  const hg = ctx.createGain();
  hg.gain.value = 0;
  const tick = ctx.createOscillator();
  tick.type = 'square';
  tick.frequency.value = 4.4;
  const tickG = ctx.createGain();
  tickG.gain.value = 0.5;
  tick.connect(tickG).connect(hg.gain);
  hat.connect(hf).connect(hg).connect(master);
  bass.start(); pulse.start(); hat.start(); tick.start();
  return { bg, hg, stoppables: [bass, pulse, hat, tick] };
});

// heat 0..1: silence -> bass pulse -> full drums
export function setChase(heat) {
  if (!chase.nodes || !ctx) return;
  chase.nodes.bg.gain.setTargetAtTime(heat * 0.09, ctx.currentTime, 0.8);
  chase.nodes.hg.gain.setTargetAtTime(Math.max(0, heat - 0.5) * 0.1, ctx.currentTime, 0.8);
}

// ---------- looped sources (engine / rotor / siren) ----------

function makeLoop(build) {
  return {
    nodes: null,
    start() {
      if (!ctx || this.nodes) return;
      this.nodes = build();
    },
    stop() {
      if (!this.nodes) return;
      for (const n of this.nodes.stoppables) { try { n.stop(); } catch {} }
      this.nodes = null;
    },
  };
}

export const engine = makeLoop(() => {
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.value = 55;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 320;
  const g = ctx.createGain();
  g.gain.value = 0.07;
  o.connect(f).connect(g).connect(master);
  o.start();
  return { o, f, g, stoppables: [o] };
});

export function setEngine(speed) {
  if (!engine.nodes || !ctx) return;
  engine.nodes.o.frequency.setTargetAtTime(50 + speed * 4.5, ctx.currentTime, 0.05);
  engine.nodes.f.frequency.setTargetAtTime(280 + speed * 14, ctx.currentTime, 0.05);
}

export const rotor = makeLoop(() => {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 180;
  const g = ctx.createGain();
  g.gain.value = 0;
  // 13 Hz chop
  const lfo = ctx.createOscillator();
  lfo.type = 'square';
  lfo.frequency.value = 13;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.16;
  lfo.connect(lfoGain).connect(g.gain);
  src.connect(f).connect(g).connect(master);
  src.start();
  lfo.start();
  return { src, g, stoppables: [src, lfo] };
});

// steady rain hiss, volume follows storm intensity
export const rainAmb = makeLoop(() => {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 1500;
  const g = ctx.createGain();
  g.gain.value = 0;
  src.connect(f).connect(g).connect(master);
  src.start();
  return { src, g, stoppables: [src] };
});

export function setRain(vol) {
  if (!rainAmb.nodes || !ctx) return;
  rainAmb.nodes.g.gain.setTargetAtTime(vol * 0.13, ctx.currentTime, 0.6);
}

export const siren = makeLoop(() => {
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.value = 520;
  const lfo = ctx.createOscillator();
  lfo.type = 'square';
  lfo.frequency.value = 0.85;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 110;
  lfo.connect(lfoGain).connect(o.frequency);
  const g = ctx.createGain();
  g.gain.value = 0;
  o.connect(g).connect(master);
  o.start();
  lfo.start();
  return { o, g, stoppables: [o, lfo] };
});

// volume 0..1 based on distance to nearest cop
export function setSiren(vol) {
  if (!siren.nodes || !ctx) return;
  siren.nodes.g.gain.setTargetAtTime(vol * 0.08, ctx.currentTime, 0.15);
}

// ---------- car radio (procedural stations) ----------

export const RADIO_STATIONS = ['RADIO OFF', 'LOFI 88.1', 'DRIVE FM', 'BASS 103'];
let radioNodes = null;

function stopRadio() {
  if (!radioNodes) return;
  for (const n of radioNodes) { try { n.stop(); } catch {} }
  radioNodes = null;
}

// Each station is a small self-running synth patch: oscillators + LFOs, no
// scheduling needed, it just grooves forever until stopped.
export function setRadioStation(i) {
  stopRadio();
  if (!ctx || i <= 0) return;
  const stops = [];
  const bus = ctx.createGain();
  bus.gain.value = 0.05;
  bus.connect(master);

  const osc = (type, freq) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    stops.push(o);
    return o;
  };

  if (i === 1) {
    // LOFI: two warm detuned sines drifting through a slow filter
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    const a = osc('sine', 220);
    const b = osc('sine', 220 * 1.5 + 1.5);
    const lfo = osc('sine', 0.11);
    const lfoG = ctx.createGain();
    lfoG.gain.value = 70;
    lfo.connect(lfoG).connect(a.frequency);
    a.connect(f); b.connect(f); f.connect(bus);
    a.start(); b.start(); lfo.start();
  } else if (i === 2) {
    // DRIVE FM: synthwave saw pad, filter sweeping, hat tick on top
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 600;
    for (const fr of [110, 165, 220]) { const o = osc('sawtooth', fr); o.connect(f); o.start(); }
    const sweep = osc('sine', 0.25);
    const sweepG = ctx.createGain();
    sweepG.gain.value = 380;
    sweep.connect(sweepG).connect(f.frequency);
    sweep.start();
    f.connect(bus);
    const hat = ctx.createBufferSource();
    hat.buffer = noiseBuf;
    hat.loop = true;
    const hf = ctx.createBiquadFilter();
    hf.type = 'highpass';
    hf.frequency.value = 6000;
    const hg = ctx.createGain();
    hg.gain.value = 0;
    const tick = osc('square', 4);
    const tickG = ctx.createGain();
    tickG.gain.value = 0.35;
    tick.connect(tickG).connect(hg.gain);
    hat.connect(hf).connect(hg).connect(bus);
    hat.start(); tick.start();
    stops.push(hat);
  } else {
    // BASS 103: sub sine + square bass hopping between two notes
    const sub = osc('sine', 55);
    sub.connect(bus);
    sub.start();
    const b = osc('square', 110);
    const bg = ctx.createGain();
    bg.gain.value = 0.4;
    const hop = osc('square', 1.1);
    const hopG = ctx.createGain();
    hopG.gain.value = 27; // 110 <-> 137.5-ish
    hop.connect(hopG).connect(b.frequency);
    const bf = ctx.createBiquadFilter();
    bf.type = 'lowpass';
    bf.frequency.value = 500;
    b.connect(bg).connect(bf).connect(bus);
    b.start(); hop.start();
  }
  radioNodes = stops;
}
