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
