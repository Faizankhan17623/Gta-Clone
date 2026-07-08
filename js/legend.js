import * as THREE from 'three';
import { showToast, showNews, showMissionMsg } from './hud.js';
import { sfxMissionPass } from './sound.js';
import { addExplosion } from './effects.js';

// The Legend board (L): every way to conquer the city on one checklist.
// Finish the lot and the city crowns you — a golden crown, $50,000, and
// nothing left to prove. The final feature; the game is complete.

let ui = null;
let hooks = null;

function items(world) {
  const s = world.stats || {};
  return [
    ['Pass 20 story missions', Math.min(1, (s.missions || 0) / 20)],
    ['Find all 20 hidden packages', Math.min(1, world.tokensGot.length / 20)],
    ['Thread all 10 sky hoops', Math.min(1, (world.hoops?.got.size || 0) / 10)],
    ['Medal in all 5 free-roam races', Math.min(1, Object.keys(world.raceBest || {}).length / 5)],
    ['Survive 5 arena waves', Math.min(1, (world.arena?.best || 0) / 5)],
    ['Own all 3 properties', Math.min(1, Object.values(world.props?.owned || {}).filter(Boolean).length / 3)],
    ['Take the Viper district', world.gang?.owned ? 1 : 0],
    ['Pull off the bank job', (world.heist?.doneDay ?? -99) >= 0 ? 1 : 0],
    ['Vigilante streak of 3', Math.min(1, (world.vig?.best || 0) / 3)],
    ['Collect 3 bounties', Math.min(1, (s.bounties || 0) / 3)],
    ['Deliver 3 patients', Math.min(1, (s.rescues || 0) / 3)],
    ['Win the fight club', (s.brawlsWon || 0) >= 1 ? 1 : 0],
    ['Shoot down the UFO', (s.ufo || 0) >= 1 ? 1 : 0],
    ['Adopt REX', world.dog?.owned ? 1 : 0],
    ['Buy the jetpack', world.jetpack?.owned ? 1 : 0],
    ['Reach level 8', Math.min(1, world.level / 8)],
  ];
}

export function legendPct(world) {
  const list = items(world);
  return list.reduce((sum, [, p]) => sum + p, 0) / list.length;
}

export function initLegend(h, world, save) {
  hooks = h;
  world.crowned = !!save.crowned;
  if (world.crowned) placeCrown(world);
}

function placeCrown(world) {
  if (world._crownMesh) return;
  const crown = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.26, 0.28, 8, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xffd24a, emissive: 0x806010, metalness: 0.9, roughness: 0.2, side: THREE.DoubleSide })
  );
  crown.position.y = 2.05;
  world.player.mesh.add(crown);
  world._crownMesh = crown;
}

function coronation(world) {
  world.crowned = true;
  placeCrown(world);
  world.money += 50000;
  sfxMissionPass();
  showMissionMsg('👑 KING OF THE CITY', '100% — take the crown and the $50,000', '#ffd24a');
  showNews('it is official: the city belongs to the one in the crown');
  world.slowmoT = 1.5;
  // fireworks over the plaza
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    addExplosion(world.player.pos.clone().add(new THREE.Vector3(Math.sin(a) * 14, 16 + (i % 3) * 5, Math.cos(a) * 14)));
  }
  world.onSave?.();
}

export function openLegend(world) {
  if (!ui) build();
  const list = items(world);
  const pct = legendPct(world);
  el('lg-pct').textContent = Math.floor(pct * 100) + '%';
  el('lg-list').innerHTML = list.map(([label, p]) => {
    const done = p >= 1;
    return `<div style="display:flex;justify-content:space-between;gap:18px;padding:3px 0;` +
      `color:${done ? '#7cf78c' : '#cfd6e2'};font:${done ? '800' : '600'} 14px Arial">` +
      `<span>${done ? '✓' : '·'} ${label}</span><span>${Math.floor(p * 100)}%</span></div>`;
  }).join('');
  el('lg-crown').style.display = world.crowned ? 'block' : 'none';
  ui.style.display = 'flex';
  if (!world.crowned && pct >= 1) coronation(world);
}

function el(id) { return ui.querySelector('#' + id); }

function build() {
  ui = document.createElement('div');
  ui.id = 'legendui';
  ui.style.cssText =
    'position:fixed;inset:0;z-index:55;display:none;flex-direction:column;align-items:center;' +
    'justify-content:center;background:rgba(6,10,16,0.92);color:#fff;text-align:center;';
  ui.innerHTML =
    '<div style="font:900 italic 30px Arial;color:#ffd24a;letter-spacing:3px">CITY LEGEND</div>' +
    '<div id="lg-pct" style="font:900 44px Arial;color:#7cf78c;margin:2px 0 10px"></div>' +
    '<div id="lg-crown" style="display:none;font:800 15px Arial;color:#ffd24a;margin-bottom:8px">👑 KING OF THE CITY</div>' +
    '<div id="lg-list" style="max-height:55vh;overflow-y:auto;min-width:320px;text-align:left;' +
    'background:rgba(20,26,36,0.6);border-radius:12px;padding:14px 20px"></div>' +
    '<button id="lg-close" style="margin-top:14px;font:800 15px Arial;color:#111;border:none;border-radius:8px;' +
    'padding:12px 22px;cursor:pointer;background:linear-gradient(180deg,#ffd24a,#f0a32a);letter-spacing:1px">✕ CLOSE</button>';
  document.body.appendChild(ui);
  ui.querySelector('#lg-close').onclick = () => {
    ui.style.display = 'none';
    hooks?.onClose?.();
  };
}
