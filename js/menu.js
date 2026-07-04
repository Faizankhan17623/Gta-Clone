import { CITY, HALF } from './city.js';

// Pause menu (settings + stats) and the full-screen city map with waypoints.
// Plain DOM overlays; the game loop freezes while either is open.

let menuEl = null;
let mapEl = null;
let mapCanvas = null;
let statsEl = null;
let hooks = null;

const BTN =
  'display:block;width:240px;margin:8px auto;padding:11px 0;cursor:pointer;' +
  'font:800 16px Arial;letter-spacing:2px;color:#111;border:none;border-radius:7px;' +
  'background:linear-gradient(180deg,#ffd24a,#f0a32a);';

function row(label, input) {
  const r = document.createElement('div');
  r.style.cssText = 'display:flex;justify-content:space-between;align-items:center;width:260px;margin:7px auto;color:#cfd8e3;font:600 13px Arial;';
  const l = document.createElement('span');
  l.textContent = label;
  r.append(l, input);
  return r;
}

export function initMenu(h) {
  hooks = h;

  // ---------- pause menu ----------
  menuEl = document.createElement('div');
  menuEl.id = 'pausemenu';
  menuEl.style.cssText =
    'position:fixed;inset:0;z-index:40;display:none;flex-direction:column;align-items:center;' +
    'justify-content:center;background:rgba(6,9,14,0.88);color:#fff;text-align:center;overflow-y:auto;';
  const h1 = document.createElement('div');
  h1.textContent = 'PAUSED';
  h1.style.cssText = 'font:900 italic 44px Arial;letter-spacing:4px;color:#ffd24a;margin-bottom:14px;';
  menuEl.appendChild(h1);

  const resume = document.createElement('button');
  resume.textContent = 'RESUME';
  resume.style.cssText = BTN;
  resume.onclick = () => hooks.onResume();
  menuEl.appendChild(resume);

  const photo = document.createElement('button');
  photo.textContent = 'PHOTO MODE';
  photo.style.cssText = BTN + 'background:linear-gradient(180deg,#7ecbff,#3d8fd0);';
  photo.onclick = () => hooks.onPhoto();
  menuEl.appendChild(photo);

  const restart = document.createElement('button');
  restart.textContent = 'RESTART (RESPAWN)';
  restart.style.cssText = BTN + 'background:linear-gradient(180deg,#ff8a6a,#d05a3a);';
  restart.onclick = () => hooks.onRestart();
  menuEl.appendChild(restart);

  // settings
  const s = hooks.settings;
  const vol = document.createElement('input');
  vol.type = 'range'; vol.min = 0; vol.max = 100; vol.value = s.volume * 100;
  vol.oninput = () => { s.volume = vol.value / 100; hooks.onSettings(); };
  const sens = document.createElement('input');
  sens.type = 'range'; sens.min = 30; sens.max = 220; sens.value = s.sens * 100;
  sens.oninput = () => { s.sens = sens.value / 100; hooks.onSettings(); };
  const inv = document.createElement('input');
  inv.type = 'checkbox'; inv.checked = !!s.invertY;
  inv.onchange = () => { s.invertY = inv.checked; hooks.onSettings(); };
  const qual = document.createElement('input');
  qual.type = 'checkbox'; qual.checked = !!s.lowGfx;
  qual.onchange = () => { s.lowGfx = qual.checked; hooks.onSettings(); };

  const box = document.createElement('div');
  box.style.cssText = 'margin-top:16px;padding:12px 20px;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.15);border-radius:10px;';
  box.append(
    row('VOLUME', vol),
    row('SENSITIVITY', sens),
    row('INVERT Y', inv),
    row('LOW GRAPHICS', qual),
  );
  menuEl.appendChild(box);

  // lifetime stats
  statsEl = document.createElement('div');
  statsEl.style.cssText = 'margin-top:14px;font:600 12px/1.9 Arial;color:#9fb2c8;letter-spacing:1px;text-align:left;';
  menuEl.appendChild(statsEl);
  document.body.appendChild(menuEl);

  // ---------- big map ----------
  mapEl = document.createElement('div');
  mapEl.id = 'bigmap';
  mapEl.style.cssText =
    'position:fixed;inset:0;z-index:40;display:none;align-items:center;justify-content:center;' +
    'flex-direction:column;background:rgba(6,9,14,0.9);';
  const tip = document.createElement('div');
  tip.textContent = 'TAP / CLICK TO SET A WAYPOINT — M TO CLOSE';
  tip.style.cssText = 'color:#ffd24a;font:700 14px Arial;letter-spacing:2px;margin-bottom:8px;';
  mapCanvas = document.createElement('canvas');
  mapCanvas.width = 640;
  mapCanvas.height = 640;
  mapCanvas.style.cssText = 'width:min(88vmin,640px);height:min(88vmin,640px);border:2px solid rgba(255,255,255,0.25);border-radius:8px;cursor:crosshair;';
  mapCanvas.addEventListener('pointerdown', (e) => {
    const r = mapCanvas.getBoundingClientRect();
    const u = (e.clientX - r.left) / r.width;
    const v = (e.clientY - r.top) / r.height;
    hooks.onWaypoint(u * (CITY + 30) - HALF - 15, v * (CITY + 30) - HALF - 15);
  });
  mapEl.append(tip, mapCanvas);
  document.body.appendChild(mapEl);
  return { menuEl, mapEl };
}

export function openMenu(world) {
  const st = world.stats;
  const ach = world.ach ? Object.keys(world.ach).length : 0;
  statsEl.innerHTML =
    `DISTANCE SWUNG&nbsp;<b style="color:#fff">${(st.swungM / 1000).toFixed(2)} km</b><br>` +
    `BEST STYLE CASH-OUT&nbsp;<b style="color:#fff">$${st.styleBest | 0}</b> · LEVEL <b style="color:#fff">${world.level}</b> (${world.xp | 0} XP)<br>` +
    `MISSIONS <b style="color:#fff">${st.missions | 0}</b> · FARES <b style="color:#fff">${st.fares | 0}</b> · TANKS <b style="color:#fff">${st.tanks | 0}</b> · JACKPOTS <b style="color:#fff">${st.jackpots | 0}</b><br>` +
    `ACHIEVEMENTS UNLOCKED&nbsp;<b style="color:#fff">${ach}/10</b>`;
  menuEl.style.display = 'flex';
}

export function closeMenu() {
  menuEl.style.display = 'none';
}

export function openMap(world) {
  mapEl.style.display = 'flex';
  drawBigMap(world);
}

export function closeMap() {
  mapEl.style.display = 'none';
}

export function drawBigMap(world) {
  const g = mapCanvas.getContext('2d');
  const size = mapCanvas.width;
  const sc = size / (CITY + 30);
  const M = (x, z) => [(x + HALF + 15) * sc, (z + HALF + 15) * sc];

  g.fillStyle = '#111a24';
  g.fillRect(0, 0, size, size);
  g.strokeStyle = '#46505c';
  g.lineWidth = 16 * sc;
  for (const rx of world.city.roadXs) {
    const [mx] = M(rx, 0);
    g.beginPath(); g.moveTo(mx, 0); g.lineTo(mx, size); g.stroke();
    const [, mz] = M(0, rx);
    g.beginPath(); g.moveTo(0, mz); g.lineTo(size, mz); g.stroke();
  }
  if (world.gang) {
    const z = world.gang.zone;
    const [x0, z0] = M(z.x0, z.z0);
    const [x1, z1] = M(z.x1, z.z1);
    g.fillStyle = world.gang.owned ? 'rgba(47,175,78,0.3)' : 'rgba(192,48,48,0.35)';
    g.fillRect(x0, z0, x1 - x0, z1 - z0);
  }
  const dot = (x, z, c, r = 5) => {
    const [mx, mz] = M(x, z);
    g.fillStyle = c;
    g.beginPath(); g.arc(mx, mz, r, 0, Math.PI * 2); g.fill();
  };
  for (const s of world.shops || []) dot(s.pos.x, s.pos.z, s.cd > 0 ? '#5a5a60' : '#2fd06a');
  for (const r of world.mapRamps || []) dot(r.pos.x, r.pos.z, r.done ? '#7a5a30' : '#c7641e', 4);
  for (const s of world.mapSkulls || []) dot(s.pos.x, s.pos.z, '#d03030', 6);
  if (world.mission) {
    const m = world.mission;
    dot(m.active ? m.objectivePos.x : m.markerPos.x, m.active ? m.objectivePos.z : m.markerPos.z, m.active ? '#ff4ad2' : '#ffd24a', 8);
  }
  if (world.waypoint) dot(world.waypoint.x, world.waypoint.z, '#4ad2ff', 8);
  // player
  const p = world.player.inCar || world.player.inHeli || world.player;
  const [px, pz] = M(p.pos.x, p.pos.z);
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(px, pz, 7, 0, Math.PI * 2); g.fill();
}
