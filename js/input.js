// Keyboard + mouse input. `keys` is held state, `pressed` is true only on the
// frame the key went down (cleared by endFrame).
//
// Robust to keyboard layouts: a key registers both by physical position
// (e.code, e.g. 'KeyD') and by the letter it types (e.key 'd' -> 'KeyD'),
// so WASD works on QWERTY, AZERTY, Dvorak and remapped keyboards alike.
export const keys = Object.create(null);
export const pressed = Object.create(null);
export const mouse = { dx: 0, dy: 0, down: false, rdown: false };

const GAME_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD']);
const sources = new Map();
const keyboardHeld = new Map();

// Independent owners: releasing a joystick/gamepad must not release a keyboard.
export function setInputKey(source, name, down) {
  let held = sources.get(source);
  if (!held) { held = new Set(); sources.set(source, held); }
  if (down) held.add(name); else held.delete(name);
  const active = [...sources.values()].some(s => s.has(name));
  if (active && !keys[name]) pressed[name] = true;
  keys[name] = active;
}

export function clearInput() {
  sources.clear(); keyboardHeld.clear();
  for (const k in keys) keys[k] = false;
  for (const k in pressed) delete pressed[k];
  mouse.down = mouse.rdown = false;
  mouse.dx = mouse.dy = 0;
}

export function namesFor(e) {
  // A remapped D on the physical A key must not activate both opposites.
  const letter = e.key?.toLowerCase();
  if (['w', 'a', 's', 'd'].includes(letter)) return ['Key' + letter.toUpperCase()];
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) return [e.code];
  const names = [];
  if (e.code) names.push(e.code);
  if (e.key) {
    if (e.key === ' ') names.push('Space');
    else if (e.key.length === 1) {
      const c = e.key.toLowerCase();
      if (c >= 'a' && c <= 'z') names.push('Key' + c.toUpperCase());
      else if (c >= '0' && c <= '9') names.push('Digit' + c);
    } else {
      names.push(e.key); // 'Shift', 'ArrowLeft', ...
      if (e.key === 'Shift') names.push('ShiftLeft');
    }
  }
  // Some embedded browsers, virtual keyboards, and older automation drivers
  // omit `code`/`key` and only expose the legacy numeric keyCode/which value.
  const legacy = e.keyCode || e.which;
  if (!names.length) {
    if (legacy >= 65 && legacy <= 90) names.push('Key' + String.fromCharCode(legacy));
    else if (legacy === 32) names.push('Space');
    else if (legacy >= 37 && legacy <= 40) names.push(['ArrowLeft','ArrowUp','ArrowRight','ArrowDown'][legacy - 37]);
  }
  return [...new Set(names)];
}

export function initInput() {
  window.addEventListener('keydown', (e) => {
    const names = namesFor(e);
    if (e.target?.matches?.('input, textarea, select, [contenteditable="true"]')) return;
    // stop the browser acting on game keys (quick-find, scrolling, shortcuts)
    if (names.some((n) => GAME_KEYS.has(n))) e.preventDefault();
    const id = e.code || String(e.keyCode || e.which || e.key);
    if (!keyboardHeld.has(id)) keyboardHeld.set(id, names);
    for (const n of keyboardHeld.get(id)) setInputKey('keyboard:' + id, n, true);
  });
  window.addEventListener('keyup', (e) => {
    const id = e.code || String(e.keyCode || e.which || e.key);
    for (const n of keyboardHeld.get(id) || namesFor(e)) setInputKey('keyboard:' + id, n, false);
    keyboardHeld.delete(id);
  });
  window.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement) { mouse.dx += e.movementX; mouse.dy += e.movementY; }
  });
  window.addEventListener('mousedown', (e) => {
    if (e.button === 0) mouse.down = true;
    if (e.button === 2) mouse.rdown = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.down = false;
    if (e.button === 2) mouse.rdown = false;
  });
  // right mouse is the web-shooter — keep the browser menu out of the way
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('blur', clearInput);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearInput(); });
  // The visible WASD controls also work as hold buttons, not just indicators.
  for (const letter of ['w', 'a', 's', 'd']) {
    const button = document.getElementById('k-' + letter);
    if (!button) continue;
    const name = 'Key' + letter.toUpperCase();
    button.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation(); button.setPointerCapture(e.pointerId);
      setInputKey('hud:' + letter, name, true);
    });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(event, e => {
      e.preventDefault(); e.stopPropagation(); setInputKey('hud:' + letter, name, false);
    });
  }
}

export function endFrame() {
  for (const k in pressed) delete pressed[k];
  mouse.dx = 0;
  mouse.dy = 0;
}

// ---------------- gamepad ----------------
// Polled once per frame; maps onto the same keys/pressed/mouse the keyboard
// uses, so every game system gets controller support for free.
// Left stick move · right stick camera · A jump/up · B sprint/down · X enter
// Y web-attack · LB radio · RB/LT web-swing · RT shoot

let gpPrev = Object.create(null);
let gpFire = false;
let gpWeb = false;
let gpActive = false; // ignore pads until a real button press — RGB software
                      // and some drivers register phantom gamepads whose idle
                      // axes rest at -1, which would hold a movement key forever

export function pollGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let gp = null;
  for (const p of pads) if (p && p.connected) { gp = p; break; }
  if (!gp) {
    for (const k in gpPrev) setInputKey('gamepad', k, false);
    gpPrev = Object.create(null); gpActive = false;
    if (gpFire) mouse.down = false;
    if (gpWeb) mouse.rdown = false;
    gpFire = gpWeb = false;
    return;
  }

  if (!gpActive) {
    for (const b of gp.buttons) {
      if (b && b.pressed) { gpActive = true; break; }
    }
    if (!gpActive) return;
  }

  const cur = Object.create(null);
  const ax = (i) => gp.axes[i] || 0;
  if (ax(1) < -0.35) cur['KeyW'] = true;
  if (ax(1) > 0.35) cur['KeyS'] = true;
  if (ax(0) < -0.35) cur['KeyA'] = true;
  if (ax(0) > 0.35) cur['KeyD'] = true;
  if (Math.abs(ax(2)) > 0.2) mouse.dx += ax(2) * 16;
  if (Math.abs(ax(3)) > 0.2) mouse.dy += ax(3) * 12;

  const btn = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
  if (btn(0)) cur['Space'] = true;
  if (btn(1)) cur['ShiftLeft'] = true;
  if (btn(2)) cur['KeyE'] = true;
  if (btn(3)) cur['KeyQ'] = true;
  if (btn(4)) cur['KeyR'] = true;

  const fire = btn(7);
  if (fire !== gpFire) { mouse.down = fire; gpFire = fire; }
  const webBtn = btn(5) || btn(6);
  if (webBtn !== gpWeb) { mouse.rdown = webBtn; gpWeb = webBtn; }

  for (const k in cur) {
    setInputKey('gamepad', k, true);
  }
  for (const k in gpPrev) if (!cur[k]) setInputKey('gamepad', k, false);
  gpPrev = cur;
}
