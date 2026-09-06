import { RADIO_STATIONS, setRadioStation } from './sound.js';
import { showNews } from './hud.js';

// RADIO WHEEL: hold R in a vehicle to open a station selector. Flick left/
// right (A/D or arrows) to move the highlight, release R to tune in. A DJ
// line drops on the ticker when you land on a music station. Tapping R
// still cycles stations the old way when the wheel is closed.

const DJ_LINES = {
  'LOFI 88.1': ['LOFI 88.1 — "stay soft out there"', 'LOFI 88.1 — rain-on-glass hour continues'],
  'DRIVE FM': ['DRIVE FM — "eyes on the road, hands on the wheel"', 'DRIVE FM — traffic is light, the night is long'],
  'BASS 103': ['BASS 103 — "turn it UP"', 'BASS 103 — sub-bass check, one two'],
  'DESI 96.3': ['DESI 96.3 — dhol drop incoming', 'DESI 96.3 — "yeh gaana sabke liye"'],
  'NITE JAZZ': ['NITE JAZZ — "for the ones still awake"', 'NITE JAZZ — brushed snare, blue light'],
};

let el = null;

function ensureUI() {
  if (el) return el;
  el = document.createElement('div');
  el.id = 'radiowheel';
  el.style.cssText =
    'position:fixed;left:50%;bottom:120px;transform:translateX(-50%);z-index:32;display:none;' +
    'pointer-events:none;background:rgba(8,15,24,0.86);border:1px solid rgba(85,230,255,0.35);' +
    'padding:10px 14px 12px;text-align:center;' +
    'clip-path:polygon(11px 0,100% 0,100% calc(100% - 11px),calc(100% - 11px) 100%,0 100%,0 11px);';
  el.innerHTML =
    '<div style="font:800 9px Consolas,monospace;letter-spacing:.3em;color:#8ea6bb;margin-bottom:7px">TUNER — hold R, A/D to pick</div>' +
    '<div id="radiowheel-row" style="display:flex;gap:6px"></div>';
  document.body.appendChild(el);
  return el;
}

export function initCarRadioWheel(world) {
  world.radioWheel = { open: false, sel: world.radioSt | 0, hold: 0, moveCd: 0 };
  ensureUI();
}

function render(world) {
  const row = document.getElementById('radiowheel-row');
  if (!row) return;
  const rw = world.radioWheel;
  row.innerHTML = RADIO_STATIONS.map((name, i) => {
    const on = i === rw.sel;
    return `<span style="font:800 11px Consolas,monospace;letter-spacing:.08em;padding:5px 9px;` +
      `color:${on ? '#06131a' : '#cfd8e3'};background:${on ? '#55e6ff' : 'rgba(140,170,190,.12)'};` +
      `clip-path:polygon(5px 0,100% 0,100% calc(100% - 5px),calc(100% - 5px) 100%,0 100%,0 5px)">${name}</span>`;
  }).join('');
}

export function updateCarRadioWheel(world, dt, keys, pressed) {
  const rw = world.radioWheel;
  if (!rw) return;
  const inCar = world.player.inCar && !world.player.inCar.tank;

  if (!inCar) {
    if (rw.open) { rw.open = false; el.style.display = 'none'; }
    return;
  }

  const holding = !!keys['KeyR'];
  if (holding) rw.hold += dt; else rw.hold = 0;

  // open after a short press-and-hold; a quick tap is handled by main.js
  if (holding && rw.hold > 0.22 && !rw.open) {
    rw.open = true;
    rw.sel = world.radioSt | 0;
    el.style.display = 'block';
    render(world);
  }

  if (rw.open) {
    rw.moveCd = Math.max(0, rw.moveCd - dt);
    const left = keys['KeyA'] || keys['ArrowLeft'];
    const right = keys['KeyD'] || keys['ArrowRight'];
    if (rw.moveCd <= 0 && (left || right)) {
      rw.moveCd = 0.18;
      rw.sel = (rw.sel + (right ? 1 : RADIO_STATIONS.length - 1)) % RADIO_STATIONS.length;
      render(world);
    }
    if (!holding) {
      // released — commit
      rw.open = false;
      el.style.display = 'none';
      world.radioSt = rw.sel;
      setRadioStation(world.radioSt);
      const name = RADIO_STATIONS[world.radioSt];
      const lines = DJ_LINES[name];
      if (lines) showNews(lines[(Math.random() * lines.length) | 0]);
      world.onSave?.();
    }
  }
}

// True while the wheel is (or is about to be) open, so main.js skips its
// tap-R cycle and doesn't double-fire.
export function radioWheelBusy(world) {
  const rw = world.radioWheel;
  return !!rw && (rw.open || rw.hold > 0.22);
}
