'use strict';
const debug = require('debug')('flyto:migrations');

// Append only: a released migration is never edited, a change gets a new entry
const migrations = [
  {
    id: 1,
    name: 'files and downloads',
    sql: `
      CREATE TABLE IF NOT EXISTS files (
        fid        TEXT PRIMARY KEY,
        sid        TEXT NOT NULL,
        file_key   TEXT NOT NULL,
        data       JSONB NOT NULL,
        updated_at BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS files_sid ON files (sid);
      CREATE TABLE IF NOT EXISTS downloads (
        id            BIGSERIAL PRIMARY KEY,
        sid           TEXT NOT NULL,
        file_key      TEXT NOT NULL,
        name          TEXT,
        downloaded_at BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS downloads_file ON downloads (sid, file_key);
    `,
  },
  {
    id: 2,
    name: 'accounts',
    sql: `
      CREATE TABLE users (
        id                  BIGSERIAL PRIMARY KEY,
        email               TEXT NOT NULL,
        name                TEXT NOT NULL DEFAULT '',
        password_hash       TEXT,
        role                TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
        status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'disabled')),
        email_verified      BOOLEAN NOT NULL DEFAULT false,
        locale              TEXT,
        notify_downloads    BOOLEAN NOT NULL DEFAULT false,
        quota_transfer      BIGINT,
        quota_storage       BIGINT,
        quota_transfers     INTEGER,
        totp_secret         TEXT,
        totp_enabled        BOOLEAN NOT NULL DEFAULT false,
        totp_last_step      BIGINT,
        recovery_codes      JSONB NOT NULL DEFAULT '[]',
        failed_logins       INTEGER NOT NULL DEFAULT 0,
        locked_until        BIGINT,
        notes               TEXT NOT NULL DEFAULT '',
        invited_by          BIGINT REFERENCES users (id) ON DELETE SET NULL,
        created_at          BIGINT NOT NULL,
        updated_at          BIGINT NOT NULL,
        last_login_at       BIGINT,
        last_login_ip       TEXT,
        password_changed_at BIGINT
      );
      CREATE UNIQUE INDEX users_email ON users (lower(email));

      CREATE TABLE sessions (
        id           TEXT PRIMARY KEY,
        user_id      BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        csrf         TEXT NOT NULL,
        created_at   BIGINT NOT NULL,
        last_seen_at BIGINT NOT NULL,
        expires_at   BIGINT NOT NULL,
        ip           TEXT,
        user_agent   TEXT
      );
      CREATE INDEX sessions_user ON sessions (user_id);
      CREATE INDEX sessions_expires ON sessions (expires_at);

      CREATE TABLE user_tokens (
        id         TEXT PRIMARY KEY,
        user_id    BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        type       TEXT NOT NULL,
        data       JSONB NOT NULL DEFAULT '{}',
        created_at BIGINT NOT NULL,
        expires_at BIGINT NOT NULL,
        used_at    BIGINT
      );
      CREATE INDEX user_tokens_user ON user_tokens (user_id, type);

      CREATE TABLE invites (
        id         BIGSERIAL PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        email      TEXT,
        role       TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
        note       TEXT NOT NULL DEFAULT '',
        max_uses   INTEGER,
        uses       INTEGER NOT NULL DEFAULT 0,
        expires_at BIGINT,
        revoked_at BIGINT,
        created_by BIGINT REFERENCES users (id) ON DELETE SET NULL,
        created_at BIGINT NOT NULL
      );

      CREATE TABLE transfers (
        sid              TEXT PRIMARY KEY,
        owner_id         BIGINT REFERENCES users (id) ON DELETE SET NULL,
        created_at       BIGINT NOT NULL,
        suspended_at     BIGINT,
        suspended_reason TEXT
      );
      CREATE INDEX transfers_owner ON transfers (owner_id);

      CREATE TABLE uploads (
        id          BIGSERIAL PRIMARY KEY,
        sid         TEXT NOT NULL,
        file_key    TEXT NOT NULL,
        owner_id    BIGINT REFERENCES users (id) ON DELETE SET NULL,
        name        TEXT,
        size        BIGINT NOT NULL,
        uploaded_at BIGINT NOT NULL
      );
      CREATE INDEX uploads_at ON uploads (uploaded_at);
      CREATE INDEX uploads_owner ON uploads (owner_id);

      ALTER TABLE downloads
        ADD COLUMN ip TEXT,
        ADD COLUMN user_agent TEXT,
        ADD COLUMN size BIGINT,
        ADD COLUMN owner_id BIGINT REFERENCES users (id) ON DELETE SET NULL;
      CREATE INDEX downloads_at ON downloads (downloaded_at);
      CREATE INDEX downloads_owner ON downloads (owner_id);

      CREATE TABLE audit_log (
        id          BIGSERIAL PRIMARY KEY,
        at          BIGINT NOT NULL,
        actor_id    BIGINT REFERENCES users (id) ON DELETE SET NULL,
        actor_email TEXT,
        action      TEXT NOT NULL,
        target_type TEXT,
        target_id   TEXT,
        ip          TEXT,
        details     JSONB NOT NULL DEFAULT '{}'
      );
      CREATE INDEX audit_log_at ON audit_log (at DESC);
      CREATE INDEX audit_log_action ON audit_log (action);

      CREATE TABLE settings (
        key        TEXT PRIMARY KEY,
        value      JSONB NOT NULL,
        updated_at BIGINT NOT NULL,
        updated_by BIGINT REFERENCES users (id) ON DELETE SET NULL
      );
    `,
  },
];

// Several processes may start at once (tests, a restart racing the old container):
// the advisory lock serialises them
const LOCK_ID = 0x466c79746f;

async function migrate(pool) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id         INTEGER PRIMARY KEY,
        name       TEXT NOT NULL,
        applied_at BIGINT NOT NULL
      )`);
    const { rows } = await client.query('SELECT id FROM schema_migrations');
    const applied = new Set(rows.map(r => r.id));
    for (const m of migrations) {
      if (applied.has(m.id)) continue;
      debug(`Applying migration ${ m.id } ${ m.name }`);
      await client.query('BEGIN');
      try {
        await client.query(m.sql);
        await client.query('INSERT INTO schema_migrations (id, name, applied_at) VALUES ($1, $2, $3)',
          [m.id, m.name, Date.now()]);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        e.message = `migration ${ m.id } (${ m.name }) failed: ${ e.message }`;
        throw e;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    client.release();
  }
}

module.exports = { migrate, migrations, latest: migrations[migrations.length - 1].id };
