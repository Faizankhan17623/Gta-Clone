// Accessibility & options — key rebinding, colour-blind minimap palettes,
// aim-assist, HUD scale, reduced camera motion.
//
// Everything here is opt-in and stored in `world.settings` so it rides the
// existing autosave. The rebind layer lives in input.js (`setRemap`); this
// module owns the UI and the persistence. Other game modules are untouched:
// they keep checking the same logical key names.

import { setRemap } from './input.js';

// The actions a player can rebind. `logical` is the game key name every module
// already checks; `def` is the physical key it maps from by default.
const BINDABLE = [
  { logical: 'KeyE', label: 'Enter / Interact', def: 'KeyE' },
  { logical: 'KeyF', label: 'Punch / Web-dash', def: 'KeyF' },
  { logical: 'KeyQ', label: 'Web-shot', def: 'KeyQ' },
  { logical: 'KeyC', label: 'Super-jump', def: 'KeyC' },
  { logical: 'KeyT', label: 'Trampoline', def: 'KeyT' },
  { logical: 'KeyR', label: 'Car radio', def: 'KeyR' },
  { logical: 'KeyZ', label: 'Sic REX', def: 'KeyZ' },
  { logical: 'KeyM', label: 'Map', def: 'KeyM' },
  { logical: 'KeyL', label: 'Legend board', def: 'KeyL' },
  { logical: 'KeyG', label: 'Screenshot', def: 'KeyG' },
  { logical: 'KeyO', label: 'Instant replay', def: 'KeyO' },
];

// Colour-blind minimap aid. The minimap has ~40 hard-coded blip colours, so
// rather than rewrite each one we apply a CSS filter to the whole canvas that
// pushes confusable hues apart and lifts contrast. Crude but immediate and
// fully reversible.
export const MAP_FILTERS = {
  default:      '',
  deuteranopia: 'hue-rotate(-25deg) saturate(1.4) contrast(1.12)',
  protanopia:   'hue-rotate(25deg) saturate(1.45) contrast(1.12)',
  tritanopia:   'hue-rotate(200deg) saturate(1.3) contrast(1.1)',
  'high contrast': 'contrast(1.5) saturate(1.6) brightness(1.05)',
};

let world, hooks;
let panel = null;
let capturing = null; // logical key currently listening for a new binding

export function initAccessibility(w, h) {
  world = w;
  hooks = h || {};
  const s = world.settings;
  s.binds = s.binds || {};
  s.mapPalette = s.mapPalette || 'default';
  if (s.aimAssist === undefined) s.aimAssist = false;
  if (s.hudScale === undefined) s.hudScale = 1;
  if (s.reduceMotion === undefined) s.reduceMotion = false;

  applyBinds();
  applyHudScale();
  applyMapFilter();
  world.a11y = {
    aimAssist: () => !!world.settings.aimAssist,
    reduceMotion: () => !!world.settings.reduceMotion,
  };
}

function applyMapFilter() {
  const mm = document.getElementById('minimap');
  if (mm) mm.style.filter = MAP_FILTERS[world.settings.mapPalette] || '';
}

function applyBinds() {
  setRemap(world.settings.binds);
}

function applyHudScale() {
  // scale the two big corner panels — cheap, non-layout-breaking
  const tr = document.getElementById('topright');
  const bl = document.getElementById('bottomleft');
  const sc = world.settings.hudScale;
  if (tr) { tr.style.transformOrigin = 'top right'; tr.style.transform = `scale(${sc})`; }
  if (bl && !document.body.classList.contains('touch')) {
    bl.style.transformOrigin = 'bottom left'; bl.style.transform = `scale(${sc})`;
  }
}

function save() { hooks.onSave?.(); }

// ---------- panel ----------
// Opened from the pause menu via a button. It's a plain overlay; the game is
// already frozen when the pause menu is up.

export function openAccessibility() {
  if (!panel) build();
  refresh();
  panel.style.display = 'flex';
}

export function closeAccessibility() {
  if (panel) panel.style.display = 'none';
  capturing = null;
  hooks.onClose?.();
}

function build() {
  panel = document.createElement('div');
  panel.id = 'a11yui';
  panel.style.cssText =
    'position:fixed;inset:0;z-index:50;display:none;flex-direction:column;align-items:center;' +
    'justify-content:center;background:rgba(6,10,16,0.94);color:#eef4fb;overflow-y:auto;' +
    'font-family:Segoe UI,Inter,Arial,sans-serif;padding:20px;';
  panel.innerHTML =
    '<div style="font:900 26px Segoe UI,sans-serif;letter-spacing:.2em;color:#55e6ff;margin-bottom:14px">ACCESSIBILITY</div>' +
    '<div id="a11y-body" style="width:min(560px,94vw);background:rgba(12,20,30,.7);' +
    'border:1px solid rgba(85,230,255,.3);padding:16px 20px;' +
    'clip-path:polygon(12px 0,100% 0,100% calc(100% - 12px),calc(100% - 12px) 100%,0 100%,0 12px)"></div>' +
    '<div style="display:flex;gap:10px;margin-top:14px">' +
    '<button id="a11y-reset" style="' + BTN + ';background:transparent;color:#ff9a90;box-shadow:inset 0 0 0 1px rgba(255,91,82,.5)">RESET BINDINGS</button>' +
    '<button id="a11y-close" style="' + BTN + '">DONE</button></div>';
  document.body.appendChild(panel);
  panel.querySelector('#a11y-close').onclick = closeAccessibility;
  panel.querySelector('#a11y-reset').onclick = () => {
    world.settings.binds = {};
    applyBinds();
    save();
    refresh();
  };

  // capture a keypress for whichever binding row is armed
  window.addEventListener('keydown', (e) => {
    if (!capturing || panel.style.display === 'none') return;
    e.preventDefault();
    e.stopPropagation();
    const code = e.code;
    if (code === 'Escape') { capturing = null; refresh(); return; }
    // physical WASD, Ctrl, Shift, Space stay reserved for movement/aim/jump
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight',
         'ControlLeft', 'ControlRight', 'Tab'].includes(code)) return;
    if (!/^Key[A-Z]$|^Digit[0-9]$|^F[0-9]{1,2}$/.test(code)) return;
    // set: this physical code now produces the logical action
    const binds = world.settings.binds;
    // clear any other physical key that was mapped to this action
    for (const k in binds) if (binds[k] === capturing) delete binds[k];
    if (code !== capturing) binds[code] = capturing;
    capturing = null;
    applyBinds();
    save();
    refresh();
  }, true);
}

function currentPhysicalFor(logical) {
  const binds = world.settings.binds;
  for (const k in binds) if (binds[k] === logical) return k;
  return logical; // identity
}

function pretty(code) {
  return code.replace(/^Key/, '').replace(/^Digit/, '');
}

function refresh() {
  const s = world.settings;
  const body = panel.querySelector('#a11y-body');
  body.innerHTML =
    section('DISPLAY') +
    toggleRow('reduceMotion', 'Reduce camera motion', s.reduceMotion) +
    selectRow('mapPalette', 'Minimap colours', s.mapPalette,
      ['default', 'deuteranopia', 'protanopia', 'tritanopia', 'high contrast']) +
    rangeRow('hudScale', 'HUD size', s.hudScale, 0.7, 1.4, 0.05) +
    section('AIM') +
    toggleRow('aimAssist', 'Aim assist (gentle target pull)', s.aimAssist) +
    section('KEY BINDINGS') +
    BINDABLE.map((b) => bindRow(b)).join('') +
    '<div style="font:600 10px Consolas,monospace;color:#9fb2c8;margin-top:8px;letter-spacing:.05em">' +
    'Click a key, then press the new key. Esc cancels. WASD / Shift / Ctrl / Space are fixed.</div>';

  body.querySelectorAll('[data-toggle]').forEach((cb) => {
    cb.onchange = () => { s[cb.dataset.toggle] = cb.checked; onChange(cb.dataset.toggle); };
  });
  body.querySelectorAll('[data-select]').forEach((sel) => {
    sel.onchange = () => { s[sel.dataset.select] = sel.value; onChange(sel.dataset.select); };
  });
  body.querySelectorAll('[data-range]').forEach((r) => {
    r.oninput = () => { s[r.dataset.range] = parseFloat(r.value); onChange(r.dataset.range); };
  });
  body.querySelectorAll('[data-bind]').forEach((btn) => {
    btn.onclick = () => { capturing = btn.dataset.bind; refresh(); };
  });
}

function onChange(key) {
  if (key === 'hudScale') applyHudScale();
  if (key === 'mapPalette') applyMapFilter();
  save();
}

const ROW = 'display:flex;justify-content:space-between;align-items:center;margin:8px 0;font:700 12px Consolas,monospace;letter-spacing:.06em;color:#cfd8e3;';
function section(t) {
  return `<div style="font:800 11px Consolas,monospace;letter-spacing:.28em;color:#55e6ff;margin:14px 0 4px">${t}</div>`;
}
function toggleRow(key, label, val) {
  return `<label style="${ROW}"><span>${label}</span><input type="checkbox" data-toggle="${key}" ${val ? 'checked' : ''}></label>`;
}
function selectRow(key, label, val, opts) {
  return `<label style="${ROW}"><span>${label}</span><select data-select="${key}" style="background:#0d1826;color:#eef4fb;border:1px solid rgba(85,230,255,.3);padding:3px 6px;font:inherit">` +
    opts.map((o) => `<option value="${o}" ${o === val ? 'selected' : ''}>${o}</option>`).join('') +
    `</select></label>`;
}
function rangeRow(key, label, val, min, max, step) {
  return `<label style="${ROW}"><span>${label} (${(+val).toFixed(2)})</span>` +
    `<input type="range" data-range="${key}" min="${min}" max="${max}" step="${step}" value="${val}" style="accent-color:#55e6ff"></label>`;
}
function bindRow(b) {
  const cur = capturing === b.logical ? '…press key…' : pretty(currentPhysicalFor(b.logical));
  return `<div style="${ROW}"><span>${b.label}</span>` +
    `<button data-bind="${b.logical}" style="${KEYBTN}${capturing === b.logical ? 'background:#ffd24a;color:#111' : ''}">${cur}</button></div>`;
}

const BTN =
  'cursor:pointer;font:900 13px Consolas,monospace;letter-spacing:.14em;text-transform:uppercase;' +
  'color:#06131a;background:#55e6ff;border:none;padding:11px 22px;' +
  'clip-path:polygon(9px 0,100% 0,100% calc(100% - 9px),calc(100% - 9px) 100%,0 100%,0 9px);';
const KEYBTN =
  'cursor:pointer;min-width:64px;font:800 12px Consolas,monospace;color:#eef4fb;' +
  'background:rgba(85,230,255,.12);border:1px solid rgba(85,230,255,.4);padding:5px 10px;border-radius:5px;';
