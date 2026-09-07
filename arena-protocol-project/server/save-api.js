// Open City cloud save — an Express router mounted at /api/save.
//
// One JSON blob per (bank account, slot 0..2). Auth is the SAME bearer token
// the bank uses (js/bankapi.js already stores and sends it), so "cloud save"
// just means "you have a bank account".
//
// If DATABASE_URL is unset every route replies 503 and the game keeps using
// local storage only — safe to ship before Neon is wired.
import express from 'express';
import crypto from 'crypto';
import { query, dbEnabled } from './db.js';

const router = express.Router();

export const MAX_BLOB_BYTES = 96 * 1024; // a full save is ~2-4 KB today; generous cap
const SLOTS = [0, 1, 2];

// The keys saveGame() in js/main.js is allowed to persist. Anything else in an
// uploaded blob is dropped before storage — a shared/tampered save can't smuggle
// extra fields or huge nested objects past this.
const ALLOWED_KEYS = new Set([
  'money', 'missions', 'mg', 'rpg', 'sg', 'sn', 'gren', 'upg', 'gang', 'radio',
  'garage', 'xp', 'stats', 'ach', 'tokens', 'suit', 'suits', 'settings', 'char',
  'props', 'rep', 'chaosBest', 'dailyDay', 'dailyDone', 'arenaBest', 'races',
  'mods', 'dog', 'heistDay', 'vigBest', 'jet', 'hoops', 'crowned', 'lastStand',
  'fable', 'lottoDay', 'expDay', 'expIdx', 'nemLvl', 'nemBeaten', 'mythsGraf',
  'mythsDone', 'strangerStage', 'cheistDay', 'empire', 'scuba', 'pearls',
  'chests', 'mayor', 'policy', 'salaryDay', 'prestige', 'swingBest', 'museumDay',
  'club', 'deck', 'synd', 'tourneyRung', 'tourneyChamp', 'crew', 'contractRank',
  'fame', 'gunMods', 'stormRank', 'hair', 'druglabDay', 'bank', 'karma',
  'pigeons', 'graffiti', 'guard', 'phoneStreak', 'boatBest', 'trickBest',
  'pizzaRuns', 'repoDone', 'icetruck', 'conesSold', 'newsShots', 'copRank',
  'copArrests', 'jewelryDay', 'slipRank', 'slipCars', 'mwIdx', 'lawyer',
  'stocks', 'stockPrices', 'casinoTakeDay', 'mallGiftDay', 'albert',
  'sewerChest', 'tickets', 'golfBest', 'chessWins', 'bossrushDay', 'perks',
  'blocksSeen', 'exploreRank', 'armor', 'lockup', 'cartOwned', 'safehouses',
  'safehouseRentDay', 'streetRaces', 'bhuntDay',
  // banking.js extras
  'bankBalance', 'bankSavings', 'bankLinkedHandle',
  // rideHail extras
  'rideHailFares', 'rideHailRating',
  // this session's additions
  'photoDone', 'photoDay',
]);

function slotOf(req) {
  const n = Number(req.params.slot);
  return SLOTS.includes(n) ? n : null;
}

// Keep only allowed top-level keys; reject anything not a plain JSON value.
export function sanitizeBlob(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return null;
  const out = {};
  for (const [k, v] of Object.entries(input)) {
    if (!ALLOWED_KEYS.has(k)) continue;
    // v must be JSON-round-trippable and not absurdly deep/large; JSON.parse of
    // the request body already guarantees plain values, so just copy.
    out[k] = v;
  }
  return out;
}

export function summary(blob) {
  const xp = Number(blob?.xp) || 0;
  return {
    money: Number(blob?.money) || 0,
    bank: Number(blob?.bank) || 0,
    missions: Number(blob?.missions) || 0,
    level: 1 + Math.floor(Math.sqrt(xp / 120)),
    packages: Array.isArray(blob?.tokens) ? blob.tokens.length : 0,
    crowned: !!blob?.crowned,
  };
}

// Gate the whole router when the DB is off (mirrors bank-api.js).
router.use((_req, res, next) => {
  if (!dbEnabled) return res.status(503).json({ error: 'cloud save offline', offline: true });
  next();
});

// Cap the body before express.json parses megabytes. The router is mounted
// after the global express.json(), so also re-check the parsed size below.
function hash(v) { return crypto.createHash('sha256').update(String(v)).digest('hex'); }

async function auth(req, res, next) {
  try {
    const h = req.get('authorization') || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'missing token' });
    const { rows } = await query('SELECT id FROM accounts WHERE token_hash = $1', [hash(token)]);
    if (!rows.length) return res.status(401).json({ error: 'bad token' });
    req.accountId = rows[0].id;
    next();
  } catch (e) { next(e); }
}

// GET /api/save  -> [{ slot, rev, updated_at, summary }]
router.get('/', auth, async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT slot, rev, updated_at, blob FROM cloud_saves WHERE account_id = $1 ORDER BY slot',
      [req.accountId],
    );
    res.json(rows.map((r) => ({
      slot: r.slot,
      rev: Number(r.rev),
      updated_at: r.updated_at,
      summary: summary(r.blob),
    })));
  } catch (e) { next(e); }
});

// GET /api/save/:slot -> { slot, rev, updated_at, blob }
router.get('/:slot', auth, async (req, res, next) => {
  try {
    const slot = slotOf(req);
    if (slot === null) return res.status(400).json({ error: 'slot must be 0, 1 or 2' });
    const { rows } = await query(
      'SELECT slot, rev, updated_at, blob FROM cloud_saves WHERE account_id = $1 AND slot = $2',
      [req.accountId, slot],
    );
    if (!rows.length) return res.status(404).json({ error: 'no cloud save in that slot' });
    res.json({
      slot: rows[0].slot,
      rev: Number(rows[0].rev),
      updated_at: rows[0].updated_at,
      blob: rows[0].blob,
    });
  } catch (e) { next(e); }
});

// PUT /api/save/:slot  body: { blob, baseRev? }
//   baseRev, if given, must match the current server rev or you get 409 with
//   the server's version — last-write-wins is opt-in via omitting baseRev.
router.put('/:slot', auth, async (req, res, next) => {
  try {
    const slot = slotOf(req);
    if (slot === null) return res.status(400).json({ error: 'slot must be 0, 1 or 2' });

    const raw = req.body?.blob;
    const bytes = Buffer.byteLength(JSON.stringify(raw ?? null));
    if (bytes > MAX_BLOB_BYTES) return res.status(413).json({ error: `save too large (${bytes} > ${MAX_BLOB_BYTES} bytes)` });

    const clean = sanitizeBlob(raw);
    if (!clean || !Object.keys(clean).length) return res.status(400).json({ error: 'blob must be a non-empty save object' });

    const baseRev = req.body?.baseRev;
    const current = await query(
      'SELECT rev, updated_at, blob FROM cloud_saves WHERE account_id = $1 AND slot = $2',
      [req.accountId, slot],
    );

    if (baseRev !== undefined && current.rows.length &&
        Number(baseRev) !== Number(current.rows[0].rev)) {
      return res.status(409).json({
        error: 'server has a newer save',
        server: {
          rev: Number(current.rows[0].rev),
          updated_at: current.rows[0].updated_at,
          summary: summary(current.rows[0].blob),
        },
      });
    }

    const { rows } = await query(
      `INSERT INTO cloud_saves (account_id, slot, blob, rev, updated_at)
         VALUES ($1, $2, $3, 1, now())
       ON CONFLICT (account_id, slot) DO UPDATE
         SET blob = EXCLUDED.blob,
             rev = cloud_saves.rev + 1,
             updated_at = now()
       RETURNING rev, updated_at`,
      [req.accountId, slot, JSON.stringify(clean)],
    );
    res.json({ ok: true, slot, rev: Number(rows[0].rev), updated_at: rows[0].updated_at });
  } catch (e) { next(e); }
});

// DELETE /api/save/:slot
router.delete('/:slot', auth, async (req, res, next) => {
  try {
    const slot = slotOf(req);
    if (slot === null) return res.status(400).json({ error: 'slot must be 0, 1 or 2' });
    await query('DELETE FROM cloud_saves WHERE account_id = $1 AND slot = $2', [req.accountId, slot]);
    res.json({ ok: true, slot });
  } catch (e) { next(e); }
});

router.use((err, _req, res, _next) => {
  console.error('[save-api]', err.message);
  res.status(500).json({ error: 'cloud save error' });
});

export default router;
