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

function namesFor(e) {
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
  return names;
}

export function initInput() {
  window.addEventListener('keydown', (e) => {
    const names = namesFor(e);
    // stop the browser acting on game keys (quick-find, scrolling, shortcuts)
    if (names.some((n) => GAME_KEYS.has(n))) e.preventDefault();
    for (const n of names) {
      if (!e.repeat) pressed[n] = true;
      keys[n] = true;
    }
  });
  window.addEventListener('keyup', (e) => {
    for (const n of namesFor(e)) keys[n] = false;
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
  window.addEventListener('blur', () => {
    for (const k in keys) keys[k] = false;
    mouse.down = false;
    mouse.rdown = false;
  });
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
  if (!gp) return;

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
    if (!gpPrev[k]) pressed[k] = true;
    keys[k] = true;
  }
  for (const k in gpPrev) if (!cur[k]) keys[k] = false;
  gpPrev = cur;
}
