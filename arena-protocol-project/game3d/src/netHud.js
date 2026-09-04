// Step 68: a small lag/ping display for debugging the network.
// Shows connection status, round-trip ping (ms), and how many other players
// are currently visible.
export function createNetHud() {
  const el = document.createElement('div');
  el.id = 'nethud';
  el.style.cssText =
    'position:fixed;top:8px;left:90px;z-index:40;font:12px/1.4 monospace;' +
    'color:#fff;background:rgba(0,0,0,0.45);padding:4px 8px;border-radius:4px;' +
    'pointer-events:none;white-space:pre;';
  document.body.appendChild(el);

  let lastText = '';
  function update(ping, connected, others) {
    const status = connected ? 'online' : 'OFFLINE';
    const color = !connected ? '#ff6666' : ping > 150 ? '#ffcc44' : '#88ff88';
    const text = `net: ${status}  ping: ${ping}ms  players: ${others + 1}`;
    if (text !== lastText) {
      el.textContent = text;
      el.style.color = color;
      lastText = text;
    }
  }

  return { update };
}
