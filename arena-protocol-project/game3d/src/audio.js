// Step 39: shooting / reload / hit sounds.
// To avoid requiring downloaded asset files, we SYNTHESIZE short sounds with the
// Web Audio API. (You can later swap these for real samples via Howler.js.)
let ctx = null;
let master = null;
let volume = 0.7;

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  // Browsers suspend audio until a user gesture; resume on demand.
  if (ctx.state === 'suspended') ctx.resume();
  if (!master) { master = ctx.createGain(); master.gain.value = volume; master.connect(ctx.destination); }
  return ctx;
}

// A quick noise burst with a fast decay — works for gunshots / hits.
function noiseBurst({ duration = 0.12, volume = 0.4, lowpass = 1800 } = {}) {
  const c = ac();
  const frames = Math.floor(c.sampleRate * duration);
  const buffer = c.createBuffer(1, frames, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    // Exponential decay envelope.
    const env = Math.pow(1 - i / frames, 2);
    data[i] = (Math.random() * 2 - 1) * env;
  }
  const src = c.createBufferSource();
  src.buffer = buffer;

  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = lowpass;

  const gain = c.createGain();
  gain.gain.value = volume;

  src.connect(filter).connect(gain).connect(master);
  src.start();
}

// A short tone (used for reload click / hit confirm).
function tone({ freq = 440, duration = 0.08, volume = 0.25, type = 'square' } = {}) {
  const c = ac();
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;

  const gain = c.createGain();
  gain.gain.setValueAtTime(volume, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);

  osc.connect(gain).connect(master);
  osc.start();
  osc.stop(c.currentTime + duration);
}

export const sfx = {
  setVolume(value) { volume = Math.max(0, Math.min(1, value)); if (master) master.gain.value = volume; },
  shoot() {
    noiseBurst({ duration: 0.1, volume: 0.35, lowpass: 2500 });
    tone({ freq: 120, duration: 0.08, volume: 0.2, type: 'sawtooth' });
  },
  reload() {
    tone({ freq: 300, duration: 0.05, volume: 0.2, type: 'square' });
    setTimeout(() => tone({ freq: 500, duration: 0.06, volume: 0.2, type: 'square' }), 120);
  },
  hit() {
    tone({ freq: 880, duration: 0.06, volume: 0.25, type: 'sine' });
  },
  empty() {
    tone({ freq: 180, duration: 0.05, volume: 0.15, type: 'square' });
  },
  hurt() {
    noiseBurst({ duration: 0.18, volume: 0.4, lowpass: 800 });
  },
};
