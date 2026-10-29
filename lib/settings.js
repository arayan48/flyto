'use strict';
const debug = require('debug')('flyto:settings');
const config = require('../config');

const GiB = Math.pow(2, 30);

const str = (def, max = 2000) => ({ type: 'string', default: def, max });
const bool = def => ({ type: 'boolean', default: def });
const int = (def, min = 0, max = Number.MAX_SAFE_INTEGER) => ({ type: 'integer', default: def, min, max });
const oneOf = (def, values) => ({ type: 'enum', default: def, values });

/**
 * Settings an admin can change at runtime. The environment and config.js only
 * provide the defaults: a value saved from /admin wins.
 */
const schema = {
  // general
  siteName: str('Flyto', 80),
  siteDescription: str('', 300),
  publicUrl: str(config.publicUrl || '', 300),
  contactEmail: str('', 200),
  termsUrl: str('', 500),
  privacyUrl: str('', 500),
  legalPublisher: str('', 200),
  legalHost: str('', 1000),
  announcementText: str('', 1000),
  announcementLevel: oneOf('info', ['info', 'success', 'warning', 'danger']),
  maintenanceMode: bool(false),
  maintenanceMessage: str('', 1000),

  // accounts
  registrationMode: oneOf('invite', ['open', 'invite', 'closed']),
  requireApproval: bool(false),
  requireEmailVerification: bool(false),
  allowedEmailDomains: str('', 2000),
  passwordMinLength: int(10, 8, 128),
  sessionDays: int(30, 1, 365),
  loginMaxAttempts: int(5, 1, 100),
  lockoutMinutes: int(15, 1, 24 * 60),
  require2faForAdmins: bool(false),

  // uploads
  anonymousUpload: bool(false),
  maxTransferSize: int(config.maxBucketSize || 10 * GiB),
  maxFileSize: int(config.maxFileSize || 0),
  userStorageQuota: int(0),
  maxActiveTransfers: int(0, 0, 100000),
  maxFilesPerTransfer: int(0, 0, 100000),
  retentions: { type: 'list', default: Object.keys(config.retentions), values: Object.keys(config.retentions) },
  defaultRetention: oneOf(String(config.defaultRetention), Object.keys(config.retentions)),
  requireTransferPassword: bool(!!config.requireBucketPassword),
  blockedExtensions: str('', 2000),

  // downloads
  disableQrCode: bool(!!config.disableQrCode),
  maxPreviewSize: int(config.maxPreviewSize),
  mailTemplate: str(config.mailTemplate),
  logDownloadIps: bool(true),
  anonymizeIps: bool(true),
  downloadPasswordAttempts: int(20, 1, 1000),

  // email, SMTP from the environment (FLYTO_SMTP_URL) is used when smtpHost is empty
  smtpHost: str('', 300),
  smtpPort: int(587, 1, 65535),
  smtpSecure: bool(false),
  smtpUser: str('', 300),
  smtpPass: { type: 'secret', default: '', max: 300 },
  smtpFrom: str(config.mailFrom || '', 300),
  notifyAdminsOnSignup: bool(true),

  // housekeeping
  auditRetentionDays: int(365, 7, 3650),
  downloadLogRetentionDays: int(365, 7, 3650),
};

// readable without an account, by the upload and download pages
const PUBLIC = [
  'siteName', 'siteDescription', 'contactEmail', 'termsUrl', 'privacyUrl',
  'announcementText', 'announcementLevel', 'maintenanceMode', 'maintenanceMessage',
  'registrationMode', 'passwordMinLength', 'anonymousUpload', 'disableQrCode', 'require2faForAdmins',
];

function validate(key, value) {
  const def = schema[key];
  if (!def) throw Object.assign(new Error(`Unknown setting ${ key }`), { status: 400, code: 'unknownSetting' });
  const fail = msg => {
    throw Object.assign(new Error(`${ key }: ${ msg }`), { status: 400, code: 'invalidSetting', key });
  };
  switch (def.type) {
    case 'string':
    case 'secret':
      if (typeof value !== 'string') fail('must be a string');
      value = value.trim();
      if (value.length > def.max) fail(`longer than ${ def.max } characters`);
      if (key.endsWith('Url') && value && !/^https?:\/\/[^\s]+$/i.test(value)) fail('must be an http(s) URL');
      return value;
    case 'boolean':
      if (typeof value !== 'boolean') fail('must be true or false');
      return value;
    case 'integer':
      if (typeof value === 'string' && /^\d+$/.test(value)) value = +value;
      if (!Number.isSafeInteger(value)) fail('must be an integer');
      if (value < def.min || value > def.max) fail(`must be between ${ def.min } and ${ def.max }`);
      return value;
    case 'enum':
      if (!def.values.includes(value)) fail(`must be one of ${ def.values.join(', ') }`);
      return value;
    case 'list':
      if (!Array.isArray(value) || !value.length) fail('must be a non-empty list');
      if (value.some(v => !def.values.includes(v))) fail(`values must be in ${ def.values.join(', ') }`);
      // keep the order of the config
      return def.values.filter(v => value.includes(v));
  }
  return value;
}

class Settings {

  constructor(pool) {
    this.pool = pool;
    this.values = {};
    for (const [key, def] of Object.entries(schema)) this.values[key] = def.default;
  }

  async load() {
    const { rows } = await this.pool.query('SELECT key, value FROM settings');
    for (const { key, value } of rows) {
      if (!schema[key]) continue;
      try {
        this.values[key] = validate(key, value);
      } catch (e) {
        // a value saved by an older version that no longer validates falls back to the default
        console.error(`Ignoring stored setting ${ key }: ${ e.message }`);
      }
    }
    this._fixup();
    debug(`Loaded ${ rows.length } stored settings`);
  }

  _fixup() {
    if (!this.values.retentions.includes(this.values.defaultRetention)) {
      this.values.defaultRetention = this.values.retentions[0];
    }
  }

  get(key) {
    return this.values[key];
  }

  all({ secrets = false } = {}) {
    const result = { ...this.values };
    if (!secrets) {
      for (const [key, def] of Object.entries(schema)) {
        if (def.type === 'secret') result[key] = result[key] ? '********' : '';
      }
    }
    return result;
  }

  public() {
    const result = {};
    for (const key of PUBLIC) result[key] = this.values[key];
    return result;
  }

  /**
   * @returns {Promise<Object>} the keys whose value changed, with old and new value
   */
  async update(patch, actorId = null) {
    const next = {};
    for (const [key, raw] of Object.entries(patch)) {
      // the masked secret comes back unchanged from the settings form
      if (schema[key] && schema[key].type === 'secret' && raw === '********') continue;
      next[key] = validate(key, raw);
    }
    const retentions = next.retentions || this.values.retentions;
    const defaultRetention = next.defaultRetention || this.values.defaultRetention;
    if (!retentions.includes(defaultRetention)) {
      throw Object.assign(new Error('defaultRetention must be one of the enabled retentions'),
        { status: 400, code: 'invalidSetting', key: 'defaultRetention' });
    }

    const changed = {};
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const [key, value] of Object.entries(next)) {
        if (JSON.stringify(value) === JSON.stringify(this.values[key])) continue;
        await client.query(`
          INSERT INTO settings (key, value, updated_at, updated_by) VALUES ($1, $2, $3, $4)
          ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at,
            updated_by = excluded.updated_by`,
          [key, JSON.stringify(value), Date.now(), actorId]);
        changed[key] = schema[key].type === 'secret' ? { from: '***', to: '***' } : { from: this.values[key], to: value };
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    for (const key of Object.keys(changed)) this.values[key] = next[key];
    this._fixup();
    return changed;
  }

  async reset(key) {
    if (!schema[key]) throw Object.assign(new Error(`Unknown setting ${ key }`), { status: 400, code: 'unknownSetting' });
    await this.pool.query('DELETE FROM settings WHERE key = $1', [key]);
    const from = this.values[key];
    this.values[key] = schema[key].default;
    this._fixup();
    return { from, to: this.values[key] };
  }

  emailDomainAllowed(email) {
    const list = this.values.allowedEmailDomains.split(/[\s,;]+/).map(d => d.trim().toLowerCase()).filter(Boolean);
    if (!list.length) return true;
    const domain = String(email).split('@').pop().toLowerCase();
    return list.some(d => domain === d.replace(/^@/, '') || domain.endsWith('.' + d.replace(/^@/, '')));
  }

  blockedExtension(name) {
    const list = this.values.blockedExtensions.split(/[\s,;]+/)
      .map(e => e.trim().toLowerCase().replace(/^\./, '')).filter(Boolean);
    if (!list.length) return null;
    const lower = String(name).toLowerCase();
    return list.find(ext => lower.endsWith('.' + ext)) || null;
  }
}

Settings.schema = schema;
Settings.validate = validate;

module.exports = Settings;
