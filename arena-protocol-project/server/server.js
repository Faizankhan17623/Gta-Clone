// game3d server — Node + Express + Socket.io.
// Phases 6-10. Server-authoritative movement (Phase 7) + combat (Phase 8) +
// game modes / circle / win condition (Phase 9) + accounts/stats hooks (Phase 10).
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { applyInput } from '../shared/movement.js';
import { rayHitsPlayer } from '../shared/hit.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (_req, res) => res.send('game3d server running'));

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*', methods: ['GET', 'POST'] } });

// --- In-memory state ---
const players = new Map(); // id -> player
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

io.on('connection', (socket) => {
  const id = socket.id;
  const player = newPlayer(id);
  players.set(id, player);
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

  // Step 65: authoritative movement from input commands.
  socket.on('input', (cmd) => {
    const p = players.get(id);
    if (!p || !p.alive) return;
    if (typeof cmd.seq !== 'number' || cmd.seq <= p.lastSeq) return;
    if (!Number.isFinite(cmd.yaw) || !Number.isFinite(cmd.dt)) return;
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
    players.delete(id);
    io.emit('player-left', id);
    io.emit('scoreboard', scoreboard());
    console.log(`[disconnect] ${id} (${players.size} online)`);
  });
});

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
