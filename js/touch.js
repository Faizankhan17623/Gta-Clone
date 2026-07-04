import { keys, pressed, mouse } from './input.js';

// Touch controls for phones/tablets: a virtual joystick on the left drives
// WASD, dragging the rest of the screen looks around, and buttons cover
// web-swing, shooting, jumping and actions. Everything feeds the exact same
// keys/mouse state the keyboard uses, so every game system works untouched.

// "Touch device" means touch is the PRIMARY pointer (phone/tablet).
// Touch-screen laptops report a fine pointer and keep mouse + keyboard control.
export const isTouch =
  typeof window !== 'undefined' &&
  navigator.maxTouchPoints > 0 &&
  window.matchMedia('(pointer: coarse)').matches;

const STICK_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];

function el(css, text = '') {
  const d = document.createElement('div');
  d.style.cssText = css;
  d.textContent = text;
  return d;
}

const BTN =
  'position:absolute;display:flex;align-items:center;justify-content:center;' +
  'border-radius:50%;color:#fff;font:700 13px Arial;letter-spacing:1px;' +
  'background:rgba(20,26,36,0.55);border:2px solid rgba(255,255,255,0.35);' +
  'user-select:none;-webkit-user-select:none;touch-action:none;';

let uiRoot = null;

// Hidden until the game actually starts, so the menu stays tappable.
export function showTouchUI(on) {
  if (uiRoot) uiRoot.style.display = on ? 'block' : 'none';
}

export function initTouch() {
  if (!isTouch) return false;

  const ui = el('position:fixed;inset:0;z-index:25;pointer-events:none;display:none;');
  ui.id = 'touchui';
  document.body.appendChild(ui);
  uiRoot = ui;

  // ---- virtual joystick (bottom-left) ----
  const pad = el(
    'position:absolute;left:24px;bottom:32px;width:124px;height:124px;border-radius:50%;' +
    'background:rgba(20,26,36,0.4);border:2px solid rgba(255,255,255,0.25);' +
    'pointer-events:auto;touch-action:none;'
  );
  pad.id = 'joypad';
  const nub = el(
    'position:absolute;left:50%;top:50%;width:52px;height:52px;border-radius:50%;' +
    'background:rgba(255,255,255,0.45);transform:translate(-50%,-50%);'
  );
  pad.appendChild(nub);
  ui.appendChild(pad);

  let stickId = null;
  const stickOrigin = { x: 0, y: 0 };

  function setStick(dx, dy) {
    const R = 48;
    const len = Math.hypot(dx, dy) || 1;
    const cx = (Math.abs(dx) > len * 0.38 ? Math.sign(dx) : 0);
    const cy = (Math.abs(dy) > len * 0.38 ? Math.sign(dy) : 0);
    keys['KeyW'] = cy < 0 && len > 14;
    keys['KeyS'] = cy > 0 && len > 14;
    keys['KeyA'] = cx < 0 && len > 14;
    keys['KeyD'] = cx > 0 && len > 14;
    // sprint when the stick is pushed to the rim
    keys['ShiftLeft'] = len > 44 && !downHeld;
    const nx = Math.max(-R, Math.min(R, dx));
    const ny = Math.max(-R, Math.min(R, dy));
    nub.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
  }

  function clearStick() {
    for (const k of STICK_KEYS) keys[k] = false;
    if (!downHeld) keys['ShiftLeft'] = false;
    nub.style.transform = 'translate(-50%,-50%)';
  }

  pad.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    stickId = t.identifier;
    stickOrigin.x = t.clientX;
    stickOrigin.y = t.clientY;
  }, { passive: false });
  pad.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) setStick(t.clientX - stickOrigin.x, t.clientY - stickOrigin.y);
    }
  }, { passive: false });
  const endStick = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) { stickId = null; clearStick(); }
    }
  };
  pad.addEventListener('touchend', endStick);
  pad.addEventListener('touchcancel', endStick);

  // ---- look area: drag anywhere else to turn the camera ----
  const look = el('position:absolute;inset:0;pointer-events:auto;touch-action:none;');
  ui.insertBefore(look, pad);
  let lookId = null;
  let lx = 0;
  let ly = 0;
  look.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    lookId = t.identifier;
    lx = t.clientX;
    ly = t.clientY;
  }, { passive: true });
  look.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier !== lookId) continue;
      mouse.dx += (t.clientX - lx) * 2.2;
      mouse.dy += (t.clientY - ly) * 2.2;
      lx = t.clientX;
      ly = t.clientY;
    }
  }, { passive: false });
  const endLook = (e) => {
    for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null;
  };
  look.addEventListener('touchend', endLook);
  look.addEventListener('touchcancel', endLook);

  // ---- buttons ----
  let downHeld = false;
  function button(label, css, onDown, onUp) {
    const b = el(BTN + 'pointer-events:auto;' + css, label);
    b.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      b.style.background = 'rgba(90,140,220,0.7)';
      onDown();
    }, { passive: false });
    const up = (e) => {
      e.preventDefault();
      b.style.background = 'rgba(20,26,36,0.55)';
      onUp && onUp();
    };
    b.addEventListener('touchend', up);
    b.addEventListener('touchcancel', up);
    ui.appendChild(b);
    return b;
  }

  const press = (k) => { pressed[k] = true; keys[k] = true; };
  const release = (k) => { keys[k] = false; };

  // right-hand cluster
  button('WEB', 'right:24px;bottom:96px;width:86px;height:86px;font-size:16px;',
    () => { mouse.rdown = true; }, () => { mouse.rdown = false; }).id = 'btn-web';
  button('FIRE', 'right:124px;bottom:40px;width:64px;height:64px;',
    () => { mouse.down = true; }, () => { mouse.down = false; }).id = 'btn-fire';
  button('JUMP', 'right:34px;bottom:12px;width:64px;height:64px;',
    () => press('Space'), () => release('Space')).id = 'btn-jump';
  button('▼', 'right:124px;bottom:120px;width:52px;height:52px;',
    () => { downHeld = true; keys['ShiftLeft'] = true; },
    () => { downHeld = false; keys['ShiftLeft'] = false; });
  // actions above the joystick
  button('E', 'left:34px;bottom:176px;width:56px;height:56px;font-size:16px;',
    () => press('KeyE'), () => release('KeyE'));
  button('Q', 'left:104px;bottom:200px;width:50px;height:50px;',
    () => press('KeyQ'), () => release('KeyQ'));
  button('R', 'left:166px;bottom:176px;width:44px;height:44px;',
    () => press('KeyR'), () => release('KeyR'));
  button('F', 'right:210px;bottom:80px;width:56px;height:56px;font-size:16px;',
    () => press('KeyF'), () => release('KeyF')).id = 'btn-punch';
  // top corner utilities
  button('II', 'right:14px;top:52px;width:42px;height:42px;',
    () => press('KeyP'), () => release('KeyP'));
  button('M', 'right:66px;top:52px;width:42px;height:42px;',
    () => press('KeyM'), () => release('KeyM'));

  return true;
}
