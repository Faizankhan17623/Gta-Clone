import { keys, pressed, mouse, setInputKey } from './input.js';

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
const kioskBtns = [];
const ctxBtns = {};
const groups = { foot: [], vehicle: [], tray: [] }; // buttons tagged by when they're relevant
let trayOpen = false;
let trayToggleBtn = null;
let lastMode = 'foot';
let runReset = () => {}; // clears the on-foot sprint toggle

// Digit buttons shown while the player stands at a shop kiosk.
export function showKioskButtons(on) {
  for (const b of kioskBtns) b.style.display = on ? 'flex' : 'none';
}

// Context buttons (arena H, buy-property B) shown only when the action applies.
export function showContextButtons(states) {
  for (const [key, on] of Object.entries(states)) {
    if (ctxBtns[key]) ctxBtns[key].style.display = on ? 'flex' : 'none';
  }
}

// Swap the always-on button set between on-foot and in-vehicle so the screen
// only ever shows controls that do something right now. Called from main.js.
export function setTouchMode(mode) {
  if (!uiRoot || mode === lastMode) return;
  lastMode = mode;
  for (const b of groups.foot) b.style.display = mode === 'foot' ? 'flex' : 'none';
  for (const b of groups.vehicle) b.style.display = mode === 'vehicle' ? 'flex' : 'none';
  if (mode !== 'foot') runReset(); // don't leave sprint stuck on when you get in a car
}

// The "⋯" tray holds the rare buttons (map, photo, jetpack, REX, legend...).
// Collapsed by default so the HUD isn't a wall of circles.
function applyTray() {
  for (const b of groups.tray) b.style.display = trayOpen ? 'flex' : 'none';
  if (trayToggleBtn) trayToggleBtn.textContent = trayOpen ? '✕' : '⋯';
}

// Hidden until the game actually starts, so the menu stays tappable.
export function showTouchUI(on) {
  if (uiRoot) uiRoot.style.display = on ? 'block' : 'none';
  if (on) {
    trayOpen = false;
    applyTray();
    // re-assert the current mode's visibility (buttons may have been toggled)
    const m = lastMode; lastMode = null; setTouchMode(m);
  } else {
    runReset(); // menu/pause opened — don't keep the player sprinting
  }
}

export function initTouch() {
  if (!isTouch) return false;
  document.body.classList.add('touch'); // lets the HUD CSS restack itself

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
    const R = 52;
    const len = Math.hypot(dx, dy) || 1;
    const cx = (Math.abs(dx) > len * 0.38 ? Math.sign(dx) : 0);
    const cy = (Math.abs(dy) > len * 0.38 ? Math.sign(dy) : 0);
    // Deadzone so a resting thumb doesn't drift the player.
    const moving = len > 20;
    setInputKey('touch-stick', 'KeyW', moving && cy < 0);
    setInputKey('touch-stick', 'KeyS', moving && cy > 0);
    setInputKey('touch-stick', 'KeyA', moving && cx < 0);
    setInputKey('touch-stick', 'KeyD', moving && cx > 0);
    // NO auto-sprint from the stick — it made the player run flat-out almost
    // all the time. Sprint is the dedicated RUN toggle button now.
    const nx = Math.max(-R, Math.min(R, dx));
    const ny = Math.max(-R, Math.min(R, dy));
    nub.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
  }

  function clearStick() {
    for (const k of STICK_KEYS) setInputKey('touch-stick', k, false);
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
  // `group`: 'foot' | 'vehicle' | 'tray' | 'always'. Foot/vehicle swap with the
  // player's state; tray buttons hide behind the ⋯ toggle.
  function button(label, css, onDown, onUp, group = 'always') {
    const hidden = group === 'tray' ? 'display:none;' : '';
    const b = el(BTN + 'pointer-events:auto;' + hidden + css, label);
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
    if (groups[group]) groups[group].push(b);
    return b;
  }

  const press = (k) => { setInputKey('touch-button', k, true); };
  const release = (k) => { setInputKey('touch-button', k, false); };
  // a tray button that fires a one-shot key and auto-closes the tray
  const trayTap = (k) => { press(k); setTimeout(() => { release(k); trayOpen = false; applyTray(); }, 90); };

  // ================= CORE — always on screen =================

  // right-hand action cluster (thumb reach)
  button('WEB', 'right:22px;bottom:92px;width:88px;height:88px;font-size:15px;',
    () => { mouse.rdown = true; }, () => { mouse.rdown = false; }, 'foot').id = 'btn-web';
  button('FIRE', 'right:120px;bottom:34px;width:66px;height:66px;',
    () => { mouse.down = true; }, () => { mouse.down = false; }).id = 'btn-fire';
  button('F', 'right:118px;bottom:110px;width:56px;height:56px;font-size:16px;',
    () => press('KeyF'), () => release('KeyF'), 'foot').id = 'btn-punch';

  // JUMP / brake — same spot, on foot it's Space, in a car it's the handbrake
  button('JUMP', 'right:30px;bottom:10px;width:66px;height:66px;',
    () => press('Space'), () => release('Space'), 'foot').id = 'btn-jump';
  button('⏸ BRK', 'right:30px;bottom:10px;width:66px;height:66px;font-size:12px;',
    () => press('Space'), () => release('Space'), 'vehicle').id = 'btn-brake';

  // RUN — a sprint TOGGLE on foot (the joystick no longer auto-sprints).
  // Tap to lock sprint on, tap again to walk. Turns cyan while active.
  {
    let running = false;
    const runBtn = el(BTN + 'pointer-events:auto;left:168px;bottom:170px;width:52px;height:52px;font-size:12px;', 'RUN');
    const paint = () => {
      runBtn.style.background = running ? 'rgba(85,230,255,0.75)' : 'rgba(20,26,36,0.55)';
      runBtn.style.borderColor = running ? '#55e6ff' : 'rgba(255,255,255,0.35)';
      runBtn.style.color = running ? '#06131a' : '#fff';
    };
    runBtn.addEventListener('touchstart', (e) => {
      e.preventDefault(); e.stopPropagation();
      running = !running;
      setInputKey('touch-run', 'ShiftLeft', running);
      paint();
    }, { passive: false });
    ui.appendChild(runBtn);
    groups.foot.push(runBtn);
    // clear sprint when leaving foot mode / hiding the UI
    runReset = () => { running = false; setInputKey('touch-run', 'ShiftLeft', false); paint(); };
  }

  // heli descend — vehicle mode only (was the old "down" button)
  button('▼', 'right:198px;bottom:66px;width:50px;height:50px;',
    () => setInputKey('touch-button', 'ShiftLeft', true),
    () => setInputKey('touch-button', 'ShiftLeft', false), 'vehicle');

  // E — enter/exit vehicle, interact. Relevant in BOTH modes.
  button('E', 'left:168px;bottom:100px;width:58px;height:58px;font-size:16px;',
    () => press('KeyE'), () => release('KeyE'));
  // Q — web-shot, on foot only
  button('Q', 'left:234px;bottom:122px;width:48px;height:48px;',
    () => press('KeyQ'), () => release('KeyQ'), 'foot');
  // WPN — cycle weapon, on foot (combat needs it handy, not in the tray)
  button('WPN', 'right:198px;bottom:120px;width:48px;height:48px;font-size:10px;',
    () => press('KeyX'), () => release('KeyX'), 'foot').id = 'btn-wpn';
  // radio — vehicle only
  button('📻', 'left:168px;bottom:100px;width:52px;height:52px;font-size:18px;',
    () => press('KeyR'), () => release('KeyR'), 'vehicle');

  // ================= TRAY — behind the ⋯ toggle =================
  // 8 rare buttons in a 2-col grid on the right edge, below the ⋯ toggle.
  // 48px cells x 4 rows = 192px, fits a short landscape phone.
  const trayCell = (n) => {
    const col = n % 2, rowN = (n / 2) | 0;
    return `right:${16 + col * 52}px;top:${168 + rowN * 50}px;width:44px;height:44px;`;
  };
  button('MAP', trayCell(0) + 'font-size:11px;', () => trayTap('KeyM'), null, 'tray');
  button('II',  trayCell(1), () => trayTap('KeyP'), null, 'tray');           // pause
  button('📸',  trayCell(2) + 'font-size:17px;', () => trayTap('KeyG'), null, 'tray');
  button('🎬',  trayCell(3) + 'font-size:15px;', () => trayTap('KeyO'), null, 'tray'); // replay
  button('JET', trayCell(4) + 'font-size:10px;', () => trayTap('KeyJ'), null, 'tray');
  button('REX', trayCell(5) + 'font-size:10px;', () => trayTap('KeyZ'), null, 'tray');
  button('VIG', trayCell(6) + 'font-size:10px;', () => trayTap('KeyV'), null, 'tray');
  button('👑',  trayCell(7) + 'font-size:15px;', () => trayTap('KeyL'), null, 'tray'); // legend board

  // the ⋯ toggle itself (always visible, top-right)
  trayToggleBtn = el(BTN + 'pointer-events:auto;right:16px;top:112px;width:46px;height:46px;font-size:20px;', '⋯');
  trayToggleBtn.addEventListener('touchstart', (e) => {
    e.preventDefault(); e.stopPropagation();
    trayOpen = !trayOpen;
    applyTray();
  }, { passive: false });
  ui.appendChild(trayToggleBtn);

  // 1-4 digit row: appears only while standing at a kiosk (casino, wardrobe...)
  for (let i = 1; i <= 4; i++) {
    const b = button(String(i),
      `left:calc(50% + ${(i - 2.5) * 58}px);top:118px;width:48px;height:48px;font-size:17px;display:none;`,
      () => press('Digit' + i), () => release('Digit' + i));
    b.className = 'kioskbtn';
    kioskBtns.push(b);
  }

  // contextual actions in the freed-up bottom centre — shown only when the
  // action is actually in reach (driven from main.js via showContextButtons):
  // FIGHT at the arena ring, BUY under a property beam, BRIBE next to a cop.
  ctxBtns.arena = button('FIGHT', 'left:calc(50% - 34px);bottom:14px;width:68px;height:68px;font-size:14px;display:none;background:rgba(160,40,30,0.6);',
    () => press('KeyH'), () => release('KeyH'));
  ctxBtns.arena.id = 'btn-arena';
  ctxBtns.buy = button('BUY', 'left:calc(50% - 30px);bottom:16px;width:60px;height:60px;font-size:15px;display:none;background:rgba(30,120,60,0.6);',
    () => press('KeyB'), () => release('KeyB'));
  ctxBtns.buy.id = 'btn-buy';
  ctxBtns.bribe = button('💵 BRIBE', 'left:calc(50% - 38px);bottom:14px;width:76px;height:68px;font-size:12px;display:none;background:rgba(200,150,30,0.7);',
    () => press('KeyY'), () => release('KeyY'));
  ctxBtns.bribe.id = 'btn-bribe';

  setTouchMode('foot');
  return true;
}
