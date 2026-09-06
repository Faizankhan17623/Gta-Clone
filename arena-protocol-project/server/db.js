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
  console.log('[db] schema ready');
  return true;
}
