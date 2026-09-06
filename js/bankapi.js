// Client bridge to the Open City bank server (/api/bank). When the server is
// reachable and the player has linked an account, the bank overlay uses the
// real balance; otherwise banking.js falls back to its local-only balance.
//
// The API base is the same origin in production (the server serves the game),
// and can be overridden with ?bankapi=<url> for local testing against 3099.

const params = new URLSearchParams(location.search);
const BASE = (params.get('bankapi') || '').replace(/\/$/, '') + '/api/bank';
const LS_KEY = 'opencity-bank-cred-v1';

let cred = null;   // { account_no, handle, token }
try { cred = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch {}

let online = false;

async function call(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && cred?.token) headers.Authorization = 'Bearer ' + cred.token;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || res.statusText), { status: res.status, data });
  return data;
}

export function isLinked() { return !!cred?.token; }
export function isOnline() { return online; }
export function accountNo() { return cred?.account_no || null; }
export function handle() { return cred?.handle || null; }

function persist() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(cred)); } catch {}
}

// Ping the server; returns true if the bank API is up.
export async function probe() {
  try {
    const r = await fetch(BASE.replace('/api/bank', '/health'));
    const j = await r.json();
    online = !!j.bank;
  } catch { online = false; }
  return online;
}

export async function register(name) {
  const r = await call('/register', { method: 'POST', auth: false, body: { handle: name } });
  cred = { account_no: r.account_no, handle: r.handle, token: r.token };
  persist();
  return r;               // { account_no, handle, token, balance }
}

export async function login(name, token) {
  const r = await call('/login', { method: 'POST', auth: false, body: { handle: name, token } });
  cred = { account_no: r.account_no, handle: r.handle, token };
  persist();
  return r;               // { account_no, balance }
}

export function unlink() { cred = null; try { localStorage.removeItem(LS_KEY); } catch {} }

export async function getAccount()      { return call('/account'); }
export async function history(limit = 20) { return call(`/history?limit=${limit}`); }
export async function deposit(amount, note)  { return call('/deposit',  { method: 'POST', body: { amount, note } }); }
export async function withdraw(amount, note) { return call('/withdraw', { method: 'POST', body: { amount, note } }); }
export async function transfer(to, amount, note) { return call('/transfer', { method: 'POST', body: { to, amount, note } }); }
