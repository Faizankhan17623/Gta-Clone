import { showToast } from './hud.js';
import { sfxMissionPass, sfxMissionFail, sfxPickup } from './sound.js';

// Blackjack table inside the Lucky 7: a DOM overlay card game. The world
// freezes while you play (main.js parks gameState on 'cards').

let ui = null;
let hooks = null;
let state = null;

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function draw() {
  const r = (Math.random() * 13) | 0;
  return { rank: RANKS[r], suit: SUITS[(Math.random() * 4) | 0], v: r === 0 ? 11 : Math.min(10, r + 1) };
}

function handValue(cards) {
  let v = cards.reduce((s, c) => s + c.v, 0);
  let aces = cards.filter((c) => c.rank === 'A').length;
  while (v > 21 && aces > 0) { v -= 10; aces--; }
  return v;
}

function cardHtml(c, hidden) {
  if (hidden) {
    return '<span style="display:inline-block;width:44px;height:62px;margin:3px;border-radius:6px;background:repeating-linear-gradient(45deg,#27406b,#27406b 6px,#1c3050 6px,#1c3050 12px);border:2px solid #fff"></span>';
  }
  const red = c.suit === '♥' || c.suit === '♦';
  return `<span style="display:inline-block;width:44px;height:62px;margin:3px;border-radius:6px;background:#f5f2ea;` +
    `border:2px solid #ccc;color:${red ? '#c0392b' : '#111'};font:800 17px Arial;padding-top:6px">${c.rank}<br>${c.suit}</span>`;
}

function el(id) { return ui.querySelector('#' + id); }

function render(world) {
  const s = state;
  const dv = handValue(s.dealer);
  const pv = handValue(s.player);
  el('bj-dealer').innerHTML = s.dealer.map((c, i) => cardHtml(c, i === 1 && !s.over && s.stage === 'play')).join('');
  el('bj-hand').innerHTML = s.player.map((c) => cardHtml(c)).join('');
  el('bj-dv').textContent = s.stage === 'play' && !s.over ? '?' : dv;
  el('bj-pv').textContent = pv;
  el('bj-money').textContent = '$' + world.money;
  el('bj-msg').textContent = s.msg || (s.stage === 'bet' ? 'Place a bet' : `Bet $${s.bet}`);
  el('bj-bets').style.display = s.stage === 'bet' ? 'flex' : 'none';
  el('bj-acts').style.display = s.stage === 'play' && !s.over ? 'flex' : 'none';
  el('bj-again').style.display = s.over ? 'inline-block' : 'none';
  el('bj-double').style.display = s.player.length === 2 && world.money >= s.bet ? 'inline-block' : 'none';
}

function settle(world) {
  const s = state;
  const pv = handValue(s.player);
  const dv = handValue(s.dealer);
  s.over = true;
  s.stage = 'done';
  if (pv > 21) {
    s.msg = `BUST — house takes $${s.bet}`;
    sfxMissionFail();
  } else if (pv === 21 && s.player.length === 2) {
    const win = Math.round(s.bet * 2.5);
    world.money += win;
    s.msg = `BLACKJACK! +$${win}`;
    sfxMissionPass();
    if (world.stats) world.stats.jackpots++;
  } else if (dv > 21 || pv > dv) {
    world.money += s.bet * 2;
    s.msg = `YOU WIN +$${s.bet * 2}`;
    sfxPickup();
  } else if (pv === dv) {
    world.money += s.bet;
    s.msg = 'PUSH — bet returned';
  } else {
    s.msg = `Dealer has ${dv} — house wins`;
    sfxMissionFail();
  }
  world.onSave?.();
}

function dealerPlay(world) {
  const s = state;
  while (handValue(s.dealer) < 17) s.dealer.push(draw());
  settle(world);
}

export function openBlackjack(world) {
  if (!ui) build(world);
  state = { stage: 'bet', bet: 0, player: [], dealer: [], over: false, msg: '' };
  ui.style.display = 'flex';
  render(world);
}

export function initBlackjack(h) {
  hooks = h;
}

function build(world) {
  ui = document.createElement('div');
  ui.id = 'bjtable';
  ui.style.cssText =
    'position:fixed;inset:0;z-index:55;display:none;flex-direction:column;align-items:center;' +
    'justify-content:center;background:radial-gradient(ellipse at 50% 40%, #14532d 0%, #071a0e 75%);color:#fff;text-align:center;';
  ui.innerHTML =
    '<div style="font:900 italic 30px Arial;color:#ffd24a;letter-spacing:3px">LUCKY 7 BLACKJACK</div>' +
    '<div id="bj-money" style="font:800 18px Arial;color:#7cc77c;margin:4px 0 10px"></div>' +
    '<div style="font:700 13px Arial;color:#9fb2c8">DEALER — <span id="bj-dv"></span></div>' +
    '<div id="bj-dealer" style="min-height:70px"></div>' +
    '<div style="font:700 13px Arial;color:#9fb2c8;margin-top:8px">YOU — <span id="bj-pv"></span></div>' +
    '<div id="bj-hand" style="min-height:70px"></div>' +
    '<div id="bj-msg" style="font:800 17px Arial;color:#ffd24a;margin:10px 0;min-height:22px"></div>' +
    '<div id="bj-bets" style="display:flex;gap:10px"></div>' +
    '<div id="bj-acts" style="display:none;gap:10px"></div>' +
    '<div style="margin-top:14px"><button id="bj-again"></button><button id="bj-slots"></button><button id="bj-leave"></button></div>';
  document.body.appendChild(ui);

  const btn = (label, bg) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = `font:800 15px Arial;color:#111;border:none;border-radius:8px;padding:12px 18px;cursor:pointer;background:${bg};letter-spacing:1px;`;
    return b;
  };

  for (const amount of [100, 500, 1000]) {
    const b = btn('BET $' + amount, 'linear-gradient(180deg,#ffd24a,#f0a32a)');
    b.onclick = () => {
      if (world.money < amount) { showToast('Not enough cash'); return; }
      world.money -= amount;
      state.bet = amount;
      state.player = [draw(), draw()];
      state.dealer = [draw(), draw()];
      state.stage = 'play';
      state.msg = '';
      if (handValue(state.player) === 21) dealerPlay(world);
      render(world);
    };
    el('bj-bets').appendChild(b);
  }

  const hit = btn('HIT', 'linear-gradient(180deg,#7ecbff,#3d8fd0)');
  hit.onclick = () => {
    state.player.push(draw());
    if (handValue(state.player) > 21) settle(world);
    render(world);
  };
  const stand = btn('STAND', 'linear-gradient(180deg,#b6f5c0,#3dcf6a)');
  stand.onclick = () => { dealerPlay(world); render(world); };
  const dbl = btn('DOUBLE', 'linear-gradient(180deg,#ffb6e0,#d05a9a)');
  dbl.id = 'bj-double';
  dbl.onclick = () => {
    if (world.money < state.bet) { showToast('Not enough cash'); return; }
    world.money -= state.bet;
    state.bet *= 2;
    state.player.push(draw());
    if (handValue(state.player) > 21) settle(world);
    else dealerPlay(world);
    render(world);
  };
  el('bj-acts').append(hit, stand, dbl);

  const again = el('bj-again');
  again.textContent = 'DEAL AGAIN';
  again.style.cssText = btn('', '').style.cssText + 'background:linear-gradient(180deg,#ffd24a,#f0a32a);margin-right:10px;';
  again.onclick = () => {
    state = { stage: 'bet', bet: 0, player: [], dealer: [], over: false, msg: '' };
    render(world);
  };
  const slots = el('bj-slots');
  slots.textContent = '🎰 SLOTS';
  slots.style.cssText = btn('', '').style.cssText + 'background:linear-gradient(180deg,#e0a6ff,#a04ad0);margin-right:10px;';
  slots.onclick = () => {
    ui.style.display = 'none';
    hooks?.onSlots?.();
  };
  const leave = el('bj-leave');
  leave.textContent = '✕ LEAVE TABLE';
  leave.style.cssText = btn('', '').style.cssText + 'background:linear-gradient(180deg,#ff8a6a,#d05a3a);';
  leave.onclick = () => {
    ui.style.display = 'none';
    hooks?.onClose?.();
  };
}
