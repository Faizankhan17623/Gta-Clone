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
    mission: document.getElementById('mission'),
    mtitle: document.getElementById('mtitle'),
    mtext: document.getElementById('mtext'),
    mtimer: document.getElementById('mtimer'),
    missionmsg: document.getElementById('missionmsg'),
    mm1: document.getElementById('mm1'),
    mm2: document.getElementById('mm2'),
    damage: document.getElementById('damage'),
  };
  mapCtx = els.minimap.getContext('2d');

  // news ticker along the bottom edge
  const news = document.createElement('div');
  news.id = 'news';
  news.style.cssText =
    'position:fixed;bottom:0;left:0;right:0;z-index:30;display:none;' +
    'background:rgba(8,10,14,0.78);color:#ffd24a;text-align:center;' +
    'font:600 13px/1.9 Arial;letter-spacing:2px;text-transform:uppercase;' +
    'border-top:1px solid rgba(255,210,74,0.35);padding:2px 0';
  document.body.appendChild(news);
  els.news = news;

  // NPC speech-bubble pool
  els.barks = [];
  for (let i = 0; i < 5; i++) {
    const b = document.createElement('div');
    b.style.cssText =
      'position:fixed;z-index:6;display:none;transform:translate(-50%,-100%);' +
      'background:rgba(255,255,255,0.92);color:#111;font:700 12px Arial;' +
      'padding:3px 8px;border-radius:8px;white-space:nowrap;pointer-events:none;';
    document.body.appendChild(b);
    els.barks.push(b);
  }

  // level badge next to the money counter
  const lvl = document.createElement('div');
  lvl.style.cssText =
    'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:6;' +
    'color:#8fd0ff;font:800 13px Arial;letter-spacing:2px;text-shadow:1px 1px 0 #000;pointer-events:none;';
  document.body.appendChild(lvl);
  els.level = lvl;
}

let newsTimer = null;
export function showNews(text) {
  if (!els) return;
  els.news.textContent = '⚡ CITY NEWS — ' + text;
  els.news.style.display = 'block';
  clearTimeout(newsTimer);
  newsTimer = setTimeout(() => { els.news.style.display = 'none'; }, 8000);
}

let msgTimer = null;
export function showMissionMsg(title, sub, color = '#7cf78c') {
  els.mm1.textContent = title;
  els.mm1.style.color = color;
  els.mm2.textContent = sub || '';
  els.missionmsg.classList.add('show');
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => els.missionmsg.classList.remove('show'), 3200);
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
  els.health.style.width = Math.min(100, (hp / (world.maxHealth || 100)) * 100) + '%';
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

  // mission panel
  const m = world.mission;
  if (m && m.active) {
    els.mission.style.display = 'block';
    els.mtitle.textContent = m.title;
    els.mtext.textContent = m.text;
    const secs = Math.max(0, Math.ceil(m.timeLeft));
    els.mtimer.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    els.mtimer.style.color = m.timeLeft < 12 ? '#ff5a4a' : '#fff';
  } else {
    els.mission.style.display = 'none';
  }

  // NPC speech bubbles (screen coords projected by main)
  for (let i = 0; i < els.barks.length; i++) {
    const div = els.barks[i];
    const b = world.barks && world.barks[i];
    if (!b || b.sy < 0) { div.style.display = 'none'; continue; }
    div.textContent = b.text;
    div.style.left = b.sx + 'px';
    div.style.top = b.sy + 'px';
    div.style.opacity = Math.min(1, b.t).toFixed(2);
    div.style.display = 'block';
  }

  // level + style readout
  els.level.textContent = `LVL ${world.level || 1}` + (world.style > 5 ? ` · STYLE ${Math.round(world.style)}` : '');

  // hurt flash + low health pulse
  let dmg = world.damageFlash || 0;
  if (hp > 0 && hp < 30) dmg = Math.max(dmg, 0.22 + Math.sin(world.time * 6) * 0.1);
  els.damage.style.opacity = Math.min(1, dmg).toFixed(2);

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

  // gang turf tint
  if (world.gang) {
    const z = world.gang.zone;
    const [x0, z0] = toMap(z.x0, z.z0);
    const [x1, z1] = toMap(z.x1, z.z1);
    g.fillStyle = world.gang.owned ? 'rgba(47,175,78,0.25)' : 'rgba(192,48,48,0.3)';
    g.fillRect(x0, z0, x1 - x0, z1 - z0);
  }

  // robbable stores
  if (world.shops) {
    for (const s of world.shops) {
      const [mx, mz] = toMap(s.pos.x, s.pos.z);
      g.fillStyle = s.cd > 0 ? '#5a5a60' : '#2fd06a';
      g.fillRect(mx - 2, mz - 2, 4, 4);
    }
  }

  // tanks
  if (world.tanks) {
    for (const t of world.tanks) {
      if (t.dead) continue;
      const [mx, mz] = toMap(t.pos.x, t.pos.z);
      g.fillStyle = '#ff3b3b';
      g.fillRect(mx - 3, mz - 3, 6, 6);
    }
  }

  // pickups
  for (const pk of world.pickups) {
    const [mx, mz] = toMap(pk.pos.x, pk.pos.z);
    g.fillStyle = pk.type === 'money' ? '#5fe07a' : pk.type === 'ammo' ? '#ffc94a' : '#e05f5f';
    g.fillRect(mx - 1.5, mz - 1.5, 3, 3);
  }

  // mission blips: yellow = mission start, pink = live objective
  const m = world.mission;
  if (m) {
    const pulse = 3 + Math.sin(performance.now() * 0.006) * 1.2;
    if (m.active) {
      const [mx, mz] = toMap(m.objectivePos.x, m.objectivePos.z);
      g.fillStyle = '#ff4ad2';
      g.beginPath();
      g.arc(mx, mz, pulse + 1, 0, Math.PI * 2);
      g.fill();
    } else {
      const [mx, mz] = toMap(m.markerPos.x, m.markerPos.z);
      g.fillStyle = '#ffd24a';
      g.beginPath();
      g.arc(mx, mz, pulse, 0, Math.PI * 2);
      g.fill();
    }
  }

  // waypoint
  if (world.waypoint) {
    const [mx, mz] = toMap(world.waypoint.x, world.waypoint.z);
    g.fillStyle = '#4ad2ff';
    g.beginPath();
    g.arc(mx, mz, 4, 0, Math.PI * 2);
    g.fill();
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
