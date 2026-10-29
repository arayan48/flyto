'use strict';
const fs = require('fs');
const os = require('os');
const config = require('../config');
const updateCheck = require('./updateCheck');
const { latest: schemaVersion } = require('./migrations');

// Node reports "Etc/Unknown" when TZ is empty or unknown to ICU, and PostgreSQL rejects it
function resolveTimezone(env = process.env.TZ) {
  const candidates = [Intl.DateTimeFormat().resolvedOptions().timeZone, env && env.replace(/^:/, '')];
  for (const tz of candidates) {
    if (!tz || tz === 'Etc/Unknown') continue;
    try {
      new Intl.DateTimeFormat('en', { timeZone: tz });
      return tz;
    } catch (e) {
      // not a zone ICU knows, try the next one
    }
  }
  return 'UTC';
}

const TIMEZONE = resolveTimezone();

function dayKeys(days, now = new Date()) {
  const keys = [];
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
  for (let i = days - 1; i >= 0; i--) keys.push(fmt.format(new Date(now.getTime() - i * 86400000)));
  return [...new Set(keys)];
}

async function series(pool, table, column, days, sizeColumn = null) {
  const since = Date.now() - (days + 1) * 86400000;
  const { rows } = await pool.query(`
    SELECT to_char(to_timestamp(${ column } / 1000.0) AT TIME ZONE $2, 'YYYY-MM-DD') AS day,
      COUNT(*)::int AS count ${ sizeColumn ? `, COALESCE(SUM(${ sizeColumn }), 0)::bigint AS bytes` : '' }
    FROM ${ table } WHERE ${ column } >= $1 GROUP BY day`, [since, TIMEZONE]);
  return new Map(rows.map(r => [r.day, { count: r.count, bytes: r.bytes === undefined ? undefined : +r.bytes }]));
}

async function disk(dir) {
  try {
    const s = await fs.promises.statfs(dir);
    return { total: s.blocks * s.bsize, free: s.bavail * s.bsize };
  } catch (e) {
    return null;
  }
}

module.exports = function createStats({ pool, db, accounts, sessions, audit, cache, settings }) {

  async function dashboard(days = 30) {
    const cached = await cache.get(`stats:dashboard:${ days }`);
    if (cached) return cached;

    const [userCounts, active, uploads, downloads, signups, totals, recent, diskInfo] = await Promise.all([
      pool.query(`
        SELECT COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'active')::int AS active,
          COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
          COUNT(*) FILTER (WHERE status = 'disabled')::int AS disabled,
          COUNT(*) FILTER (WHERE role = 'admin')::int AS admins,
          COUNT(*) FILTER (WHERE totp_enabled)::int AS with2fa,
          COUNT(*) FILTER (WHERE locked_until > $1)::int AS locked,
          COUNT(*) FILTER (WHERE created_at > $2)::int AS new30d,
          COUNT(*) FILTER (WHERE last_login_at > $2)::int AS seen30d
        FROM users`, [Date.now(), Date.now() - 30 * 86400000]).then(r => r.rows[0]),
      sessions.countActive(),
      series(pool, 'uploads', 'uploaded_at', days, 'size'),
      series(pool, 'downloads', 'downloaded_at', days, 'size'),
      series(pool, 'users', 'created_at', days),
      pool.query(`
        SELECT (SELECT COUNT(*) FROM uploads)::int AS uploads,
          (SELECT COALESCE(SUM(size), 0) FROM uploads)::bigint AS upload_bytes,
          (SELECT COUNT(*) FROM downloads)::int AS downloads,
          (SELECT COALESCE(SUM(size), 0) FROM downloads)::bigint AS download_bytes`).then(r => r.rows[0]),
      audit.list({ perPage: 8 }),
      disk(config.uploadDir),
    ]);

    const keys = dayKeys(days);
    const summaries = db.summaries();
    const byOwner = db.usageByOwner();
    const ownerIds = [...byOwner.keys()].filter(id => id !== null);
    const owners = await accounts.getMany(ownerIds);
    const topUsers = ownerIds
      .map(id => ({ id, ...byOwner.get(id), email: owners.get(id) ? owners.get(id).email : null,
        name: owners.get(id) ? owners.get(id).name : null }))
      .sort((a, b) => b.storage - a.storage)
      .slice(0, 5);
    const soon = Date.now() + 86400000;

    const result = {
      generatedAt: Date.now(),
      timezone: TIMEZONE,
      users: { ...userCounts, online: active.users, sessions: active.sessions },
      transfers: {
        active: summaries.length,
        files: summaries.reduce((s, t) => s + t.files, 0),
        storage: summaries.reduce((s, t) => s + t.size, 0),
        partial: summaries.filter(t => t.partial).length,
        suspended: summaries.filter(t => t.suspendedAt).length,
        anonymous: summaries.filter(t => t.ownerId === null).length,
        protected: summaries.filter(t => t.password).length,
        oneTime: summaries.filter(t => t.oneTime).length,
        expiringSoon: summaries.filter(t => t.expiresAt && t.expiresAt < soon).length,
      },
      totals: {
        uploads: totals.uploads,
        uploadBytes: +totals.upload_bytes,
        downloads: totals.downloads,
        downloadBytes: +totals.download_bytes,
      },
      disk: diskInfo,
      activity: {
        days: keys,
        uploads: keys.map(k => uploads.get(k) || { count: 0, bytes: 0 }),
        downloads: keys.map(k => downloads.get(k) || { count: 0, bytes: 0 }),
        signups: keys.map(k => (signups.get(k) || { count: 0 }).count),
      },
      topUsers,
      recent: recent.items,
      maintenanceMode: settings.get('maintenanceMode'),
      registrationMode: settings.get('registrationMode'),
    };
    await cache.set(`stats:dashboard:${ days }`, result, 30);
    return result;
  }

  async function system() {
    const [dbInfo, tables, cacheInfo, diskInfo] = await Promise.all([
      pool.query(`SELECT version() AS version, pg_database_size(current_database())::bigint AS size,
        current_database() AS name`).then(r => r.rows[0]),
      pool.query(`
        SELECT relname AS name, n_live_tup::bigint AS rows, pg_total_relation_size(relid)::bigint AS size
        FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC`).then(r => r.rows),
      cache.info(),
      disk(config.uploadDir),
    ]);
    const mem = process.memoryUsage();
    return {
      version: require('../package.json').version,
      update: { ...updateCheck.state, enabled: updateCheck.isEnabled(config), repo: config.updateCheckRepo },
      node: process.version,
      platform: `${ os.type() } ${ os.release() } (${ process.arch })`,
      hostname: os.hostname(),
      timezone: TIMEZONE,
      uptime: Math.round(process.uptime()),
      startedAt: Date.now() - Math.round(process.uptime() * 1000),
      memory: { rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal, system: os.totalmem(), free: os.freemem() },
      load: os.loadavg(),
      cpus: os.cpus().length,
      database: {
        version: dbInfo.version.split(' on ')[0],
        name: dbInfo.name,
        size: +dbInfo.size,
        schemaVersion,
        tables: tables.map(t => ({ name: t.name, rows: +t.rows, size: +t.size })),
      },
      cache: cacheInfo,
      disk: diskInfo,
      config: {
        uploadDir: config.uploadDir,
        baseUrl: config.baseUrl,
        port: config.port,
        trustProxy: config.trustProxy || false,
        forceHttps: config.forceHttps || false,
        maxAge: config.maxAge,
        plugins: config.plugins,
        languages: Object.keys(config.languages),
        defaultLanguage: config.defaultLanguage,
        smtpFromEnv: !!config.smtpUrl,
        redis: !!config.redisUrl,
        webhooks: { uploaded: !!config.fileUploadedWebhook, downloaded: !!config.fileDownloadedWebhook },
      },
    };
  }

  return { dashboard, system, disk };
};

module.exports.dayKeys = dayKeys;
module.exports.resolveTimezone = resolveTimezone;
