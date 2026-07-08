import { showToast } from './hud.js';
import { sfxMissionPass, sfxMissionFail, sfxPickup } from './sound.js';

// Lucky 7 slot machine: a DOM overlay next to the blackjack table. Three
// reels, staggered stops, and a triple-7 jackpot. Shares the 'cards' game
// state with blackjack — main.js freezes the world while you gamble.

const SYMBOLS = ['🍒', '🔔', '🍋', '💎', '7'];
// weights make 7s and diamonds rare
const WEIGHTED = ['🍒', '🍒', '🍒', '🔔', '🔔', '🍋', '🍋', '💎', '7'];

let ui = null;
let hooks = null;
let spinning = false;

const pick = () => WEIGHTED[(Math.random() * WEIGHTED.length) | 0];

export function initSlots(h) {
  hooks = h;
}

export function openSlots(world) {
  if (!ui) build(world);
  spinning = false;
  ui.style.display = 'flex';
  el('sl-msg').textContent = 'Pick a bet and pull the lever';
  el('sl-money').textContent = '$' + world.money;
}

function el(id) { return ui.querySelector('#' + id); }

function payout(r, bet) {
  const [a, b, c] = r;
  if (a === '7' && b === '7' && c === '7') return { win: bet * 25, msg: '🎉 JACKPOT! TRIPLE SEVENS!', jackpot: true };
  if (a === '💎' && b === '💎' && c === '💎') return { win: bet * 40, msg: '💎 DIAMOND ROW!' };
  if (a === b && b === c) return { win: bet * 10, msg: 'THREE OF A KIND!' };
  if (a === b || b === c || a === c) return { win: bet * 2, msg: 'A PAIR — nice' };
  if (r.includes('🍒')) return { win: bet, msg: 'Cherry — bet returned' };
  return { win: 0, msg: 'No luck — spin again?' };
}

function spin(world, bet) {
  if (spinning) return;
  if (world.money < bet) { showToast('Not enough cash'); return; }
  world.money -= bet;
  spinning = true;
  el('sl-msg').textContent = '...';
  el('sl-money').textContent = '$' + world.money;

  const reels = [el('sl-r0'), el('sl-r1'), el('sl-r2')];
  const final = [pick(), pick(), pick()];
  const stopAt = [600, 1000, 1400];
  const t0 = performance.now();

  const tick = setInterval(() => {
    const t = performance.now() - t0;
    let done = true;
    for (let i = 0; i < 3; i++) {
      if (t < stopAt[i]) { reels[i].textContent = pick(); done = false; }
      else reels[i].textContent = final[i];
    }
    if (done) {
      clearInterval(tick);
      const res = payout(final, bet);
      world.money += res.win;
      el('sl-msg').textContent = res.win > 0 ? `${res.msg} +$${res.win}` : res.msg;
      el('sl-money').textContent = '$' + world.money;
      if (res.jackpot) {
        if (world.stats) world.stats.jackpots++;
        sfxMissionPass();
      } else if (res.win > bet) sfxMissionPass();
      else if (res.win > 0) sfxPickup();
      else sfxMissionFail();
      world.onSave?.();
      spinning = false;
    }
  }, 70);
}

function build(world) {
  ui = document.createElement('div');
  ui.id = 'slotui';
  ui.style.cssText =
    'position:fixed;inset:0;z-index:55;display:none;flex-direction:column;align-items:center;' +
    'justify-content:center;background:radial-gradient(ellipse at 50% 40%, #4a1440 0%, #12060f 75%);color:#fff;text-align:center;';
  ui.innerHTML =
    '<div style="font:900 italic 30px Arial;color:#ffd24a;letter-spacing:3px">LUCKY 7 SLOTS</div>' +
    '<div id="sl-money" style="font:800 18px Arial;color:#7cc77c;margin:4px 0 14px"></div>' +
    '<div style="display:flex;gap:10px;background:#0a0a12;border:3px solid #ffd24a;border-radius:14px;padding:16px 22px">' +
    ['sl-r0', 'sl-r1', 'sl-r2'].map((id) =>
      `<div id="${id}" style="width:74px;height:84px;font-size:52px;line-height:84px;background:#f5f2ea;color:#111;border-radius:8px">7</div>`
    ).join('') +
    '</div>' +
    '<div id="sl-msg" style="font:800 17px Arial;color:#ffd24a;margin:12px 0;min-height:22px"></div>' +
    '<div id="sl-bets" style="display:flex;gap:10px"></div>' +
    '<div style="margin-top:14px"><button id="sl-table"></button><button id="sl-leave"></button></div>' +
    '<div style="font:700 11px Arial;color:#9fb2c8;margin-top:10px">7-7-7 pays 25× · 💎💎💎 40× · triple 10× · pair 2×</div>';
  document.body.appendChild(ui);

  const btn = (label, bg) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = `font:800 15px Arial;color:#111;border:none;border-radius:8px;padding:12px 18px;cursor:pointer;background:${bg};letter-spacing:1px;`;
    return b;
  };

  for (const amount of [50, 250, 1000]) {
    const b = btn(`SPIN $${amount}`, 'linear-gradient(180deg,#ffd24a,#f0a32a)');
    b.onclick = () => spin(world, amount);
    el('sl-bets').appendChild(b);
  }

  const table = el('sl-table');
  table.textContent = '♠ BLACKJACK';
  table.style.cssText = btn('', '').style.cssText + 'background:linear-gradient(180deg,#b6f5c0,#3dcf6a);margin-right:10px;';
  table.onclick = () => {
    if (spinning) return;
    ui.style.display = 'none';
    hooks?.onTable?.();
  };
  const leave = el('sl-leave');
  leave.textContent = '✕ LEAVE';
  leave.style.cssText = btn('', '').style.cssText + 'background:linear-gradient(180deg,#ff8a6a,#d05a3a);';
  leave.onclick = () => {
    if (spinning) return;
    ui.style.display = 'none';
    hooks?.onClose?.();
  };
}
