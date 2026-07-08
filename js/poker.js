import { showToast } from './hud.js';
import { sfxMissionPass, sfxMissionFail, sfxPickup } from './sound.js';

// Five-card draw at the Lucky 7: you versus three regulars. Everyone antes,
// you pick cards to hold, one draw, showdown — best hand takes the pot.
// Shares the frozen 'cards' state with the other tables.

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const HAND_NAMES = ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush'];
const AI_NAMES = ['SAL', 'RIVETS', 'THE NUN'];

let ui = null;
let hooks = null;
let state = null;

function newDeck() {
  const deck = [];
  for (let s = 0; s < 4; s++) for (let r = 0; r < 13; r++) deck.push({ r: r + 2, s });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// score: [category, tiebreakers...] compared lexicographically
function evalHand(cards) {
  const rs = cards.map((c) => c.r).sort((a, b) => b - a);
  const flush = cards.every((c) => c.s === cards[0].s);
  const counts = {};
  for (const r of rs) counts[r] = (counts[r] || 0) + 1;
  const groups = Object.entries(counts)
    .map(([r, n]) => ({ r: +r, n }))
    .sort((a, b) => b.n - a.n || b.r - a.r);
  const kick = groups.flatMap((g) => Array(g.n).fill(g.r));
  const uniq = [...new Set(rs)];
  let straightHigh = 0;
  if (uniq.length === 5 && uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
  if (uniq.join() === '14,5,4,3,2') straightHigh = 5; // the wheel
  if (straightHigh && flush) return [8, straightHigh];
  if (groups[0].n === 4) return [7, ...kick];
  if (groups[0].n === 3 && groups[1].n === 2) return [6, ...kick];
  if (flush) return [5, ...rs];
  if (straightHigh) return [4, straightHigh];
  if (groups[0].n === 3) return [3, ...kick];
  if (groups[0].n === 2 && groups[1].n === 2) return [2, ...kick];
  if (groups[0].n === 2) return [1, ...kick];
  return [0, ...rs];
}

function cmp(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d) return d;
  }
  return 0;
}

// the regulars keep made hands, otherwise hold the two best cards
function aiDraw(hand, deck) {
  const score = evalHand(hand);
  if (score[0] >= 1) {
    if (score[0] >= 4) return hand; // straight or better stands pat
    const counts = {};
    for (const c of hand) counts[c.r] = (counts[c.r] || 0) + 1;
    return hand.map((c) => (counts[c.r] >= 2 ? c : deck.pop()));
  }
  const keep = [...hand].sort((a, b) => b.r - a.r).slice(0, 2);
  return hand.map((c) => (keep.includes(c) ? c : deck.pop()));
}

function rankLabel(r) { return RANKS[r - 2]; }

function cardHtml(c, held, i) {
  const red = c.s === 1 || c.s === 2;
  return `<span data-i="${i}" class="pk-card" style="display:inline-block;width:46px;height:64px;margin:3px;border-radius:6px;` +
    `background:#f5f2ea;border:3px solid ${held ? '#ffd24a' : '#ccc'};color:${red ? '#c0392b' : '#111'};` +
    `font:800 16px Arial;padding-top:6px;cursor:pointer;user-select:none">${rankLabel(c.r)}<br>${SUITS[c.s]}</span>`;
}

function backHtml() {
  return '<span style="display:inline-block;width:30px;height:42px;margin:2px;border-radius:4px;' +
    'background:repeating-linear-gradient(45deg,#27406b,#27406b 5px,#1c3050 5px,#1c3050 10px);border:1px solid #fff"></span>';
}

function el(id) { return ui.querySelector('#' + id); }

export function initPoker(h) { hooks = h; }

export function openPoker(world) {
  if (!ui) build(world);
  state = null;
  ui.style.display = 'flex';
  render(world);
}

function render(world) {
  el('pk-money').textContent = '$' + world.money;
  const s = state;
  if (!s) {
    el('pk-table').innerHTML = '<div style="font:700 14px Arial;color:#9fb2c8;margin:16px 0">Three regulars look up from their cards.</div>';
    el('pk-msg').textContent = 'Pick your ante';
    el('pk-antes').style.display = 'flex';
    el('pk-acts').style.display = 'none';
    return;
  }
  el('pk-antes').style.display = 'none';
  el('pk-acts').style.display = s.stage === 'draw' ? 'flex' : 'none';
  el('pk-again').style.display = s.stage === 'done' ? 'inline-block' : 'none';

  let html = '';
  s.ai.forEach((hand, i) => {
    html += `<div style="margin:2px 0"><span style="font:800 12px Arial;color:#9fb2c8;display:inline-block;width:76px;text-align:right;margin-right:8px">${AI_NAMES[i]}</span>`;
    if (s.stage === 'done') {
      html += hand.map((c) => `<span style="display:inline-block;width:30px;height:42px;margin:2px;border-radius:4px;background:#f5f2ea;border:1px solid #ccc;color:${c.s === 1 || c.s === 2 ? '#c0392b' : '#111'};font:800 11px Arial;padding-top:3px">${rankLabel(c.r)}<br>${SUITS[c.s]}</span>`).join('');
      html += `<span style="font:700 11px Arial;color:#ffd24a;margin-left:8px">${HAND_NAMES[s.aiScores[i][0]]}</span>`;
    } else {
      html += backHtml().repeat(5);
    }
    html += '</div>';
  });
  html += '<div style="margin-top:10px;font:700 12px Arial;color:#9fb2c8">YOUR HAND' +
    (s.stage === 'draw' ? ' — tap cards to HOLD, then draw' : '') + '</div>';
  html += '<div id="pk-hand">' + s.hand.map((c, i) => cardHtml(c, s.held[i], i)).join('') + '</div>';
  if (s.stage === 'done') {
    html += `<div style="font:700 12px Arial;color:#ffd24a">${HAND_NAMES[s.score[0]]}</div>`;
  }
  el('pk-table').innerHTML = html;
  el('pk-msg').textContent = s.msg || `Pot: $${s.pot}`;

  if (s.stage === 'draw') {
    for (const span of ui.querySelectorAll('.pk-card')) {
      span.onclick = () => {
        const i = +span.dataset.i;
        s.held[i] = !s.held[i];
        render(world);
      };
    }
  }
}

function showdown(world) {
  const s = state;
  s.ai = s.ai.map((hand) => aiDraw(hand, s.deck));
  s.aiScores = s.ai.map(evalHand);
  s.score = evalHand(s.hand);
  const best = s.aiScores.reduce((m, sc) => (cmp(sc, m) > 0 ? sc : m), [0]);
  const win = cmp(s.score, best) >= 0; // ties go to the hero, the house can afford it
  s.stage = 'done';
  if (win) {
    world.money += s.pot;
    s.msg = `${HAND_NAMES[s.score[0]]} — YOU TAKE THE POT +$${s.pot}`;
    if (s.score[0] >= 7 && world.stats) world.stats.jackpots++;
    if (s.score[0] >= 2) sfxMissionPass(); else sfxPickup();
  } else {
    const who = AI_NAMES[s.aiScores.findIndex((sc) => cmp(sc, best) === 0)];
    s.msg = `${who} shows ${HAND_NAMES[best[0]].toLowerCase()} — pot's gone`;
    sfxMissionFail();
  }
  world.onSave?.();
}

function deal(world, ante) {
  if (world.money < ante) { showToast('Not enough cash'); return; }
  world.money -= ante;
  const deck = newDeck();
  state = {
    deck,
    ante,
    pot: ante * 4, // three regulars match your ante
    hand: deck.splice(0, 5),
    ai: [deck.splice(0, 5), deck.splice(0, 5), deck.splice(0, 5)],
    held: [false, false, false, false, false],
    aiScores: null,
    score: null,
    stage: 'draw',
    msg: '',
  };
  render(world);
}

function build(world) {
  ui = document.createElement('div');
  ui.id = 'pokerui';
  ui.style.cssText =
    'position:fixed;inset:0;z-index:55;display:none;flex-direction:column;align-items:center;' +
    'justify-content:center;background:radial-gradient(ellipse at 50% 40%, #3a2a10 0%, #120b04 75%);color:#fff;text-align:center;';
  ui.innerHTML =
    '<div style="font:900 italic 30px Arial;color:#ffd24a;letter-spacing:3px">LUCKY 7 POKER</div>' +
    '<div id="pk-money" style="font:800 18px Arial;color:#7cc77c;margin:4px 0 8px"></div>' +
    '<div id="pk-table"></div>' +
    '<div id="pk-msg" style="font:800 16px Arial;color:#ffd24a;margin:10px 0;min-height:22px"></div>' +
    '<div id="pk-antes" style="display:flex;gap:10px"></div>' +
    '<div id="pk-acts" style="display:none;gap:10px"></div>' +
    '<div style="margin-top:12px"><button id="pk-again"></button><button id="pk-bj"></button><button id="pk-leave"></button></div>' +
    '<div style="font:700 11px Arial;color:#9fb2c8;margin-top:8px">five-card draw · everyone antes · one draw · best hand takes the pot (4× your ante)</div>';
  document.body.appendChild(ui);

  const btn = (label, bg) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = `font:800 15px Arial;color:#111;border:none;border-radius:8px;padding:12px 18px;cursor:pointer;background:${bg};letter-spacing:1px;`;
    return b;
  };

  for (const ante of [200, 1000]) {
    const b = btn(`ANTE $${ante}`, 'linear-gradient(180deg,#ffd24a,#f0a32a)');
    b.onclick = () => deal(world, ante);
    el('pk-antes').appendChild(b);
  }

  const draw = btn('DRAW', 'linear-gradient(180deg,#7ecbff,#3d8fd0)');
  draw.onclick = () => {
    const s = state;
    s.hand = s.hand.map((c, i) => (s.held[i] ? c : s.deck.pop()));
    showdown(world);
    render(world);
  };
  const pat = btn('STAND PAT', 'linear-gradient(180deg,#b6f5c0,#3dcf6a)');
  pat.onclick = () => { showdown(world); render(world); };
  el('pk-acts').append(draw, pat);

  const again = el('pk-again');
  again.textContent = 'NEW HAND';
  again.style.cssText = btn('', '').style.cssText + 'background:linear-gradient(180deg,#ffd24a,#f0a32a);margin-right:10px;';
  again.onclick = () => { state = null; render(world); };
  const bj = el('pk-bj');
  bj.textContent = '♠ BLACKJACK';
  bj.style.cssText = btn('', '').style.cssText + 'background:linear-gradient(180deg,#b6f5c0,#3dcf6a);margin-right:10px;';
  bj.onclick = () => { ui.style.display = 'none'; hooks?.onTable?.(); };
  const leave = el('pk-leave');
  leave.textContent = '✕ LEAVE';
  leave.style.cssText = btn('', '').style.cssText + 'background:linear-gradient(180deg,#ff8a6a,#d05a3a);';
  leave.onclick = () => { ui.style.display = 'none'; hooks?.onClose?.(); };
}
