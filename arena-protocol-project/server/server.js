// game3d server — Node + Express + Socket.io.
// Phases 6-10. Server-authoritative movement (Phase 7) + combat (Phase 8) +
// game modes / circle / win condition (Phase 9) + accounts/stats hooks (Phase 10).
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { applyInput } from '../shared/movement.js';
import { rayHitsPlayer } from '../shared/hit.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import bankApi from './bank-api.js';
import { initSchema, dbEnabled } from './db.js';

const app = express();
const clientOrigin = process.env.CLIENT_ORIGIN || true;
app.use(cors({ origin: clientOrigin }));
app.use(express.json());

// Lightweight operational metrics. These stay in memory and are intentionally
// exposed only through the token-protected admin endpoints below.
const metrics = {
  startedAt: Date.now(),
  requests: 0,
  responses4xx: 0,
  responses5xx: 0,
  totalLatencyMs: 0,
  connections: 0,
  disconnects: 0,
  socketEvents: Object.create(null),
  recentErrors: [],
};
const ADMIN_WINDOW_MS = 60 * 60 * 1000;
let adminTokenHash = process.env.ADMIN_TOKEN ? hashToken(process.env.ADMIN_TOKEN) : null;
let adminTokenExpiresAt = process.env.ADMIN_TOKEN ? Date.now() + ADMIN_WINDOW_MS : 0;
let adminTokenSentAt = 0;
let adminAttempts = 0;
let adminLockedUntil = 0;
const adminSessions = new Map();
function hashToken(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function newToken() { return crypto.randomBytes(24).toString('base64url'); }
function cookieValue(req, name) {
  const raw = req.get('cookie') || '';
  const found = raw.split(';').map((v) => v.trim()).find((v) => v.startsWith(`${name}=`));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : '';
}
function validAdminSession(req) {
  const key = cookieValue(req, 'arena_admin_session');
  const expires = adminSessions.get(key);
  if (!key || !expires || expires < Date.now()) { if (key) adminSessions.delete(key); return false; }
  return true;
}
function recordError(error, context = 'server') {
  const entry = { at: new Date().toISOString(), context, message: String(error?.message || error) };
  metrics.recentErrors.unshift(entry);
  metrics.recentErrors.splice(50);
  console.error(`[${context}]`, entry.message);
}
app.use((req, res, next) => {
  const started = performance.now();
  metrics.requests++;
  res.on('finish', () => {
    const latency = performance.now() - started;
    metrics.totalLatencyMs += latency;
    if (res.statusCode >= 400 && res.statusCode < 500) metrics.responses4xx++;
    if (res.statusCode >= 500) metrics.responses5xx++;
  });
  next();
});

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.resolve(SERVER_DIR, '../..');
const FRONTEND_DIR = path.resolve(SERVER_DIR, '../game3d/dist');
if (fs.existsSync(FRONTEND_DIR)) app.use('/arena-protocol', express.static(FRONTEND_DIR, { index: false }));
app.use(express.static(REPO_DIR, { index: false }));
app.get('/arena-protocol/', (_req, res) => {
  const index = path.join(FRONTEND_DIR, 'index.html');
  if (fs.existsSync(index)) return res.sendFile(index);
  res.status(404).send('Arena Protocol build not found');
});
app.get('/', (_req, res) => {
  const index = path.join(REPO_DIR, 'index.html');
  if (fs.existsSync(index)) return res.sendFile(index);
  res.send('game3d server running');
});
app.get('/health', (_req, res) => res.json({ ok: true, uptimeSec: Math.round(process.uptime()), bank: dbEnabled }));

// Open City bank — replies 503 (offline) until DATABASE_URL is set
app.use('/api/bank', bankApi);

function adminAuthorized(req) {
  const configured = process.env.ADMIN_TOKEN;
  return validAdminSession(req) || Boolean(configured && req.get('x-admin-token') === configured);
}
function requireAdmin(req, res, next) {
  if (!adminAuthorized(req)) return res.status(401).json({ error: 'Admin authorization required' });
  next();
}
app.get('/admin', (_req, res) => res.sendFile(path.join(SERVER_DIR, 'admin.html')));
app.post('/admin/send-token', async (_req, res) => {
  if (adminTokenSentAt && Date.now() - adminTokenSentAt < ADMIN_WINDOW_MS) {
    return res.status(429).json({ error: 'A new admin token can be sent once per hour' });
  }
  const { SMTP_HOST, SMTP_PORT = '587', SMTP_USER, SMTP_PASS, ADMIN_EMAIL, ADMIN_TOKEN_INLINE } = process.env;
  const token = newToken();
  const armToken = () => {
    adminTokenHash = hashToken(token);
    adminTokenExpiresAt = Date.now() + ADMIN_WINDOW_MS;
    adminTokenSentAt = Date.now();
    adminAttempts = 0;
    adminLockedUntil = 0;
  };

  const smtpReady = SMTP_HOST && SMTP_USER && SMTP_PASS && ADMIN_EMAIL;
  if (!smtpReady) {
    // No mail configured. If the operator opted in with ADMIN_TOKEN_INLINE=1,
    // return the fresh token directly (trusted-deploy convenience). Otherwise
    // say clearly which SMTP variables are missing.
    if (String(ADMIN_TOKEN_INLINE) === '1') {
      armToken();
      return res.json({ ok: true, inline: true, token, message: 'Email is off — here is your one-hour admin token' });
    }
    const missing = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'ADMIN_EMAIL'].filter((k) => !process.env[k]);
    return res.status(503).json({
      error: `Email delivery not configured — missing ${missing.join(', ')}. Or set ADMIN_TOKEN_INLINE=1 to receive the token here.`,
    });
  }

  try {
    const { default: nodemailer } = await import('nodemailer');
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: String(SMTP_PORT) === '465',
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    await transporter.verify().catch((e) => { throw new Error(`SMTP connection failed: ${e.message}`); });
    await transporter.sendMail({
      from: SMTP_USER,
      to: ADMIN_EMAIL,
      subject: 'Arena Protocol admin token',
      text: `Your admin token is ${token}. It expires in one hour.`,
    });
    armToken();
    res.json({ ok: true, message: `Admin token sent to ${ADMIN_EMAIL}` });
  } catch (error) {
    recordError(error, 'admin-email');
    res.status(502).json({ error: `Could not send token: ${String(error.message || error).slice(0, 160)}` });
  }
});
app.post('/admin/auth', (req, res) => {
  if (Date.now() < adminLockedUntil) return res.status(423).json({ error: 'Admin access is locked for one hour', redirect: '/' });
  const supplied = typeof req.body?.token === 'string' ? req.body.token : '';
  const matches = adminTokenHash && Date.now() < adminTokenExpiresAt && crypto.timingSafeEqual(Buffer.from(hashToken(supplied)), Buffer.from(adminTokenHash));
  if (!matches) {
    adminAttempts++;
    if (adminAttempts >= 2) { adminLockedUntil = Date.now() + ADMIN_WINDOW_MS; return res.status(423).json({ error: 'Two invalid attempts used. Admin access is locked for one hour.', redirect: '/' }); }
    return res.status(401).json({ error: 'Invalid token', attemptsRemaining: 2 - adminAttempts });
  }
  adminAttempts = 0;
  const session = crypto.randomBytes(24).toString('base64url'); adminSessions.set(session, Date.now() + ADMIN_WINDOW_MS);
  res.setHeader('Set-Cookie', `arena_admin_session=${encodeURIComponent(session)}; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=3600`);
  res.json({ ok: true });
});
app.get('/admin/metrics', requireAdmin, (_req, res) => {
  const uptimeSec = Math.round(process.uptime());
  res.json({
    now: new Date().toISOString(),
    uptimeSec,
    playersOnline: players.size,
    connections: metrics.connections,
    disconnects: metrics.disconnects,
    requests: metrics.requests,
    responses4xx: metrics.responses4xx,
    responses5xx: metrics.responses5xx,
    averageLatencyMs: metrics.requests ? Math.round(metrics.totalLatencyMs / metrics.requests) : 0,
    socketEvents: metrics.socketEvents,
    matchmakingQueue: matchmakingQueue.size,
    suspiciousInputs,
    memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    recentErrors: metrics.recentErrors,
  });
});
app.get('/admin/errors', requireAdmin, (_req, res) => res.json(metrics.recentErrors));
app.get('/admin/players', requireAdmin, (_req, res) => res.json(Array.from(players.values()).map((p) => ({ id: p.id, name: p.name, team: p.team, room: p.room || null, kills: p.kills, deaths: p.deaths, alive: p.alive, bannedUntil: bannedPlayers.get(p.id) || 0 }))));
app.post('/admin/players/:id/ban', requireAdmin, (req, res) => {
  const id = req.params.id; const minutes = Math.max(1, Math.min(1440, Number(req.body?.minutes) || 60));
  if (!players.has(id)) return res.status(404).json({ error: 'Player not found' });
  bannedPlayers.set(id, Date.now() + minutes * 60000); io.sockets.sockets.get(id)?.disconnect(true);
  res.json({ ok: true, bannedUntil: bannedPlayers.get(id) });
});
app.post('/admin/players/:id/unban', requireAdmin, (_req, res) => { bannedPlayers.delete(req.params.id); res.json({ ok: true }); });
app.get('/admin/matchmaking', requireAdmin, (_req, res) => res.json({ queued: matchmakingQueue.size, queuedPlayerIds: [...matchmakingQueue] }));
app.post('/admin/broadcast', requireAdmin, (req, res) => { const message = String(req.body?.message || '').trim(); if (!message) return res.status(400).json({ error: 'Message required' }); announce(message, 'admin'); res.json({ ok: true }); });
app.post('/admin/rotate-map', requireAdmin, (_req, res) => { rotateMap(); res.json({ ok: true, map: round.maps[round.map] }); });
app.get('/admin/round', requireAdmin, (_req, res) => res.json({ mode: round.mode, map: round.maps[round.map], remainingSec: Math.max(0, Math.ceil((round.durationMs - (Date.now() - round.startedAt)) / 1000)), spectators: spectators.size }));

const LEADERBOARD_FILE = path.join(process.cwd(), 'arena-leaderboard.json');
let persistentLeaderboard = [];
try { persistentLeaderboard = JSON.parse(fs.readFileSync(LEADERBOARD_FILE, 'utf8')); } catch { /* first run */ }
app.get('/leaderboard', (_req, res) => res.json(persistentLeaderboard.slice(0, 100)));

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: process.env.CLIENT_ORIGIN || '*', methods: ['GET', 'POST'] } });

// --- In-memory state ---
const players = new Map(); // id -> player
const bannedPlayers = new Map();
const matchmakingQueue = new Set();
let suspiciousInputs = 0;
const mutedPlayers = new Set();
const spectators = new Set();
const chatBuckets = new Map();
const round = { mode: 'deathmatch', map: 0, maps: ['outpost', 'harbor', 'spire'], startedAt: Date.now(), durationMs: 10 * 60 * 1000 };
function announce(message, kind = 'server') { io.emit('server-announcement', { message: String(message).slice(0, 180), kind, at: Date.now() }); }
function balancedTeam() { const red = [...players.values()].filter((p) => p.team === 'red').length; const blue = [...players.values()].filter((p) => p.team === 'blue').length; return red <= blue ? 'red' : 'blue'; }
function rotateMap() { round.map = (round.map + 1) % round.maps.length; round.startedAt = Date.now(); announce(`Map changed to ${round.maps[round.map].toUpperCase()}`, 'map'); }
let colorIndex = 0;
const COLORS = [0x4f9dff, 0xff7b4f, 0x4fff8a, 0xffd94f, 0xc14fff, 0xff4f9d, 0x4fffff, 0xff884f];

// Step 79: fixed spawn points around the arena (away from each other).
const SPAWN_POINTS = [
  [0, 10], [0, -10], [10, 0], [-10, 0],
  [14, 14], [-14, -14], [14, -14], [-14, 14],
];

const MAX_HEALTH = 100;
const RESPAWN_DELAY = 3000; // ms (Step 75)
const HISTORY_MS = 1000;    // lag-comp rewind window (Step 78)

function pickSpawn() {
  // Choose the spawn farthest from all living players.
  let best = SPAWN_POINTS[0];
  let bestScore = -Infinity;
  for (const [sx, sz] of SPAWN_POINTS) {
    let nearest = Infinity;
    for (const p of players.values()) {
      if (!p.alive) continue;
      const d = Math.hypot(p.x - sx, p.z - sz);
      if (d < nearest) nearest = d;
    }
    if (nearest > bestScore) { bestScore = nearest; best = [sx, sz]; }
  }
  return best;
}

function newPlayer(id) {
  const [sx, sz] = pickSpawn();
  return {
    id,
    x: sx, y: 1.7, z: sz, ry: 0,
    color: COLORS[colorIndex++ % COLORS.length],
    team: colorIndex % 2 ? 'red' : 'blue',
    name: `Player-${id.slice(0, 4)}`,
    lastSeq: 0,
    health: MAX_HEALTH,
    alive: true,
    kills: 0,
    deaths: 0,
    userId: null,       // Phase 10: set if the client authenticated
    history: [],        // [{t,x,z}] for lag compensation
  };
}

function scoreboard() {
  return Array.from(players.values())
    .map((p) => ({ id: p.id, name: p.name, team: p.team, kills: p.kills, deaths: p.deaths, alive: p.alive }))
    .sort((a, b) => b.kills - a.kills);
}
function saveLeaderboard(p) {
  persistentLeaderboard.push({ name: p.name, team: p.team, kills: p.kills, deaths: p.deaths, at: Date.now() });
  persistentLeaderboard.sort((a, b) => b.kills - a.kills);
  persistentLeaderboard = persistentLeaderboard.slice(0, 100);
  try { fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(persistentLeaderboard, null, 2)); } catch { /* read-only hosts keep memory leaderboard */ }
}

io.on('connection', (socket) => {
  metrics.connections++;
  const id = socket.id;
  const player = newPlayer(id);
  player.team = balancedTeam();
  players.set(id, player);
  socket.emit('connection-ready', { id, reconnectable: true });
  socket.emit('connection-ready', { id, reconnectable: true });
  socket.onAny((event) => { metrics.socketEvents[event] = (metrics.socketEvents[event] || 0) + 1; });
  console.log(`[connect] ${id} (${players.size} online)`);

  socket.emit('init', {
    id,
    self: player,
    players: Array.from(players.values()).filter((p) => p.id !== id),
    mode: gameMode.public(),
  });
  socket.broadcast.emit('player-joined', publicPlayer(player));
  io.emit('scoreboard', scoreboard()); // Step 77

  // Phase 10: optional identity (name) supplied by an authenticated client.
  socket.on('identify', ({ name, userId } = {}) => {
    if (typeof name === 'string' && name.trim()) player.name = name.trim().slice(0, 16);
    if (typeof userId === 'string') player.userId = userId;
    io.emit('scoreboard', scoreboard());
    io.emit('player-renamed', { id, name: player.name }); // Step 88
  });
  socket.on('set-team', ({ team } = {}) => {
    if (team === 'red' || team === 'blue') { player.team = team; io.emit('scoreboard', scoreboard()); }
  });
  socket.on('join-room', ({ code } = {}) => {
    if (typeof code !== 'string' || !code.trim()) return;
    const room = code.trim().toUpperCase().slice(0, 8);
    socket.join(room); player.room = room; socket.emit('room-joined', { room });
  });
  socket.on('set-mode', ({ mode } = {}) => {
    if (!['deathmatch', 'team-deathmatch', 'survival'].includes(mode)) return;
    round.mode = mode; round.startedAt = Date.now(); announce(`Mode changed to ${mode.replaceAll('-', ' ').toUpperCase()}`, 'mode');
  });
  socket.on('chat', ({ message, teamOnly = false } = {}) => {
    if (mutedPlayers.has(id) || typeof message !== 'string') return;
    const now = Date.now(); const recent = (chatBuckets.get(id) || []).filter((t) => now - t < 10000);
    if (recent.length >= 5) return socket.emit('chat-error', { error: 'Chat rate limit reached' });
    recent.push(now); chatBuckets.set(id, recent);
    const payload = { id, name: player.name, message: message.trim().slice(0, 180), at: now };
    if (!payload.message) return;
    if (teamOnly) io.sockets.sockets.forEach((s) => { if (players.get(s.id)?.team === player.team) s.emit('chat', payload); }); else io.emit('chat', payload);
  });
  socket.on('emote', ({ emote } = {}) => { if (typeof emote === 'string' && emote.length <= 24) io.emit('emote', { id, name: player.name, emote }); });
  socket.on('spectate', ({ targetId } = {}) => { spectators.add(id); player.spectating = targetId || null; socket.emit('spectating', { targetId: player.spectating }); });
  socket.on('stop-spectate', () => { spectators.delete(id); player.spectating = null; socket.emit('spectating', { targetId: null }); });
  socket.on('reconnect-session', ({ name } = {}) => { if (typeof name === 'string' && name.trim()) player.name = name.trim().slice(0, 16); socket.emit('reconnect-session', { id, room: player.room || null, mode: round.mode, map: round.maps[round.map] }); });
  socket.on('matchmake', () => {
    matchmakingQueue.add(id);
    socket.emit('matchmaking-status', { queued: true, position: [...matchmakingQueue].indexOf(id) + 1 });
    matchPlayers();
  });
  socket.on('matchmake-leave', () => { matchmakingQueue.delete(id); socket.emit('matchmaking-status', { queued: false }); });

  // Step 65: authoritative movement from input commands.
  socket.on('input', (cmd) => {
    const p = players.get(id);
    if (!p || !p.alive) return;
    if (typeof cmd.seq !== 'number' || cmd.seq <= p.lastSeq) { suspiciousInputs++; return; }
    if (!Number.isFinite(cmd.yaw) || !Number.isFinite(cmd.dt) || cmd.dt < 0 || cmd.dt > 0.1) { suspiciousInputs++; return; }
    const dt = Math.max(0, Math.min(cmd.dt, 0.1));

    const next = applyInput(p, {
      forward: !!cmd.forward, back: !!cmd.back, left: !!cmd.left, right: !!cmd.right,
      sprint: !!cmd.sprint, yaw: cmd.yaw, dt,
    });
    p.x = next.x; p.z = next.z; p.ry = cmd.yaw; p.lastSeq = cmd.seq;
  });

  // Step 71: client sends a shot event (origin + direction + client timestamp).
  // Step 72: SERVER does the hit detection — clients never claim kills.
  // Step 78: lag compensation — rewind targets to (now - clientLatency).
  socket.on('shot', (shot) => {
    const shooter = players.get(id);
    if (!shooter || !shooter.alive) return;
    const { origin, dir, fireTime } = shot;
    if (!validVec(origin) || !validVec(dir)) return;

    // Normalize direction defensively.
    const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
    const ndir = { x: dir.x / len, y: dir.y / len, z: dir.z / len };

    // Rewind window: how far back to look up target positions.
    const rewindTo = clampRewind(fireTime);

    let bestId = null;
    let bestDist = Infinity;
    for (const target of players.values()) {
      if (target.id === id || !target.alive || target.team === shooter.team) continue;
      const pos = positionAt(target, rewindTo);
      const t = rayHitsPlayer(origin, ndir, pos);
      if (t != null && t < bestDist) { bestDist = t; bestId = target.id; }
    }

    // Broadcast the tracer so everyone sees the shot (Step 74 visuals).
    socket.broadcast.emit('remote-shot', { id, origin, dir: ndir });

    if (bestId) {
      const victim = players.get(bestId);
      const DAMAGE = 25;
      victim.health -= DAMAGE;
      io.to(bestId).emit('you-hit', { by: id, health: Math.max(0, victim.health) });
      socket.emit('hit-confirmed', { target: bestId }); // shooter hit marker (Step 74)
      io.emit('player-health', { id: bestId, health: Math.max(0, victim.health) }); // Step 73

      if (victim.health <= 0) {
        victim.alive = false;
        victim.deaths++;
        shooter.kills++;
        saveLeaderboard(shooter);
        victim.health = 0;
        const respawnAt = Date.now() + RESPAWN_DELAY;
        victim.respawnAt = respawnAt;

        io.emit('kill', { killer: id, killerName: shooter.name, victim: bestId, victimName: victim.name }); // Step 76
        io.emit('scoreboard', scoreboard()); // Step 77
        gameMode.onKill(); // Phase 9 win-condition check

        // Step 75: schedule respawn.
        setTimeout(() => {
          const v = players.get(bestId);
          if (!v) return;
          const [sx, sz] = pickSpawn();
          v.x = sx; v.z = sz; v.health = MAX_HEALTH; v.alive = true;
          v.history.length = 0;
          io.to(bestId).emit('respawn', { x: sx, z: sz, health: MAX_HEALTH });
          io.emit('player-health', { id: bestId, health: MAX_HEALTH });
        }, RESPAWN_DELAY);
      }
    }
  });

  socket.on('ping-check', (ack) => { if (typeof ack === 'function') ack(); });

  socket.on('disconnect', () => {
    metrics.disconnects++;
    matchmakingQueue.delete(id);
    spectators.delete(id); chatBuckets.delete(id);
    players.delete(id);
    io.emit('player-left', id);
    io.emit('scoreboard', scoreboard());
    console.log(`[disconnect] ${id} (${players.size} online)`);
  });
});

function matchPlayers() {
  while (matchmakingQueue.size >= 2) {
    const ids = [...matchmakingQueue].slice(0, 2);
    ids.forEach((queuedId) => matchmakingQueue.delete(queuedId));
    const room = `match-${Date.now()}-${ids[0].slice(0, 4)}`;
    ids.forEach((queuedId) => {
      const socket = io.sockets.sockets.get(queuedId); const player = players.get(queuedId);
      if (socket && player) { socket.join(room); player.room = room; socket.emit('match-found', { room, opponentCount: 1 }); }
    });
  }
}

setInterval(() => {
  if (Date.now() - round.startedAt >= round.durationMs) { rotateMap(); io.emit('round-reset', { mode: round.mode, map: round.maps[round.map] }); }
}, 5000);

process.on('uncaughtException', (error) => recordError(error, 'uncaughtException'));
process.on('unhandledRejection', (error) => recordError(error, 'unhandledRejection'));

// Keep abandoned room/player state bounded on long-lived hosted servers.
setInterval(() => {
  for (const p of players.values()) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) { p.x = 0; p.z = 10; }
    if (p.history.length > 40) p.history.splice(0, p.history.length - 40);
  }
}, 30000);

// --- Helpers ---
function publicPlayer(p) {
  return { id: p.id, x: p.x, z: p.z, ry: p.ry, color: p.color, team: p.team, name: p.name, health: p.health };
}
function validVec(v) {
  return v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}
function clampRewind(fireTime) {
  const now = Date.now();
  if (!Number.isFinite(fireTime)) return now;
  return Math.max(now - HISTORY_MS, Math.min(fireTime, now));
}
// Step 78: interpolate a target's recorded position at a past time.
function positionAt(p, time) {
  const h = p.history;
  if (h.length === 0) return { x: p.x, z: p.z };
  if (time >= h[h.length - 1].t) return { x: p.x, z: p.z };
  if (time <= h[0].t) return { x: h[0].x, z: h[0].z };
  for (let i = 0; i < h.length - 1; i++) {
    if (h[i].t <= time && h[i + 1].t >= time) {
      const span = h[i + 1].t - h[i].t || 1;
      const f = (time - h[i].t) / span;
      return { x: h[i].x + (h[i + 1].x - h[i].x) * f, z: h[i].z + (h[i + 1].z - h[i].z) * f };
    }
  }
  return { x: p.x, z: p.z };
}

// --- Server tick: record history + broadcast snapshot (20 Hz) ---
const TICK_HZ = 20;
const r = (n) => Math.round(n * 1000) / 1000;
setInterval(() => {
  const now = Date.now();
  // Record position history for lag compensation.
  for (const p of players.values()) {
    p.history.push({ t: now, x: p.x, z: p.z });
    while (p.history.length > 2 && p.history[0].t < now - HISTORY_MS) p.history.shift();
  }
  gameMode.tick(now); // Phase 9: circle damage etc.

  if (players.size === 0) return;
  io.emit('snapshot', {
    t: now,
    p: Array.from(players.values()).map((p) => ({
      id: p.id, x: r(p.x), z: r(p.z), ry: r(p.ry), seq: p.lastSeq,
      hp: p.health, alive: p.alive,
    })),
  });
}, 1000 / TICK_HZ);

// --- Phase 9: game mode (shrinking circle + last-player-standing) ---
const gameMode = createGameMode(io, players, MAX_HEALTH);

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => console.log(`game3d server listening on http://localhost:${PORT}`));

// bring up the bank schema (no-op when DATABASE_URL is unset)
initSchema().catch((e) => console.error('[db] initSchema failed:', e.message));

// ---------------------------------------------------------------------------
// Phase 9 game mode lives here (kept in one file for simplicity).
// Step 84: shrinking safe zone ("the circle") that damages players outside it.
// Step 87: last-player-standing win condition + victory broadcast.
// ---------------------------------------------------------------------------
function createGameMode(io, players, MAX_HEALTH) {
  let circle = { x: 0, z: 0, radius: 30, targetRadius: 30 };
  let shrinking = false;
  let lastTick = Date.now();
  let roundOver = false;

  const SHRINK_INTERVAL = 20000; // ms between shrink phases
  const SHRINK_RATE = 1.2;       // radius units/sec while shrinking
  const CIRCLE_DAMAGE = 6;       // hp/sec outside the circle
  const MIN_RADIUS = 4;

  let nextShrink = Date.now() + SHRINK_INTERVAL;

  function tick(now) {
    const dt = (now - lastTick) / 1000;
    lastTick = now;
    if (players.size < 2) { roundOver = false; return; } // need 2+ players

    // Start a shrink phase periodically.
    if (!shrinking && now >= nextShrink && circle.radius > MIN_RADIUS) {
      shrinking = true;
      circle.targetRadius = Math.max(MIN_RADIUS, circle.radius * 0.6);
    }
    if (shrinking) {
      circle.radius = Math.max(circle.targetRadius, circle.radius - SHRINK_RATE * dt);
      if (circle.radius <= circle.targetRadius) {
        shrinking = false;
        nextShrink = now + SHRINK_INTERVAL;
      }
    }

    // Step 84: damage players outside the circle.
    for (const p of players.values()) {
      if (!p.alive) continue;
      const d = Math.hypot(p.x - circle.x, p.z - circle.z);
      if (d > circle.radius) {
        p.health -= CIRCLE_DAMAGE * dt;
        if (p.health <= 0) {
          p.health = 0; p.alive = false; p.deaths++;
          io.emit('kill', { killer: null, killerName: 'The Circle', victim: p.id, victimName: p.name });
          io.emit('player-health', { id: p.id, health: 0 });
          setTimeout(() => respawn(p), RESPAWN_DELAY);
        } else {
          io.to(p.id).emit('you-hit', { by: null, health: Math.max(0, p.health) });
        }
      }
    }

    io.emit('circle', { x: circle.x, z: circle.z, radius: r2(circle.radius) });
    checkWin();
  }

  function respawn(p) {
    if (!players.get(p.id)) return;
    p.health = MAX_HEALTH; p.alive = true; p.history.length = 0;
    io.to(p.id).emit('respawn', { x: p.x, z: p.z, health: MAX_HEALTH });
    io.emit('player-health', { id: p.id, health: MAX_HEALTH });
  }

  // Step 87: last player standing wins.
  function checkWin() {
    if (roundOver || players.size < 2) return;
    const living = Array.from(players.values()).filter((p) => p.alive);
    if (living.length === 1) {
      roundOver = true;
      const winner = living[0];
      io.emit('victory', { id: winner.id, name: winner.name });
      // Reset the round after a short delay.
      setTimeout(resetRound, 6000);
    }
  }

  function onKill() { checkWin(); }

  function resetRound() {
    circle = { x: 0, z: 0, radius: 30, targetRadius: 30 };
    shrinking = false;
    nextShrink = Date.now() + SHRINK_INTERVAL;
    roundOver = false;
    for (const p of players.values()) {
      p.health = MAX_HEALTH; p.alive = true; p.history.length = 0;
      io.to(p.id).emit('respawn', { x: p.x, z: p.z, health: MAX_HEALTH });
    }
    io.emit('round-reset');
    io.emit('scoreboard', scoreboard());
  }

  function public_() { return { circle: { x: circle.x, z: circle.z, radius: r2(circle.radius) } }; }
  const r2 = (n) => Math.round(n * 100) / 100;

  return { tick, onKill, public: public_ };
}
