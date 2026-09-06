// Open City bank API — an Express router mounted at /api/bank.
//
// Lightweight account model: a player registers a handle and gets back an
// account number + a bearer token. All money-moving endpoints require the
// token. Amounts are whole dollars (BIGINT cents would be nicer, but the
// game deals in whole dollars).
//
// If DATABASE_URL is unset every route replies 503 and the game keeps using
// local storage, so this is safe to ship before Neon is wired.
import express from 'express';
import crypto from 'crypto';
import { query, withTx, dbEnabled } from './db.js';

const router = express.Router();

const CASH_CAP = 10000;          // mirrors js/banking.js
const MAX_AMOUNT = 100_000_000;  // sanity ceiling per operation

function hash(v) { return crypto.createHash('sha256').update(String(v)).digest('hex'); }
function newToken() { return crypto.randomBytes(24).toString('base64url'); }
function newAccountNo() {
  let n = '';
  for (let i = 0; i < 10; i++) n += Math.floor(Math.random() * 10);
  return n.replace(/(\d{4})(\d{3})(\d{3})/, '$1 $2 $3');
}
function amountOf(body) {
  const a = Math.floor(Number(body?.amount));
  if (!Number.isFinite(a) || a <= 0 || a > MAX_AMOUNT) return null;
  return a;
}
function normAcct(s) { return String(s || '').trim().replace(/\s+/g, ' '); }

// Gate the whole router when the DB is off.
router.use((_req, res, next) => {
  if (!dbEnabled) return res.status(503).json({ error: 'bank offline', offline: true });
  next();
});

async function auth(req, res, next) {
  const h = req.get('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'missing token' });
  const { rows } = await query(
    'SELECT id, account_no, handle, balance FROM accounts WHERE token_hash = $1',
    [hash(token)],
  );
  if (!rows.length) return res.status(401).json({ error: 'bad token' });
  req.account = rows[0];
  next();
}

// POST /api/bank/register { handle }  -> { account_no, token, balance }
router.post('/register', async (req, res, next) => {
  try {
    const handle = String(req.body?.handle || '').trim().toLowerCase();
    if (!/^[a-z0-9_.-]{3,24}$/.test(handle)) {
      return res.status(400).json({ error: 'handle must be 3-24 chars: a-z 0-9 _ . -' });
    }
    const exists = await query('SELECT 1 FROM accounts WHERE handle = $1', [handle]);
    if (exists.rows.length) return res.status(409).json({ error: 'handle taken' });

    const token = newToken();
    let account_no = newAccountNo();
    // extremely unlikely collision guard
    for (let i = 0; i < 5; i++) {
      const c = await query('SELECT 1 FROM accounts WHERE account_no = $1', [account_no]);
      if (!c.rows.length) break;
      account_no = newAccountNo();
    }
    const startBalance = 5000; // new players get $5,000 in the bank
    await query(
      'INSERT INTO accounts (account_no, handle, token_hash, balance) VALUES ($1,$2,$3,$4)',
      [account_no, handle, hash(token), startBalance],
    );
    await query(
      "INSERT INTO transfers (to_account, amount, kind, note) VALUES ($1,$2,'reward','welcome bonus')",
      [account_no, startBalance],
    );
    res.json({ account_no, handle, token, balance: startBalance });
  } catch (e) { next(e); }
});

// POST /api/bank/login { handle, token } -> { account_no, balance }
router.post('/login', async (req, res, next) => {
  try {
    const handle = String(req.body?.handle || '').trim().toLowerCase();
    const token = String(req.body?.token || '');
    const { rows } = await query(
      'SELECT account_no, balance FROM accounts WHERE handle = $1 AND token_hash = $2',
      [handle, hash(token)],
    );
    if (!rows.length) return res.status(401).json({ error: 'bad handle or token' });
    res.json({ account_no: rows[0].account_no, handle, balance: Number(rows[0].balance) });
  } catch (e) { next(e); }
});

// GET /api/bank/account -> { account_no, handle, balance, cashCap }
router.get('/account', auth, async (req, res) => {
  res.json({
    account_no: req.account.account_no,
    handle: req.account.handle,
    balance: Number(req.account.balance),
    cashCap: CASH_CAP,
  });
});

// GET /api/bank/history?limit=20
router.get('/history', auth, async (req, res, next) => {
  try {
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 20));
    const acct = req.account.account_no;
    const { rows } = await query(
      `SELECT from_account, to_account, amount, kind, note, created_at
         FROM transfers
        WHERE from_account = $1 OR to_account = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [acct, limit],
    );
    res.json(rows.map((r) => ({
      ...r,
      amount: Number(r.amount),
      direction: r.to_account === acct ? 'in' : 'out',
    })));
  } catch (e) { next(e); }
});

// POST /api/bank/deposit { amount }  (game hands the server cash to bank)
router.post('/deposit', auth, async (req, res, next) => {
  try {
    const amount = amountOf(req.body);
    if (!amount) return res.status(400).json({ error: 'bad amount' });
    const { rows } = await withTx(async (c) => {
      const r = await c.query(
        'UPDATE accounts SET balance = balance + $1, updated_at = now() WHERE id = $2 RETURNING balance',
        [amount, req.account.id],
      );
      await c.query(
        "INSERT INTO transfers (to_account, amount, kind, note) VALUES ($1,$2,'deposit',$3)",
        [req.account.account_no, amount, req.body?.note || null],
      );
      return r;
    });
    res.json({ balance: Number(rows[0].balance) });
  } catch (e) { next(e); }
});

// POST /api/bank/withdraw { amount }
router.post('/withdraw', auth, async (req, res, next) => {
  try {
    const amount = amountOf(req.body);
    if (!amount) return res.status(400).json({ error: 'bad amount' });
    const out = await withTx(async (c) => {
      const r = await c.query(
        'UPDATE accounts SET balance = balance - $1, updated_at = now() WHERE id = $2 AND balance >= $1 RETURNING balance',
        [amount, req.account.id],
      );
      if (!r.rows.length) return null;
      await c.query(
        "INSERT INTO transfers (from_account, amount, kind, note) VALUES ($1,$2,'withdraw',$3)",
        [req.account.account_no, amount, req.body?.note || null],
      );
      return r.rows[0];
    });
    if (!out) return res.status(400).json({ error: 'insufficient balance' });
    res.json({ balance: Number(out.balance) });
  } catch (e) { next(e); }
});

// POST /api/bank/transfer { to, amount, note }
router.post('/transfer', auth, async (req, res, next) => {
  try {
    const amount = amountOf(req.body);
    const to = normAcct(req.body?.to);
    if (!amount) return res.status(400).json({ error: 'bad amount' });
    if (!to) return res.status(400).json({ error: 'recipient account required' });
    if (to === req.account.account_no) return res.status(400).json({ error: 'cannot transfer to yourself' });

    const result = await withTx(async (c) => {
      const dest = await c.query('SELECT id FROM accounts WHERE account_no = $1', [to]);
      if (!dest.rows.length) return { error: 'recipient not found' };

      const debit = await c.query(
        'UPDATE accounts SET balance = balance - $1, updated_at = now() WHERE id = $2 AND balance >= $1 RETURNING balance',
        [amount, req.account.id],
      );
      if (!debit.rows.length) return { error: 'insufficient balance' };

      await c.query(
        'UPDATE accounts SET balance = balance + $1, updated_at = now() WHERE account_no = $2',
        [amount, to],
      );
      await c.query(
        "INSERT INTO transfers (from_account, to_account, amount, kind, note) VALUES ($1,$2,$3,'transfer',$4)",
        [req.account.account_no, to, amount, req.body?.note || null],
      );
      return { balance: Number(debit.rows[0].balance) };
    });

    if (result.error) return res.status(400).json({ error: result.error });
    res.json({ balance: result.balance, to });
  } catch (e) { next(e); }
});

// error handler local to the router
router.use((err, _req, res, _next) => {
  console.error('[bank-api]', err.message);
  res.status(500).json({ error: 'bank error' });
});

export default router;
