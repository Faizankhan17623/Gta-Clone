import { showToast } from './hud.js';
import { sfxMissionPass, sfxMissionFail, sfxPickup } from './sound.js';

// Lucky 7 roulette: a European wheel (single zero) as a DOM overlay. Pick a
// chip, click a bet and the wheel spins — one bet per spin keeps it snappy.
// Shares the frozen 'cards' game state with blackjack and slots.

const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

let ui = null;
let hooks = null;
let spinning = false;
let chip = 100;

export function initRoulette(h) {
  hooks = h;
}

export function openRoulette(world) {
  if (!ui) build(world);
  spinning = false;
  ui.style.display = 'flex';
  el('rl-msg').textContent = 'Pick a chip, place a bet';
  el('rl-money').textContent = '$' + world.money;
}

function el(id) { return ui.querySelector('#' + id); }

const colorOf = (n) => (n === 0 ? '#2fd06a' : REDS.has(n) ? '#e04a3a' : '#20242e');

// bet: { label, match(n), mult } — mult is the total returned on a win
const BETS = [
  { key: 'red', label: 'RED', mult: 2, match: (n) => n !== 0 && REDS.has(n) },
  { key: 'black', label: 'BLACK', mult: 2, match: (n) => n !== 0 && !REDS.has(n) },
  { key: 'odd', label: 'ODD', mult: 2, match: (n) => n !== 0 && n % 2 === 1 },
  { key: 'even', label: 'EVEN', mult: 2, match: (n) => n !== 0 && n % 2 === 0 },
  { key: 'd1', label: '1–12', mult: 3, match: (n) => n >= 1 && n <= 12 },
  { key: 'd2', label: '13–24', mult: 3, match: (n) => n >= 13 && n <= 24 },
  { key: 'd3', label: '25–36', mult: 3, match: (n) => n >= 25 && n <= 36 },
  { key: 'lucky', label: '🍀 LUCKY Nº', mult: 36, match: null }, // random straight-up
];

function spin(world, bet) {
  if (spinning) return;
  if (world.money < chip) { showToast('Not enough cash'); return; }
  world.money -= chip;
  spinning = true;
  el('rl-money').textContent = '$' + world.money;

  const lucky = bet.key === 'lucky' ? (Math.random() * 37) | 0 : -1;
  el('rl-msg').textContent = bet.key === 'lucky'
    ? `$${chip} straight up on ${lucky}...` : `$${chip} on ${bet.label}...`;

  const result = (Math.random() * 37) | 0;
  const ball = el('rl-ball');
  const t0 = performance.now();
  const dur = 1800;

  const tick = setInterval(() => {
    const t = performance.now() - t0;
    if (t < dur) {
      // decelerating flicker of numbers as the wheel winds down
      if (Math.random() < Math.max(0.15, 1 - t / dur)) {
        const n = (Math.random() * 37) | 0;
        ball.textContent = n;
        ball.style.background = colorOf(n);
      }
      return;
    }
    clearInterval(tick);
    ball.textContent = result;
    ball.style.background = colorOf(result);
    const won = bet.key === 'lucky' ? result === lucky : bet.match(result);
    const payout = won ? chip * bet.mult : 0;
    world.money += payout;
    el('rl-money').textContent = '$' + world.money;
    const name = result === 0 ? '0 green' : `${result} ${REDS.has(result) ? 'red' : 'black'}`;
    if (won && bet.mult === 36) {
      el('rl-msg').textContent = `🎉 ${name} — STRAIGHT UP! +$${payout}`;
      if (world.stats) world.stats.jackpots++;
      sfxMissionPass();
    } else if (won) {
      el('rl-msg').textContent = `${name} — YOU WIN +$${payout}`;
      sfxPickup();
    } else {
      el('rl-msg').textContent = `${name} — house takes it`;
      sfxMissionFail();
    }
    world.onSave?.();
    spinning = false;
  }, 60);
}

function build(world) {
  ui = document.createElement('div');
  ui.id = 'rouletteui';
  ui.style.cssText =
    'position:fixed;inset:0;z-index:55;display:none;flex-direction:column;align-items:center;' +
    'justify-content:center;background:radial-gradient(ellipse at 50% 40%, #14304a 0%, #060d14 75%);color:#fff;text-align:center;';
  ui.innerHTML =
    '<div style="font:900 italic 30px Arial;color:#ffd24a;letter-spacing:3px">LUCKY 7 ROULETTE</div>' +
    '<div id="rl-money" style="font:800 18px Arial;color:#7cc77c;margin:4px 0 12px"></div>' +
    '<div id="rl-ball" style="width:86px;height:86px;border-radius:50%;border:4px solid #ffd24a;' +
    'font:900 34px/80px Arial;color:#fff;background:#20242e">?</div>' +
    '<div id="rl-msg" style="font:800 17px Arial;color:#ffd24a;margin:12px 0;min-height:22px"></div>' +
    '<div id="rl-chips" style="display:flex;gap:8px;margin-bottom:10px"></div>' +
    '<div id="rl-bets" style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;max-width:560px"></div>' +
    '<div style="margin-top:14px"><button id="rl-bj"></button><button id="rl-slots"></button><button id="rl-leave"></button></div>' +
    '<div style="font:700 11px Arial;color:#9fb2c8;margin-top:10px">red/black/odd/even 2× · dozens 3× · lucky number 36×</div>';
  document.body.appendChild(ui);

  const btn = (label, bg) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = `font:800 14px Arial;color:#111;border:none;border-radius:8px;padding:11px 15px;cursor:pointer;background:${bg};letter-spacing:1px;`;
    return b;
  };

  const chipBtns = [];
  for (const amount of [100, 500, 2000]) {
    const b = btn('$' + amount, 'linear-gradient(180deg,#cfd6e2,#8b95a6)');
    b.onclick = () => {
      chip = amount;
      for (const cb of chipBtns) cb.style.outline = 'none';
      b.style.outline = '3px solid #ffd24a';
    };
    chipBtns.push(b);
    el('rl-chips').appendChild(b);
  }
  chipBtns[0].style.outline = '3px solid #ffd24a';

  for (const bet of BETS) {
    const bg = bet.key === 'red' ? 'linear-gradient(180deg,#ff8a7a,#e04a3a)'
      : bet.key === 'black' ? 'linear-gradient(180deg,#6a7284,#2a2e3a)'
      : bet.key === 'lucky' ? 'linear-gradient(180deg,#b6f5c0,#3dcf6a)'
      : 'linear-gradient(180deg,#ffd24a,#f0a32a)';
    const b = btn(bet.label, bg);
    if (bet.key === 'black') b.style.color = '#fff';
    b.onclick = () => spin(world, bet);
    el('rl-bets').appendChild(b);
  }

  const bj = el('rl-bj');
  bj.textContent = '♠ BLACKJACK';
  bj.style.cssText = btn('', '').style.cssText + 'background:linear-gradient(180deg,#b6f5c0,#3dcf6a);margin-right:10px;';
  bj.onclick = () => { if (spinning) return; ui.style.display = 'none'; hooks?.onTable?.(); };
  const sl = el('rl-slots');
  sl.textContent = '🎰 SLOTS';
  sl.style.cssText = btn('', '').style.cssText + 'background:linear-gradient(180deg,#e0a6ff,#a04ad0);margin-right:10px;';
  sl.onclick = () => { if (spinning) return; ui.style.display = 'none'; hooks?.onSlots?.(); };
  const leave = el('rl-leave');
  leave.textContent = '✕ LEAVE';
  leave.style.cssText = btn('', '').style.cssText + 'background:linear-gradient(180deg,#ff8a6a,#d05a3a);';
  leave.onclick = () => { if (spinning) return; ui.style.display = 'none'; hooks?.onClose?.(); };
}
