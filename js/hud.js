import { CITY, HALF } from './city.js';
import { keys } from './input.js';

let els = null;
let mapCtx = null;

export function initHUD() {
  els = {
    money: document.getElementById('money'),
    clock: document.getElementById('clock'),
    stars: document.getElementById('stars').children,
    health: document.getElementById('health'),
    speed: document.getElementById('speed'),
    weapon: document.getElementById('weapon'),
    hint: document.getElementById('hint'),
    crosshair: document.getElementById('crosshair'),
    banner: document.getElementById('banner'),
    toast: document.getElementById('toast'),
    minimap: document.getElementById('minimap'),
    kw: document.getElementById('k-w'),
    ka: document.getElementById('k-a'),
    ks: document.getElementById('k-s'),
    kd: document.getElementById('k-d'),
  };
  mapCtx = els.minimap.getContext('2d');
}

export function setHint(html) {
  if (html) {
    els.hint.innerHTML = html;
    els.hint.style.display = 'block';
  } else {
    els.hint.style.display = 'none';
  }
}

export function showBanner(text, color) {
  els.banner.textContent = text;
  els.banner.style.color = color;
  els.banner.style.display = 'block';
}

export function hideBanner() {
  els.banner.style.display = 'none';
}

let toastTimer = null;
export function showToast(text) {
  els.toast.textContent = text;
  els.toast.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.style.display = 'none'; }, 2200);
}

export function updateHUD(world) {
  const { player } = world;

  els.money.textContent = '$' + world.money;

  const hh = Math.floor(world.clock);
  const mm = Math.floor((world.clock % 1) * 60);
  els.clock.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;

  for (let i = 0; i < 5; i++) {
    els.stars[i].classList.toggle('lit', i < world.wanted);
  }

  const hp = Math.max(0, player.health);
  els.health.style.width = hp + '%';
  els.health.style.background = hp > 40
    ? 'linear-gradient(90deg,#2faf4e,#5fe07a)'
    : 'linear-gradient(90deg,#b03030,#e05f5f)';

  if (player.inCar || player.inHeli) {
    const v = player.inCar || player.inHeli;
    els.speed.style.display = 'block';
    els.speed.innerHTML = Math.round(v.vel.length() * 2.4) + ' <small>MPH</small>';
    els.crosshair.style.display = 'none';
    els.weapon.style.display = 'none';
  } else {
    els.speed.style.display = 'none';
    els.crosshair.style.display = 'block';
    els.weapon.style.display = 'block';
    els.weapon.textContent = world.weaponName || '';
  }

  // live key indicator — lights up when the game receives the key
  els.kw.classList.toggle('on', !!keys['KeyW']);
  els.ka.classList.toggle('on', !!keys['KeyA']);
  els.ks.classList.toggle('on', !!keys['KeyS']);
  els.kd.classList.toggle('on', !!keys['KeyD']);

  drawMinimap(world);
}

function drawMinimap(world) {
  const c = els.minimap;
  const g = mapCtx;
  const size = c.width;
  const sc = size / (CITY + 30);
  const toMap = (x, z) => [(x + HALF + 15) * sc, (z + HALF + 15) * sc];

  g.fillStyle = '#17202b';
  g.fillRect(0, 0, size, size);

  // roads
  g.strokeStyle = '#46505c';
  g.lineWidth = Math.max(2, 16 * sc);
  for (const rx of world.city.roadXs) {
    const [mx] = toMap(rx, 0);
    g.beginPath();
    g.moveTo(mx, 0);
    g.lineTo(mx, size);
    g.stroke();
  }
  for (const rz of world.city.roadZs) {
    const [, mz] = toMap(0, rz);
    g.beginPath();
    g.moveTo(0, mz);
    g.lineTo(size, mz);
    g.stroke();
  }

  // pickups
  for (const pk of world.pickups) {
    const [mx, mz] = toMap(pk.pos.x, pk.pos.z);
    g.fillStyle = pk.type === 'money' ? '#5fe07a' : '#e05f5f';
    g.fillRect(mx - 1.5, mz - 1.5, 3, 3);
  }

  // cops
  for (const cop of world.cops) {
    if (cop.dead) continue;
    const [mx, mz] = toMap(cop.pos.x, cop.pos.z);
    g.fillStyle = '#4a8cff';
    g.beginPath();
    g.arc(mx, mz, 3, 0, Math.PI * 2);
    g.fill();
  }

  // police helicopters
  for (const ph of world.policeHelis) {
    if (ph.dead) continue;
    const [mx, mz] = toMap(ph.pos.x, ph.pos.z);
    g.fillStyle = '#ff9a3d';
    g.beginPath();
    g.arc(mx, mz, 3.5, 0, Math.PI * 2);
    g.fill();
  }

  // rideable helicopters
  for (const hl of world.helis) {
    if (hl.dead || hl === world.player.inHeli) continue;
    const [mx, mz] = toMap(hl.pos.x, hl.pos.z);
    g.fillStyle = '#eaeaea';
    g.font = 'bold 9px Arial';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('H', mx, mz);
  }

  // player arrow
  const p = world.player.inCar || world.player.inHeli || world.player;
  const [mx, mz] = toMap(p.pos.x, p.pos.z);
  const h = p === world.player ? world.player.heading : p.heading;
  g.save();
  g.translate(mx, mz);
  g.rotate(Math.PI - h);
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(0, -6);
  g.lineTo(4.5, 5);
  g.lineTo(-4.5, 5);
  g.closePath();
  g.fill();
  g.restore();
}
