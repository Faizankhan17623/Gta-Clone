import { io } from 'socket.io-client';

// Phase 6/7 client networking.
// Step 52: connect to the server.
// Step 65: send INPUT commands (server is authoritative).
// Step 62: outgoing input rate is capped independently of frame rate.
// Step 68: round-trip ping measurement for a lag display.

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

export function createNetwork({ onInit, onPlayerJoined, onPlayerLeft, onSnapshot, onEvent }) {
  const socket = io(SERVER_URL, { transports: ['websocket'] });

  let selfId = null;
  let connected = false;
  let ping = 0;

  socket.on('connect', () => {
    connected = true;
    console.log('[net] connected', socket.id);
  });
  socket.on('disconnect', () => {
    connected = false;
    console.log('[net] disconnected');
  });
  socket.on('connect_error', (err) => {
    console.warn('[net] connect_error:', err.message,
      '— is the server running on', SERVER_URL, '?');
  });

  socket.on('init', (data) => {
    selfId = data.id;
    onInit?.(data);
  });
  socket.on('player-joined', (p) => onPlayerJoined?.(p));
  socket.on('player-left', (id) => onPlayerLeft?.(id));
  // Snapshot shape (Phase 7): { t, p: [{id, x, z, ry, seq}] }
  socket.on('snapshot', (snap) => onSnapshot?.(snap));
  for (const event of ['scoreboard','kill','victory','respawn','you-hit','hit-confirmed','remote-shot','circle','round-reset','player-health','player-renamed']) {
    socket.on(event, data => onEvent?.(event, data));
  }

  // Step 65: send an input command. Capped to SEND_HZ; dt is accumulated so the
  // server still integrates the full elapsed time even when we skip a frame.
  const SEND_HZ = 30;
  let lastSent = 0;
  let accumDt = 0;
  function sendInput(cmd) {
    if (!connected) return;
    accumDt += cmd.dt;
    const now = performance.now();
    if (now - lastSent < 1000 / SEND_HZ) return;
    lastSent = now;
    socket.emit('input', { ...cmd, dt: accumDt });
    accumDt = 0;
  }
  function sendShot(shot) { if (connected) socket.emit('shot', shot); }
  function identify(name) { if (connected) socket.emit('identify', { name }); }

  // Step 68: ping every second (round-trip via Socket.io ack).
  setInterval(() => {
    if (!connected) return;
    const start = performance.now();
    socket.timeout(2000).emit('ping-check', () => {
      ping = Math.round(performance.now() - start);
    });
  }, 1000);

  return {
    socket,
    sendInput, sendShot, identify,
    get selfId() { return selfId; },
    get connected() { return connected; },
    get ping() { return ping; },
  };
}
