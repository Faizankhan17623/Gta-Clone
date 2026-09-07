const $ = id => document.getElementById(id);
let timer, refreshing = false;
function status(message, kind = 'bad') { $('status').textContent = message; $('status').className = kind; }
async function request(url, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 40000);
  try {
    const res = await fetch(url, { credentials: 'same-origin', signal: controller.signal,
      ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
    if (!res.headers.get('content-type')?.includes('application/json'))
      throw new Error('Admin requires the Node server. Open /admin on the backend, not the static game preview.');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Admin request failed (' + res.status + ')');
    return data;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Request timed out. Check the backend and mail configuration, then retry.');
    if (e instanceof TypeError) throw new Error('Cannot reach the admin server. Check your connection and retry.');
    throw e;
  } finally { clearTimeout(timeout); }
}
function cell(row, value) { const td = document.createElement('td'); td.textContent = String(value ?? '—'); row.append(td); return td; }
async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    const [d, players] = await Promise.all([request('/admin/metrics'), request('/admin/players')]);
    for (const [id, value] of Object.entries({ players: d.playersOnline, connections: d.connections,
      requests: d.requests, memory: d.memoryMb + ' MB', latency: d.averageLatencyMs + ' ms',
      four: d.responses4xx, five: d.responses5xx, uptime: Math.floor(d.uptimeSec / 60) + 'm',
      queue: d.matchmakingQueue, suspicious: d.suspiciousInputs })) $(id).textContent = value;
    $('events').replaceChildren();
    for (const [name, count] of Object.entries(d.socketEvents).sort((a,b) => b[1]-a[1]).slice(0,12)) {
      const row = document.createElement('tr'); cell(row, name); cell(row, count); $('events').append(row);
    }
    $('playerRows').replaceChildren();
    for (const p of players) {
      const row = document.createElement('tr'); cell(row, p.name); cell(row, p.room);
      cell(row, p.kills + '/' + p.deaths);
      const button = document.createElement('button'); button.textContent = p.bannedUntil ? 'UNBAN' : 'BAN 1H';
      button.title = 'Connection/IP ban: can affect other players sharing the same network.';
      button.onclick = async () => {
        button.disabled = true;
        try { await request('/admin/players/' + encodeURIComponent(p.id) + '/' + (p.bannedUntil ? 'unban' : 'ban'), { minutes: 60 }); await refresh(); }
        catch (e) { status(e.message); } finally { button.disabled = false; }
      };
      cell(row, '').append(button); $('playerRows').append(row);
    }
    $('errors').replaceChildren();
    for (const e of d.recentErrors.slice(0,12)) {
      const div = document.createElement('div'); div.className = 'error';
      div.textContent = e.context + ' · ' + e.message + ' · ' + e.at; $('errors').append(div);
    }
    if (!d.recentErrors.length) $('errors').textContent = 'No errors recorded.';
    $('dashboard').classList.remove('hidden'); status('Live · updated ' + new Date().toLocaleTimeString(), 'ok');
  } catch (e) {
    clearInterval(timer); $('dashboard').classList.add('hidden'); status(e.message);
    throw e;
  } finally { refreshing = false; }
}
$('send').onclick = async () => {
  $('send').disabled = $('connect').disabled = true;
  $('send').textContent = 'SENDING…'; status('Sending to the configured admin email…', 'muted');
  try { const d = await request('/admin/send-token', {}); status(d.message || 'Check your email for the token.', 'ok'); }
  catch (e) { status(e.message); }
  finally { $('send').disabled = $('connect').disabled = false; $('send').textContent = 'SEND ADMIN TOKEN'; }
};
$('connect').onclick = async () => {
  $('connect').disabled = true;
  clearInterval(timer);
  try {
    await request('/admin/auth', { token: $('token').value.trim() }); $('token').value = '';
    await refresh(); timer = setInterval(() => refresh().catch(() => {}), 5000);
  } catch (e) { status(e.message); $('dashboard').classList.add('hidden'); }
  finally { $('connect').disabled = false; }
};
$('token').addEventListener('keydown', e => { if (e.key === 'Enter' && !$('connect').disabled) $('connect').click(); });
