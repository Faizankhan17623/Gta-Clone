// Postgres pool + schema bootstrap for the Open City bank.
// The connection string comes from DATABASE_URL (Neon). If it is not set the
// bank API stays offline and the game falls back to local storage — the rest
// of the server is unaffected.
import pg from 'pg';

const { Pool } = pg;

let pool = null;
export const dbEnabled = Boolean(process.env.DATABASE_URL);

if (dbEnabled) {
  // Strip sslmode/channel_binding from the URL and set TLS explicitly so
  // pg doesn't warn about the deprecated sslmode aliases.
  const url = process.env.DATABASE_URL.replace(/([?&])(sslmode|channel_binding)=[^&]*/g, '').replace(/[?&]$/, '');
  pool = new Pool({
    connectionString: url,
    ssl: { require: true, rejectUnauthorized: false }, // Neon pooler TLS
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 8000,
  });
  pool.on('error', (err) => console.error('[db] pool error', err.message));
}

export async function query(text, params) {
  if (!pool) throw new Error('DATABASE_URL is not configured');
  return pool.query(text, params);
}

export async function withTx(fn) {
  if (!pool) throw new Error('DATABASE_URL is not configured');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

// Create the tables on first boot. Safe to call every start.
export async function initSchema() {
  if (!pool) return false;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS accounts (
      id            BIGSERIAL PRIMARY KEY,
      account_no    TEXT UNIQUE NOT NULL,
      handle        TEXT UNIQUE NOT NULL,
      token_hash    TEXT NOT NULL,
      balance       BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS transfers (
      id            BIGSERIAL PRIMARY KEY,
      from_account  TEXT,
      to_account    TEXT,
      amount        BIGINT NOT NULL CHECK (amount > 0),
      kind          TEXT NOT NULL,   -- deposit | withdraw | transfer | reward
      note          TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS transfers_from_idx ON transfers (from_account, created_at DESC);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS transfers_to_idx   ON transfers (to_account,   created_at DESC);`);

  // Admin token + session storage so a server restart doesn't invalidate an
  // outstanding token (the previous behaviour: it lived only in process memory
  // and reset every deploy).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_tokens (
      token_hash  TEXT PRIMARY KEY,
      expires_at  TIMESTAMPTZ NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_sessions (
      session_key TEXT PRIMARY KEY,
      expires_at  TIMESTAMPTZ NOT NULL
    );
  `);
  console.log('[db] schema ready');
  return true;
}

// --- admin token / session persistence (no-ops when the DB is off) ------------

export async function saveAdminToken(tokenHash, expiresAt) {
  if (!pool) return;
  await pool.query(
    `INSERT INTO admin_tokens (token_hash, expires_at) VALUES ($1, to_timestamp($2/1000.0))
     ON CONFLICT (token_hash) DO UPDATE SET expires_at = EXCLUDED.expires_at`,
    [tokenHash, expiresAt],
  );
  await pool.query(`DELETE FROM admin_tokens WHERE expires_at < now()`);
}

export async function adminTokenValid(tokenHash) {
  if (!pool) return false;
  const { rows } = await pool.query(
    `SELECT 1 FROM admin_tokens WHERE token_hash = $1 AND expires_at > now()`,
    [tokenHash],
  );
  return rows.length > 0;
}

export async function saveAdminSession(sessionKey, expiresAt) {
  if (!pool) return;
  await pool.query(
    `INSERT INTO admin_sessions (session_key, expires_at) VALUES ($1, to_timestamp($2/1000.0))
     ON CONFLICT (session_key) DO UPDATE SET expires_at = EXCLUDED.expires_at`,
    [sessionKey, expiresAt],
  );
  await pool.query(`DELETE FROM admin_sessions WHERE expires_at < now()`);
}

export async function adminSessionValid(sessionKey) {
  if (!pool) return false;
  const { rows } = await pool.query(
    `SELECT 1 FROM admin_sessions WHERE session_key = $1 AND expires_at > now()`,
    [sessionKey],
  );
  return rows.length > 0;
}
