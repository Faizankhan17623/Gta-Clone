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
  if (world.crowned) crownRegalia(world);
}

// crown + gold suit + a statue on the plaza: the works, for the King
function crownRegalia(world) {
  placeCrown(world);
  // gold suit: clone materials so the peds sharing them stay normal
  world.player.mesh.traverse((o) => {
    if (o.isMesh && o.material?.color) {
      o.material = o.material.clone();
      o.material.color.setHex(0xffd24a);
      if ('metalness' in o.material) { o.material.metalness = 0.75; o.material.roughness = 0.35; }
    }
  });
  // the statue: a gold likeness on a plinth near spawn
  const spot = world.city.spawn.clone().add(new THREE.Vector3(0, 0, 28));
  const gold = new THREE.MeshStandardMaterial({ color: 0xd0a020, emissive: 0x604808, metalness: 0.9, roughness: 0.3 });
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.4, 2.6), new THREE.MeshStandardMaterial({ color: 0x8a8f99, roughness: 0.8 }));
  plinth.position.copy(spot).setY(0.7);
  plinth.castShadow = true;
  world.scene.add(plinth);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.4, 0.7), gold);
  body.position.copy(spot).setY(2.6);
  body.castShadow = true;
  world.scene.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), gold);
  head.position.copy(spot).setY(4.1);
  world.scene.add(head);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.5, 0.28), gold);
  arm.position.copy(spot).add(new THREE.Vector3(0.62, 0, 0)).setY(3.5);
  arm.rotation.z = -0.5; // raised to the skyline
  world.scene.add(arm);
  world.city.colliders.push({ x0: spot.x - 1.3, z0: spot.z - 1.3, x1: spot.x + 1.3, z1: spot.z + 1.3, h: 1.4 });
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
  crownRegalia(world);
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
    '<div style="margin-top:14px;display:flex;gap:10px">' +
    '<button id="lg-export"></button><button id="lg-import"></button><button id="lg-close"></button></div>' +
    '<div style="font:700 11px Arial;color:#9fb2c8;margin-top:8px">back up your save as a file — restore it on any device</div>';
  document.body.appendChild(ui);
  const style = (b, bg) => {
    b.style.cssText = `font:800 14px Arial;color:#111;border:none;border-radius:8px;padding:12px 18px;cursor:pointer;background:${bg};letter-spacing:1px;`;
  };
  const exp = ui.querySelector('#lg-export');
  exp.textContent = '💾 EXPORT SAVE';
  style(exp, 'linear-gradient(180deg,#7ecbff,#3d8fd0)');
  exp.onclick = () => {
    const data = localStorage.getItem(hooks.saveKey) || '{}';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    a.download = 'open-city-save.json';
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('Save exported');
  };
  const imp = ui.querySelector('#lg-import');
  imp.textContent = '📂 IMPORT SAVE';
  style(imp, 'linear-gradient(180deg,#b6f5c0,#3dcf6a)');
  imp.onclick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      file.text().then((text) => {
        try {
          JSON.parse(text); // sanity: must at least be JSON
          localStorage.setItem(hooks.saveKey, text);
          showToast('Save imported — reloading');
          setTimeout(() => location.reload(), 600);
        } catch {
          showToast('That file is not a valid save');
        }
      });
    };
    input.click();
  };
  const close = ui.querySelector('#lg-close');
  close.textContent = '✕ CLOSE';
  style(close, 'linear-gradient(180deg,#ffd24a,#f0a32a)');
  close.onclick = () => {
    ui.style.display = 'none';
    hooks?.onClose?.();
  };
}
