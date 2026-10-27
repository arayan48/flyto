'use strict';
const debug = require('debug')('flyto:sessions');
const { sha256, randomToken, toUser } = require('./accounts');

const CACHE_TTL = 60;
// last_seen_at is written at most this often per session
const TOUCH_INTERVAL = 5 * 60 * 1000;

function shortUserAgent(ua) {
  return typeof ua === 'string' ? ua.slice(0, 300) : null;
}

class Sessions {

  constructor(pool, cache, settings) {
    this.pool = pool;
    this.cache = cache;
    this.settings = settings;
  }

  /**
   * @returns {Promise<{token: string, session: Object}>} token goes into the cookie, only its hash is stored
   */
  async create(userId, req, { remember = true } = {}) {
    const token = randomToken();
    const now = Date.now();
    const days = remember ? this.settings.get('sessionDays') : 1;
    const session = {
      id: sha256(token),
      userId,
      csrf: randomToken(18),
      createdAt: now,
      lastSeenAt: now,
      expiresAt: now + days * 86400000,
      persistent: remember,
    };
    await this.pool.query(`
      INSERT INTO sessions (id, user_id, csrf, created_at, last_seen_at, expires_at, ip, user_agent)
      VALUES ($1, $2, $3, $4, $4, $5, $6, $7)`,
      [session.id, userId, session.csrf, now, session.expiresAt, req.ip || null, shortUserAgent(req.get('user-agent'))]);
    debug(`Session created for user ${ userId }`);
    return { token, session };
  }

  /**
   * @returns {Promise<{session: Object, user: Object}|null>}
   */
  async lookup(token, req) {
    if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
    const id = sha256(token);
    const cacheKey = `session:${ id }`;
    let found = await this.cache.get(cacheKey);
    if (!found) {
      const { rows } = await this.pool.query(`
        SELECT s.id AS session_id, s.csrf, s.created_at AS session_created_at, s.last_seen_at, s.expires_at, u.*
        FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = $1`, [id]);
      if (!rows.length) return null;
      const row = rows[0];
      found = {
        session: {
          id: row.session_id,
          userId: +row.id,
          csrf: row.csrf,
          createdAt: +row.session_created_at,
          lastSeenAt: +row.last_seen_at,
          expiresAt: +row.expires_at,
        },
        user: toUser(row),
      };
      await this.cache.set(cacheKey, found, CACHE_TTL);
    }
    const now = Date.now();
    if (found.session.expiresAt <= now) {
      await this.revoke(id);
      return null;
    }
    if (found.user.status !== 'active') return null;
    if (now - found.session.lastSeenAt > TOUCH_INTERVAL) {
      found.session.lastSeenAt = now;
      this.pool.query('UPDATE sessions SET last_seen_at = $2, ip = $3 WHERE id = $1', [id, now, req.ip || null])
        .then(() => this.cache.set(cacheKey, found, CACHE_TTL))
        .catch(e => console.error(`Could not touch session: ${ e.message }`));
    }
    return found;
  }

  async list(userId) {
    const { rows } = await this.pool.query(`
      SELECT id, created_at, last_seen_at, expires_at, ip, user_agent FROM sessions
      WHERE user_id = $1 AND expires_at > $2 ORDER BY last_seen_at DESC`, [userId, Date.now()]);
    return rows.map(r => ({
      // the id is the hash of the cookie value, safe to expose as a handle
      id: r.id,
      createdAt: +r.created_at,
      lastSeenAt: +r.last_seen_at,
      expiresAt: +r.expires_at,
      ip: r.ip,
      userAgent: r.user_agent,
    }));
  }

  async revoke(id, userId = null) {
    const { rowCount } = userId === null
      ? await this.pool.query('DELETE FROM sessions WHERE id = $1', [id])
      : await this.pool.query('DELETE FROM sessions WHERE id = $1 AND user_id = $2', [id, userId]);
    await this.cache.del(`session:${ id }`);
    return rowCount;
  }

  async revokeAll(userId, exceptId = null) {
    const { rows } = await this.pool.query(
      'DELETE FROM sessions WHERE user_id = $1 AND id IS DISTINCT FROM $2 RETURNING id', [userId, exceptId]);
    await Promise.all(rows.map(r => this.cache.del(`session:${ r.id }`)));
    return rows.length;
  }

  // the cached user in a session must not outlive a change made elsewhere (role, status, quotas)
  async refreshUser(userId) {
    const { rows } = await this.pool.query('SELECT id FROM sessions WHERE user_id = $1', [userId]);
    await Promise.all(rows.map(r => this.cache.del(`session:${ r.id }`)));
  }

  async countActive() {
    const { rows } = await this.pool.query(`
      SELECT COUNT(*)::int AS sessions, COUNT(DISTINCT user_id)::int AS users FROM sessions
      WHERE expires_at > $1 AND last_seen_at > $2`, [Date.now(), Date.now() - 15 * 60000]);
    return rows[0];
  }

  async purgeExpired() {
    const { rowCount } = await this.pool.query('DELETE FROM sessions WHERE expires_at < $1', [Date.now()]);
    return rowCount;
  }
}

module.exports = Sessions;
