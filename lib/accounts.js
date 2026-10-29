'use strict';
const { randomBytes, createHash } = require('node:crypto');
const debug = require('debug')('flyto:accounts');
const { hashPassword, verifyPassword } = require('./passwordHash');
const totp = require('./totp');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function httpError(status, code, message, extra = {}) {
  return Object.assign(new Error(message || code), { status, code, ...extra });
}

function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim() : '';
}

function optionalInt(value) {
  return value === null || value === undefined ? null : +value;
}

// a quota field from a form: empty follows the setting, otherwise a byte or transfer count
function parseQuota(key, value) {
  if (value === '' || value === null || value === undefined) return null;
  if (!Number.isSafeInteger(+value) || +value < 0) throw httpError(400, 'invalidQuota', `Invalid ${ key }`);
  return +value;
}

function isId(id) {
  return Number.isSafeInteger(+id) && +id > 0;
}

function toUser(row) {
  if (!row) return null;
  return {
    id: +row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
    emailVerified: row.email_verified,
    locale: row.locale,
    notifyDownloads: row.notify_downloads,
    quotaTransfer: optionalInt(row.quota_transfer),
    quotaStorage: optionalInt(row.quota_storage),
    quotaTransfers: optionalInt(row.quota_transfers),
    totpEnabled: row.totp_enabled,
    recoveryCodesLeft: Array.isArray(row.recovery_codes) ? row.recovery_codes.length : 0,
    failedLogins: row.failed_logins,
    lockedUntil: optionalInt(row.locked_until),
    notes: row.notes,
    invitedBy: optionalInt(row.invited_by),
    hasPassword: !!row.password_hash,
    createdAt: +row.created_at,
    updatedAt: +row.updated_at,
    lastLoginAt: optionalInt(row.last_login_at),
    lastLoginIp: row.last_login_ip,
    passwordChangedAt: optionalInt(row.password_changed_at),
  };
}

function toInvite(row) {
  return {
    id: +row.id,
    email: row.email,
    role: row.role,
    note: row.note,
    maxUses: optionalInt(row.max_uses),
    uses: row.uses,
    expiresAt: optionalInt(row.expires_at),
    revokedAt: optionalInt(row.revoked_at),
    createdBy: optionalInt(row.created_by),
    createdByEmail: row.created_by_email || null,
    createdAt: +row.created_at,
  };
}

const SORTS = {
  created: 'created_at',
  email: 'lower(email)',
  name: 'lower(name)',
  lastLogin: 'last_login_at',
  role: 'role',
  status: 'status',
};

class Accounts {

  constructor(pool, settings) {
    this.pool = pool;
    this.settings = settings;
  }

  checkEmail(email) {
    if (!EMAIL_RE.test(email) || email.length > 254) throw httpError(400, 'invalidEmail', 'Invalid e-mail address');
  }

  checkPassword(password, email = '') {
    const min = this.settings.get('passwordMinLength');
    if (typeof password !== 'string' || password.length < min) {
      throw httpError(400, 'passwordTooShort', `The password needs at least ${ min } characters`, { min });
    }
    if (password.length > 1024) throw httpError(400, 'passwordTooLong', 'The password is too long');
    if (email && password.toLowerCase() === email.toLowerCase()) {
      throw httpError(400, 'passwordIsEmail', 'The password must not be the e-mail address');
    }
    if (/^(.)\1+$/.test(password)) throw httpError(400, 'passwordTooWeak', 'The password is too weak');
  }

  async count() {
    const { rows } = await this.pool.query(`
      SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE role = 'admin' AND status = 'active')::int AS admins
      FROM users`);
    return rows[0];
  }

  async hasAdmin() {
    return (await this.count()).admins > 0;
  }

  async create({ email, name = '', password = null, role = 'user', status = 'active', emailVerified = false,
    invitedBy = null, locale = null, quotaTransfer = null, quotaStorage = null, quotaTransfers = null,
    notes = '' }, client = this.pool) {
    email = normalizeEmail(email);
    this.checkEmail(email);
    if (password !== null) this.checkPassword(password, email);
    quotaTransfer = parseQuota('quotaTransfer', quotaTransfer);
    quotaStorage = parseQuota('quotaStorage', quotaStorage);
    quotaTransfers = parseQuota('quotaTransfers', quotaTransfers);
    const now = Date.now();
    try {
      const { rows } = await client.query(`
        INSERT INTO users (email, name, password_hash, role, status, email_verified, invited_by, locale,
          quota_transfer, quota_storage, quota_transfers, notes, created_at, updated_at, password_changed_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13, $14)
        RETURNING *`,
        [email, String(name).trim().slice(0, 100), password === null ? null : await hashPassword(password),
          role, status, emailVerified, invitedBy, locale, quotaTransfer, quotaStorage, quotaTransfers,
          notes, now, password === null ? null : now]);
      debug(`Created user ${ email }`);
      return toUser(rows[0]);
    } catch (e) {
      if (e.code === '23505') throw httpError(409, 'emailTaken', 'An account already uses this e-mail address');
      throw e;
    }
  }

  async get(id) {
    if (!isId(id)) return null;
    const { rows } = await this.pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return toUser(rows[0]);
  }

  async getByEmail(email) {
    const { rows } = await this.pool.query('SELECT * FROM users WHERE lower(email) = lower($1)', [normalizeEmail(email)]);
    return toUser(rows[0]);
  }

  async getMany(ids) {
    if (!ids.length) return new Map();
    const { rows } = await this.pool.query('SELECT * FROM users WHERE id = ANY($1::bigint[])', [ids]);
    return new Map(rows.map(r => [+r.id, toUser(r)]));
  }

  async all() {
    const { rows } = await this.pool.query('SELECT * FROM users ORDER BY id');
    return rows.map(toUser);
  }

  async list({ q = '', role = '', status = '', sort = 'created', dir = 'desc', page = 1, perPage = 25 } = {}) {
    const where = [];
    const params = [];
    if (q) {
      params.push(`%${ q.replace(/[\\%_]/g, c => '\\' + c) }%`);
      where.push(`(email ILIKE $${ params.length } OR name ILIKE $${ params.length })`);
    }
    if (role) {
      params.push(role);
      where.push(`role = $${ params.length }`);
    }
    if (status === 'locked') {
      params.push(Date.now());
      where.push(`locked_until > $${ params.length }`);
    } else if (status === 'unverified') {
      where.push('email_verified = false');
    } else if (status === '2fa') {
      where.push('totp_enabled = true');
    } else if (status) {
      params.push(status);
      where.push(`status = $${ params.length }`);
    }
    const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const order = `${ SORTS[sort] || SORTS.created } ${ dir === 'asc' ? 'ASC' : 'DESC' } NULLS LAST, id DESC`;
    const { rows: [{ total }] } = await this.pool.query(`SELECT COUNT(*)::int AS total FROM users ${ clause }`, params);
    params.push(perPage, (page - 1) * perPage);
    const { rows } = await this.pool.query(
      `SELECT * FROM users ${ clause } ORDER BY ${ order } LIMIT $${ params.length - 1 } OFFSET $${ params.length }`,
      params);
    return { total, page, perPage, items: rows.map(toUser) };
  }

  /**
   * @returns {Promise<{user: Object, changed: Object}>}
   */
  async update(id, patch) {
    const current = await this.get(id);
    if (!current) throw httpError(404, 'userNotFound', 'User not found');
    const columns = {
      name: 'name', email: 'email', role: 'role', status: 'status', emailVerified: 'email_verified',
      locale: 'locale', notifyDownloads: 'notify_downloads', quotaTransfer: 'quota_transfer',
      quotaStorage: 'quota_storage', quotaTransfers: 'quota_transfers', notes: 'notes',
    };
    const sets = [];
    const params = [id];
    const changed = {};
    for (const [key, column] of Object.entries(columns)) {
      if (!(key in patch)) continue;
      let value = patch[key];
      if (key === 'email') {
        value = normalizeEmail(value);
        this.checkEmail(value);
      }
      if (key === 'name') value = String(value || '').trim().slice(0, 100);
      if (key === 'notes') value = String(value || '').slice(0, 5000);
      if (key === 'role' && !['user', 'admin'].includes(value)) throw httpError(400, 'invalidRole', 'Invalid role');
      if (key === 'status' && !['active', 'pending', 'disabled'].includes(value)) {
        throw httpError(400, 'invalidStatus', 'Invalid status');
      }
      if (['emailVerified', 'notifyDownloads'].includes(key)) value = !!value;
      if (key === 'locale') value = value ? String(value).slice(0, 10) : null;
      if (key.startsWith('quota')) value = parseQuota(key, value);
      if (JSON.stringify(value) === JSON.stringify(current[key])) continue;
      params.push(value);
      sets.push(`${ column } = $${ params.length }`);
      changed[key] = { from: current[key], to: value };
    }
    if (!sets.length) return { user: current, changed };

    // never leave the instance without an active admin
    const demoted = (changed.role && changed.role.to !== 'admin') || (changed.status && changed.status.to !== 'active');
    if (current.role === 'admin' && current.status === 'active' && demoted && (await this.count()).admins <= 1) {
      throw httpError(409, 'lastAdmin', 'This is the last active admin');
    }

    params.push(Date.now());
    sets.push(`updated_at = $${ params.length }`);
    try {
      const { rows } = await this.pool.query(`UPDATE users SET ${ sets.join(', ') } WHERE id = $1 RETURNING *`, params);
      return { user: toUser(rows[0]), changed };
    } catch (e) {
      if (e.code === '23505') throw httpError(409, 'emailTaken', 'An account already uses this e-mail address');
      throw e;
    }
  }

  async remove(id) {
    const user = await this.get(id);
    if (!user) throw httpError(404, 'userNotFound', 'User not found');
    if (user.role === 'admin' && user.status === 'active' && (await this.count()).admins <= 1) {
      throw httpError(409, 'lastAdmin', 'This is the last active admin');
    }
    await this.pool.query('DELETE FROM users WHERE id = $1', [id]);
    return user;
  }

  async setPassword(id, password) {
    const user = await this.get(id);
    if (!user) throw httpError(404, 'userNotFound', 'User not found');
    this.checkPassword(password, user.email);
    const now = Date.now();
    await this.pool.query(`
      UPDATE users SET password_hash = $2, password_changed_at = $3, updated_at = $3, failed_logins = 0,
        locked_until = NULL WHERE id = $1`,
      [id, await hashPassword(password), now]);
  }

  async verifyPassword(id, password) {
    const { rows } = await this.pool.query('SELECT password_hash FROM users WHERE id = $1', [id]);
    if (!rows.length || !rows[0].password_hash) return false;
    return verifyPassword(rows[0].password_hash, password);
  }

  /**
   * Password check for a login. Counts failures and locks the account for a while
   * after too many of them.
   * @returns {Promise<{user: Object}>}
   */
  async authenticate(email, password) {
    const { rows } = await this.pool.query('SELECT * FROM users WHERE lower(email) = lower($1)', [normalizeEmail(email)]);
    const row = rows[0];
    if (!row || !row.password_hash) {
      // same work as a real check, so timing does not tell whether the account exists
      await hashPassword(String(password || 'x'));
      throw httpError(401, 'invalidCredentials', 'Wrong e-mail or password');
    }
    if (row.locked_until && +row.locked_until > Date.now()) {
      throw httpError(429, 'accountLocked', 'Too many failed logins, try again later', { until: +row.locked_until });
    }
    if (!await verifyPassword(row.password_hash, String(password || ''))) {
      await this.loginFailed(row.id);
      throw httpError(401, 'invalidCredentials', 'Wrong e-mail or password');
    }
    return { user: toUser(row) };
  }

  /**
   * Failures count while they follow each other within the lockout duration,
   * an old typo does not bring a later login closer to the lock.
   */
  async loginFailed(id) {
    const max = this.settings.get('loginMaxAttempts');
    const now = Date.now();
    const window = this.settings.get('lockoutMinutes') * 60000;
    const failures = 'CASE WHEN last_failed_login_at > $3 THEN failed_logins + 1 ELSE 1 END';
    const { rows } = await this.pool.query(`
      UPDATE users SET failed_logins = ${ failures }, last_failed_login_at = $2,
        locked_until = CASE WHEN ${ failures } >= $4 THEN $5 ELSE locked_until END
      WHERE id = $1 RETURNING failed_logins, locked_until`, [id, now, now - window, max, now + window]);
    return rows[0];
  }

  async loginSucceeded(id, ip) {
    await this.pool.query(`
      UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = $2, last_login_ip = $3 WHERE id = $1`,
      [id, Date.now(), ip || null]);
  }

  async unlock(id) {
    await this.pool.query('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = $1', [id]);
  }

  // --- two-factor authentication

  async startTotp(id) {
    const secret = totp.generateSecret();
    await this.pool.query('UPDATE users SET totp_secret = $2, totp_enabled = false WHERE id = $1', [id, secret]);
    return secret;
  }

  /**
   * @returns {Promise<string[]>} fresh recovery codes, shown once
   */
  async enableTotp(id, code) {
    const { rows } = await this.pool.query('SELECT totp_secret, totp_enabled FROM users WHERE id = $1', [id]);
    if (!rows.length || !rows[0].totp_secret) throw httpError(400, 'totpNotStarted', 'Start the 2FA setup first');
    const step = totp.verify(rows[0].totp_secret, code);
    if (step === null) throw httpError(400, 'invalidCode', 'Wrong code');
    const codes = Array.from({ length: 10 }, () => randomBytes(5).toString('hex').replace(/(.{5})/, '$1-'));
    await this.pool.query(`
      UPDATE users SET totp_enabled = true, totp_last_step = $2, recovery_codes = $3, updated_at = $4 WHERE id = $1`,
      [id, step, JSON.stringify(codes.map(sha256)), Date.now()]);
    return codes;
  }

  async disableTotp(id) {
    await this.pool.query(`
      UPDATE users SET totp_enabled = false, totp_secret = NULL, totp_last_step = NULL, recovery_codes = '[]',
        updated_at = $2 WHERE id = $1`, [id, Date.now()]);
  }

  async regenerateRecoveryCodes(id) {
    const codes = Array.from({ length: 10 }, () => randomBytes(5).toString('hex').replace(/(.{5})/, '$1-'));
    await this.pool.query('UPDATE users SET recovery_codes = $2 WHERE id = $1 AND totp_enabled',
      [id, JSON.stringify(codes.map(sha256))]);
    return codes;
  }

  /**
   * Accepts a TOTP code (each time step once) or a recovery code (each code once).
   * @returns {Promise<'totp'|'recovery'|null>}
   */
  async checkSecondFactor(id, code) {
    const given = String(code || '').trim().toLowerCase();
    const { rows } = await this.pool.query(
      'SELECT totp_secret, totp_last_step, recovery_codes FROM users WHERE id = $1 AND totp_enabled', [id]);
    if (!rows.length) return null;
    const row = rows[0];
    const step = totp.verify(row.totp_secret, given);
    if (step !== null) {
      // the conditional update refuses a code replayed in the same window, even concurrently
      const { rowCount } = await this.pool.query(`
        UPDATE users SET totp_last_step = $2 WHERE id = $1 AND (totp_last_step IS NULL OR totp_last_step < $2)`,
        [id, step]);
      return rowCount ? 'totp' : null;
    }
    const hash = sha256(given);
    if (!row.recovery_codes.includes(hash)) return null;
    const { rowCount } = await this.pool.query(`
      UPDATE users SET recovery_codes = recovery_codes - $2::text WHERE id = $1 AND recovery_codes ? $2::text`,
      [id, hash]);
    return rowCount ? 'recovery' : null;
  }

  // --- one-time tokens: password reset, e-mail verification

  async createToken(userId, type, ttlSeconds, data = {}) {
    const token = randomToken();
    const now = Date.now();
    // a new link replaces the previous one of the same kind
    await this.pool.query('DELETE FROM user_tokens WHERE user_id = $1 AND type = $2', [userId, type]);
    await this.pool.query(`
      INSERT INTO user_tokens (id, user_id, type, data, created_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6)`,
      [sha256(token), userId, type, JSON.stringify(data), now, now + ttlSeconds * 1000]);
    return token;
  }

  async peekToken(token, type) {
    const { rows } = await this.pool.query(`
      SELECT * FROM user_tokens WHERE id = $1 AND type = $2 AND used_at IS NULL AND expires_at > $3`,
      [sha256(token), type, Date.now()]);
    return rows[0] ? { userId: +rows[0].user_id, data: rows[0].data, expiresAt: +rows[0].expires_at } : null;
  }

  async consumeToken(token, type) {
    const { rows } = await this.pool.query(`
      UPDATE user_tokens SET used_at = $3 WHERE id = $1 AND type = $2 AND used_at IS NULL AND expires_at > $3
      RETURNING user_id, data`,
      [sha256(token || ''), type, Date.now()]);
    return rows[0] ? { userId: +rows[0].user_id, data: rows[0].data } : null;
  }

  async purgeTokens() {
    const { rowCount } = await this.pool.query('DELETE FROM user_tokens WHERE expires_at < $1 OR used_at IS NOT NULL',
      [Date.now() - 86400000]);
    return rowCount;
  }

  // --- invitations

  async createInvite({ email = null, role = 'user', note = '', maxUses = 1, expiresAt = null, createdBy = null }) {
    if (email) {
      email = normalizeEmail(email);
      this.checkEmail(email);
      if (await this.getByEmail(email)) throw httpError(409, 'emailTaken', 'An account already uses this e-mail address');
    }
    if (!['user', 'admin'].includes(role)) throw httpError(400, 'invalidRole', 'Invalid role');
    if (maxUses !== null && (!Number.isSafeInteger(+maxUses) || +maxUses < 1)) {
      throw httpError(400, 'invalidMaxUses', 'Invalid number of uses');
    }
    const token = randomToken(24);
    const { rows } = await this.pool.query(`
      INSERT INTO invites (token_hash, email, role, note, max_uses, expires_at, created_by, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [sha256(token), email || null, role, String(note || '').slice(0, 500), maxUses === null ? null : +maxUses,
        expiresAt, createdBy, Date.now()]);
    return { token, invite: toInvite(rows[0]) };
  }

  async listInvites() {
    const { rows } = await this.pool.query(`
      SELECT i.*, u.email AS created_by_email FROM invites i LEFT JOIN users u ON u.id = i.created_by
      ORDER BY i.created_at DESC`);
    return rows.map(toInvite);
  }

  async revokeInvite(id) {
    if (!isId(id)) throw httpError(404, 'inviteNotFound', 'Invitation not found');
    const { rows } = await this.pool.query(
      'UPDATE invites SET revoked_at = $2 WHERE id = $1 AND revoked_at IS NULL RETURNING *', [id, Date.now()]);
    if (!rows.length) throw httpError(404, 'inviteNotFound', 'Invitation not found');
    return toInvite(rows[0]);
  }

  async deleteInvite(id) {
    const { rowCount } = isId(id) ? await this.pool.query('DELETE FROM invites WHERE id = $1', [id]) : { rowCount: 0 };
    if (!rowCount) throw httpError(404, 'inviteNotFound', 'Invitation not found');
  }

  async findInvite(token) {
    const { rows } = await this.pool.query(`
      SELECT * FROM invites WHERE token_hash = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > $2)
        AND (max_uses IS NULL OR uses < max_uses)`,
      [sha256(token || ''), Date.now()]);
    return rows[0] ? toInvite(rows[0]) : null;
  }

  /**
   * Uses an invitation and creates the account in one transaction: the use counter
   * only moves when the account exists, and two sign-ups cannot share the last use.
   */
  async createFromInvite(token, data) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(`
        UPDATE invites SET uses = uses + 1
        WHERE token_hash = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > $2)
          AND (max_uses IS NULL OR uses < max_uses)
        RETURNING *`,
        [sha256(token || ''), Date.now()]);
      if (!rows.length) throw httpError(400, 'invalidInvite', 'This invitation is not valid anymore');
      const invite = toInvite(rows[0]);
      if (invite.email && invite.email.toLowerCase() !== normalizeEmail(data.email).toLowerCase()) {
        throw httpError(400, 'inviteEmailMismatch', 'This invitation is for another e-mail address');
      }
      const user = await this.create({
        ...data,
        role: invite.role,
        invitedBy: invite.createdBy,
        // the invitation went to this address
        emailVerified: !!invite.email,
      }, client);
      await client.query('COMMIT');
      return { user, invite };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}

Accounts.httpError = httpError;
Accounts.sha256 = sha256;
Accounts.randomToken = randomToken;
Accounts.toUser = toUser;

module.exports = Accounts;
