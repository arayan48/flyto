const pug = require('pug');
const express = require('express');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const { createHash, randomUUID } = require('node:crypto');
const { createGzip } = require('zlib');
const tar = require('tar-stream');
const httpErrors = require('http-errors');
const { finished, pipeline } = require('node:stream/promises');
const config = require('../config');
const eventBus = require('./eventBus');
const tusboy = require('./tusboy');
const Store = require('./store');
const MetadataDb = require('./metadataDb');
const Db = require('./db');
const tusMeta = require('./tusboy/tus-metadata');
const utils = require('./utils');
const debug = require('debug')('flyto:main');
const { hashPassword, verifyPassword } = require('./passwordHash');
const Cache = require('./cache');
const Settings = require('./settings');
const Accounts = require('./accounts');
const Sessions = require('./sessions');
const Audit = require('./audit');
const Mailer = require('./mailer');
const Bootstrap = require('./bootstrap');
const createAuth = require('./auth');
const { uploaderToken } = require('./auth');
const createStats = require('./stats');
const { limitsFor, checkUpload } = require('./quotas');
const accountApi = require('./api/account');
const adminApi = require('./api/admin');

function toAsciiFallbackFilename(name, fallback = 'file') {
  const safe = utils.toSafeBasename(name, fallback);
  const normalized = safe.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const ascii = normalized.replace(/[^\x20-\x7E]+/g, '').trim();
  const cleaned = ascii.replace(/["\\]/g, '_');
  if (cleaned) return cleaned;
  const fallbackSafe = utils.toSafeBasename(fallback, 'file');
  return fallbackSafe.replace(/[^\x20-\x7E]+/g, '').trim() || 'file';
}

function contentDispositionUtf8Filename(name, fallback = 'file') {
  const safe = utils.toSafeBasename(name, fallback);
  const asciiFallback = toAsciiFallbackFilename(safe, fallback);
  const encoded = encodeURIComponent(safe)
    .replace(/['()]/g, c => `%${ c.charCodeAt(0).toString(16).toUpperCase() }`)
    .replace(/\*/g, '%2A');
  return `attachment; filename="${ asciiFallback }"; filename*=UTF-8''${ encoded }`;
}

function md5Hex(input) {
  return createHash('md5').update(input).digest('hex');
}

function sha256Hex(input) {
  return createHash('sha256').update(input).digest('hex');
}

// decoded like the req.params of tusboy
function decodedUploadPathSegment(req) {
  const raw = req.path.startsWith('/') ? req.path.slice(1) : req.path;
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

const version = require('../package.json').version;
const pugVars = {
  baseUrl: config.baseUrl,
  version,
  repo: config.updateCheckRepo,
};

const errorPage = pug.compileFile(path.join(__dirname, '../public/pug/error.pug'), { pretty: true });
const adminPage = pug.compileFile(path.join(__dirname, '../public/pug/admin.pug'), { pretty: true });
const uploadPage = pug.compileFile(path.join(__dirname, '../public/pug/upload.pug'), { pretty: true });
const downloadPage = pug.compileFile(path.join(__dirname, '../public/pug/download.pug'), { pretty: true });
const accountPage = pug.compileFile(path.join(__dirname, '../public/pug/account.pug'), { pretty: true });

if (!config.dbUrl) {
  throw new Error('FLYTO_DB_URL is not set, e.g. postgres://flyto:secret@database:5432/flyto');
}
const metadataDb = new MetadataDb(config.dbUrl);
const store = new Store(config.uploadDir, metadataDb);
const pool = metadataDb.pool;
const db = new Db(config.uploadDir, store);

const cache = new Cache(config.redisUrl);
const settings = new Settings(pool);
const accounts = new Accounts(pool, settings);
const sessions = new Sessions(pool, cache, settings);
const audit = new Audit(pool);
const mailer = new Mailer(settings);
const bootstrap = new Bootstrap();
const auth = createAuth({ sessions, settings, cache });
const stats = createStats({ pool, db, accounts, sessions, audit, cache, settings });

async function downloadCounts() {
  const cached = await cache.get('downloadCounts');
  if (cached) return cached;
  const counts = await db.downloadCounts();
  await cache.set('downloadCounts', counts, 15);
  return counts;
}

async function purgeDownloadLog() {
  const { rowCount } = await pool.query('DELETE FROM downloads WHERE downloaded_at < $1',
    [Date.now() - settings.get('downloadLogRetentionDays') * 86400000]);
  return rowCount;
}

// configured address, safe to put into mails sent on behalf of anonymous requests
function trustedUrl() {
  const url = settings.get('publicUrl') || config.publicUrl;
  return url ? url.replace(/\/?$/, '/') : null;
}

function publicUrl(req) {
  return trustedUrl() || `${ req.protocol }://${ req.get('host') }${ config.baseUrl }`;
}

const ctx = {
  version, config, pool, store, db, cache, settings, accounts, sessions, audit, mailer, bootstrap, auth, stats,
  publicUrl, trustedUrl, downloadCounts, purgeDownloadLog,
};

const ready = (async () => {
  await metadataDb.ready;
  await settings.load();
  await db.init();
  await bootstrap.run(accounts, audit);
  if (/^https?:\/\/(localhost|127\.|\[::1\])/i.test(trustedUrl() || '')) {
    console.warn(`The public address ${ trustedUrl() } only works on this machine: e-mails and share links will be broken. ` +
      'Set FLYTO_PUBLIC_URL (or /admin > Settings) to the address people use, or leave it empty on a local network.');
  }
})();
ready.catch(e => {
  console.error(e.code === '28P01' ? e.message : e);
  process.exit(1);
});

// daily housekeeping of logs and expired sessions
setInterval(() => {
  Promise.all([
    sessions.purgeExpired(),
    accounts.purgeTokens(),
    audit.purge(settings.get('auditRetentionDays')),
    purgeDownloadLog(),
  ]).catch(e => console.error(`Housekeeping failed: ${ e.message }`));
}, 6 * 3600 * 1000).unref();

// unfinished uploads are listed in /admin but never served
function completedFiles(sid) {
  const now = Date.now();
  return (db.get(sid) || []).filter(file => !file.isPartial && !Db.isExpired(file, now));
}

function suspended(sid) {
  const t = db.transfer(sid);
  return !!(t && t.suspendedAt);
}

// only the owner writes into a transfer: its account, or for an anonymous one the browser that started it
function mayWrite(transfer, ownerId, uploader) {
  if (transfer.ownerId !== ownerId) return false;
  return ownerId !== null || (!!transfer.uploader && utils.safeEqual(transfer.uploader, uploader));
}

// the files of a transfer share one hash of their password, the download page checks it once
const transferPasswords = new Map();
function transferPasswordHash(sid, password) {
  const digest = sha256Hex(password);
  const known = transferPasswords.get(sid);
  if (known && known.digest === digest) return known.hash;
  const entry = { digest, hash: hashPassword(password) };
  transferPasswords.set(sid, entry);
  const forget = () => {
    if (transferPasswords.get(sid) === entry) transferPasswords.delete(sid);
  };
  entry.hash.catch(forget);
  setTimeout(forget, 3600 * 1000).unref();
  return entry.hash;
}

function recordDownload(metadata, { ip, userAgent } = {}) {
  const t = db.transfer(metadata.sid);
  const logIp = settings.get('logDownloadIps') ? (settings.get('anonymizeIps') ? utils.anonymizeIp(ip) : ip) : null;
  db.recordDownload(metadata.sid, metadata.key, metadata.name, {
    ip: logIp,
    userAgent: settings.get('logDownloadIps') && userAgent ? String(userAgent).slice(0, 300) : null,
    size: +metadata.uploadLength || null,
    ownerId: t ? t.ownerId : null,
  }).catch(e => console.error(e));
  cache.del('downloadCounts');
}

// at most one mail per transfer and hour, a busy link must not flood its owner
async function notifyOwner(sid, names) {
  const t = db.transfer(sid);
  if (!t || t.ownerId === null || !mailer.enabled) return;
  if (await cache.hit(`notify:${ sid }`, 3600) > 1) return;
  const owner = await accounts.get(t.ownerId);
  if (!owner || !owner.notifyDownloads || owner.status !== 'active') return;
  const lang = (owner.locale && config.languages[owner.locale]) || config.languages[config.defaultLanguage];
  const base = trustedUrl();
  await mailer.send(owner.email, lang, 'downloaded', {
    name: owner.name || owner.email,
    files: names.join(', '),
    url: base ? `${ base }account#transfers` : undefined,
  }).catch(e => console.error(`Could not notify ${ owner.email }: ${ e.message }`));
}

eventBus.on('fileDownloaded', ({ metadata, ip, userAgent }) => {
  recordDownload(metadata, { ip, userAgent });
  notifyOwner(metadata.sid, [metadata.name]).catch(e => console.error(e));
});
eventBus.on('archiveDownloaded', ({ sid, bucket, ip, userAgent }) => {
  bucket.forEach(info => recordDownload(info.metadata, { ip, userAgent }));
  notifyOwner(sid, bucket.map(info => info.metadata.name)).catch(e => console.error(e));
});
eventBus.on('fileUploaded', upload => {
  const t = db.transfer(upload.metadata.sid);
  metadataDb.logUpload(upload.metadata.sid, upload.metadata.key, upload.metadata.name, upload.size,
    t ? t.ownerId : null).catch(e => console.error(e));
});

const app = express();

app.disable('x-powered-by');
app.use(compression());

if (config.accessLog) {
  // reset, verification and invitation links open an account: keep them out of the logs
  morgan.token('url', req => (req.originalUrl || req.url)
    .replace(/\/(reset|verify|invite)\/[^/?#]+/g, '/$1/***')
    .replace(/([?&]invite=)[^&#]+/g, '$1***'));
  app.use(morgan(config.accessLog));
}

if (config.trustProxy) {
  // from the environment, "true" and hop counts arrive as strings
  const trustProxy = /^\d+$/.test(config.trustProxy) ? +config.trustProxy : config.trustProxy;
  app.set('trust proxy', trustProxy === 'true' ? true : trustProxy);
}

if (config.forceHttps) {
  if (!config.trustProxy) app.enable('trust proxy');
  app.use(function(req, res, next) {
    if (req.secure) return next();
    const target = [true, 'true'].includes(config.forceHttps) ? 'https://' + req.headers.host : config.forceHttps;
    res.redirect(target + req.url);
  });
}

app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'same-origin');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=15552000');
  next();
});

app.use(`${ config.baseUrl }app`, express.static(path.join(__dirname, '../public/app')));
app.use(`${ config.baseUrl }assets/fonts/dm-sans`, express.static(
  path.dirname(require.resolve('@fontsource-variable/dm-sans/package.json')), { maxAge: '30d', immutable: true }));
app.use(`${ config.baseUrl }assets`, express.static(path.join(__dirname, '../public/assets')));

app.use((req, res, next) => {
  const lang = req.acceptsLanguages(...Object.keys(config.languages)) || config.defaultLanguage;
  req.translations = config.languages[lang];
  next();
});

app.get(`${ config.baseUrl }robots.txt`, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/robots.txt'));
});

app.get(`${ config.baseUrl }site.webmanifest`, (req, res) => {
  res.type('application/manifest+json').json({
    name: settings.get('siteName'),
    short_name: settings.get('siteName'),
    start_url: config.uploadAppPath,
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#2F6BFF',
    icons: [
      { src: 'assets/brand/app-icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'assets/brand/app-icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  });
});

app.get(`${ config.baseUrl }healthz`, async (req, res) => {
  try {
    await ready;
    await pool.query('SELECT 1');
    res.set('Cache-Control', 'no-store').json({ status: 'ok', cache: cache.backend, cacheConnected: cache.connected });
  } catch (e) {
    res.status(503).json({ status: 'error', message: e.message });
  }
});

app.use(auth.loadSession);

function pageVars(req, extra = {}) {
  return {
    ...pugVars,
    uploadAppPath: config.uploadAppPath,
    lang: req.translations,
    user: req.user ? { name: req.user.name, email: req.user.email, role: req.user.role } : null,
    csrf: req.session ? req.session.csrf : '',
    site: settings.public(),
    origin: publicUrl(req),
    ...extra,
  };
}

function renderError(req, res, status, error) {
  res.status(status).send(errorPage(pageVars(req, { error })));
}

config.plugins.forEach(pluginName => {
  require('../plugins/' + pluginName)(eventBus, app, config, db);
});

const api = express.Router();
api.use(express.json({ limit: '200kb' }));
api.use(express.urlencoded({ extended: false, limit: '20kb' }));
api.use(accountApi(ctx));
api.use('/admin', adminApi(ctx));
api.use((req, res) => res.status(404).json({ error: 'notFound', message: 'Not found' }));
// eslint-disable-next-line no-unused-vars
api.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalidJson', message: 'Invalid JSON' });
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  const { code, message, status: _s, statusCode: _sc, expose: _e, ...extra } = err;
  res.status(status).json({
    error: code && typeof code === 'string' && !/^[A-Z0-9_]+$/.test(code) ? code : (status >= 500 ? 'serverError' : 'error'),
    message: status >= 500 ? 'Internal error' : message,
    ...(status < 500 ? extra : {}),
  });
});
app.use(`${ config.baseUrl }api`, api);

app.get(config.uploadAppPath, (req, res) => {
  // the page uploads its files in parallel: the cookie must exist before the first one
  if (!req.user && settings.get('anonymousUpload')) uploaderToken(req, res);
  res.send(uploadPage(pageVars(req)));
});

app.get(`${ config.baseUrl }lang.json`, (req, res) => {
  res.json(req.translations);
});

app.get(`${ config.baseUrl }config.json`, (req, res) => {
  const limits = limitsFor(req.user, settings);
  const enabled = settings.get('retentions');
  const frontendConfig = {
    retentions: Object.fromEntries(enabled.map(k => [k, config.retentions[k]])),
    defaultRetention: settings.get('defaultRetention'),
    mailTemplate: settings.get('mailTemplate'),
    requireBucketPassword: settings.get('requireTransferPassword'),
    maxFileSize: limits.file,
    maxBucketSize: limits.transfer,
    maxFiles: limits.files,
    disableQrCode: settings.get('disableQrCode'),
    blockedExtensions: settings.get('blockedExtensions'),
    loginRequired: !req.user && !settings.get('anonymousUpload'),
    maintenance: settings.get('maintenanceMode') && !(req.user && req.user.role === 'admin'),
    maintenanceMessage: settings.get('maintenanceMessage'),
    registrationMode: settings.get('registrationMode'),
    user: req.user ? { name: req.user.name, email: req.user.email, role: req.user.role } : null,
    csrf: req.session ? req.session.csrf : null,
    usage: req.user ? db.usage(req.user.id) : null,
    limits,
  };

  res.set('Cache-Control', 'no-store');
  res.json(frontendConfig);
});

// Account pages, before /:sid which would take them for bucket ids
const accountPages = ['login', 'register', 'forgot', 'setup'];
const RESERVED_SIDS = new Set([...accountPages, 'reset', 'verify', 'account', 'admin', 'api', 'app', 'assets',
  'files', 'healthz', 'robots.txt', 'site.webmanifest', 'lang.json', 'config.json']);
for (const name of accountPages) {
  app.get(`${ config.baseUrl }${ name }`, (req, res) => {
    if (req.user && name !== 'setup') return res.redirect(config.baseUrl + 'account');
    res.send(accountPage(pageVars(req, { page: name })));
  });
}
app.get(`${ config.baseUrl }reset/:token`, (req, res) => {
  res.send(accountPage(pageVars(req, { page: 'reset' })));
});
app.get(`${ config.baseUrl }verify/:token`, (req, res) => {
  res.send(accountPage(pageVars(req, { page: 'verify' })));
});
app.get(`${ config.baseUrl }account`, (req, res) => {
  if (!req.user) return res.redirect(`${ config.baseUrl }login?next=account`);
  res.send(accountPage(pageVars(req, { page: 'account' })));
});

app.get(`${ config.baseUrl }admin`, (req, res) => {
  if (!req.user) return res.redirect(`${ config.baseUrl }login?next=admin`);
  if (req.user.role !== 'admin') return renderError(req, res, 403, req.translations.errors.forbidden);
  // every admin call would be refused: send them to the page that turns 2FA on
  if (settings.get('require2faForAdmins') && !req.user.totpEnabled) return res.redirect(`${ config.baseUrl }account#security`);
  res.send(adminPage(pageVars(req)));
});

// the download page, and with .json the files it lists
app.get(`${ config.baseUrl }:sid`, async (req, res, next) => {
  if (!req.path.endsWith('.json')) {
    if (!db.get(req.params.sid)) return next();
    if (suspended(req.params.sid)) return renderError(req, res, 451, req.translations.transferSuspended);
    return res.send(downloadPage(pageVars(req)));
  }

  const sid = req.params.sid.slice(0, -'.json'.length);
  const bucket = completedFiles(sid);
  if (!bucket.length) return res.status(404).end();
  if (suspended(sid)) return res.status(451).json({ error: 'suspended', message: req.translations.transferSuspended });
  res.header('Cache-control', 'private, max-age=0, no-cache, no-store, must-revalidate');

  const hashes = new Set(bucket.map(item => item.metadata.password).filter(Boolean));
  if (hashes.size) {
    const pass = utils.decodePasswordHeader(req.get('x-download-pass'));
    // the page asks without a password first: nothing to check, and no guess to count
    if (!pass) return res.status(401).send('Unauthorized');
    const attemptsKey = `rl:download-pass:${ req.ip }`;
    if ((await cache.get(attemptsKey) || 0) >= settings.get('downloadPasswordAttempts')) {
      return res.status(429).send('Too many attempts');
    }
    for (const hash of hashes) {
      if (!await verifyPassword(hash, pass)) {
        await cache.hit(attemptsKey, 600);
        setTimeout(() => res.status(401).send('Unauthorized'), 500);
        return;
      }
    }
  }

  res.json({
    items: bucket.map(({ metadata: { password, ...metadata }, ...item }) => ({
      ...item,
      metadata,
      url: `${ config.baseUrl }files/${ sid }++${ item.key }`,
    })),
    archiveToken: sha256Hex(bucket.map(item => item.key).join()).slice(0, 32),
    config: {
      maxPreviewSize: settings.get('maxPreviewSize'),
    },
  });
});


// a file, or the archive of a whole transfer
app.get(`${ config.baseUrl }files/:fid`, async (req, res, next) => {
  // a HEAD with Tus-Resumable is the upload page resuming, tusboy answers it
  if (req.method === 'HEAD' && req.get('Tus-Resumable')) return next();

  // archives compress themselves, and single files keep Content-Length and Range for resumed downloads
  res.set('Cache-Control', 'no-transform');

  const sid = req.params.fid.split('++')[0];
  if (suspended(sid)) return renderError(req, res, 451, req.translations.transferSuspended);
  const client = { ip: req.ip, userAgent: req.get('user-agent') };

  const archive = /^(.+?)\+\+([0-9a-f]{32})\.(tar\.gz|zip)$/.exec(req.params.fid);
  if (archive) {
    const format = archive[3];
    const files = completedFiles(sid);

    if (!files.length) return renderError(req, res, 404, req.translations.errors.transferNotFound);

    const keyList = files.map(f => f.key).join();
    if (archive[2] !== md5Hex(keyList) && archive[2] !== sha256Hex(keyList).slice(0, 32)) {
      return renderError(req, res, 404, req.translations.errors.invalidLink);
    }
    debug(`Download Bucket ${ sid }`);

    const isHead = req.method === 'HEAD';

    // atomically claim all one-time files; HEAD neither claims nor consumes
    const claimed = [];
    const release = () => claimed.splice(0).forEach(info => db.release(sid, info.key));
    for (const info of files.filter(info => info.metadata.retention === 'one-time')) {
      if (isHead ? db.isClaimed(sid, info.key) : !db.claim(sid, info.key)) {
        release();
        return renderError(req, res, 404, req.translations.errors.fileNotFound);
      }
      if (!isHead) claimed.push(info);
    }

    const filename = `${ sid }.${ format }`;
    res.set('Content-Disposition', contentDispositionUtf8Filename(filename));
    res.type(format === 'zip' ? 'application/zip' : 'application/gzip');

    // release the claims and the open files on aborted downloads
    const openStreams = new Set();
    res.on('close', () => {
      if (res.writableFinished) return;
      release();
      openStreams.forEach(stream => stream.destroy());
    });

    // remove one-time files after download
    res.on('finish', async () => {
      if (isHead) return release();
      let removeFailed = false;
      try {
        await Promise.all(files.map(info => info.metadata.retention === 'one-time'
          ? db.remove(info.metadata.sid, info.metadata.key)
          : db.updateLastDownload(info.metadata.sid, info.metadata.key)
        ));

        eventBus.emit('archiveDownloaded', { sid, file: filename, bucket: files, ...client });
      }
      catch (e) {
        console.error(e);
        removeFailed = true;
      }
      // keep the claims if removal failed to prevent further downloads
      if (!removeFailed) release();
    });

    if (isHead) return res.end();

    const usedNames = new Map();
    const uniqueName = (rawName, fallback) => {
      const base = utils.toSafeBasename(rawName, fallback);
      const prev = usedNames.get(base) || 0;
      usedNames.set(base, prev + 1);
      if (prev === 0) return base;
      const ext = path.extname(base);
      const stem = ext ? base.slice(0, -ext.length) : base;
      return `${ stem } (${ prev + 1 })${ ext }`;
    };
    const readFile = info => {
      const stream = fs.createReadStream(store.getFilename(info.metadata.sid + '++' + info.key));
      openStreams.add(stream);
      stream.on('close', () => openStreams.delete(stream));
      return stream;
    };

    try {
      if (format === 'zip') {
        const { ZipArchive } = await import('archiver');
        const zip = new ZipArchive();
        zip.on('error', err => {
          console.error(err);
          res.destroy();
        });
        zip.pipe(res);
        for (const info of files) {
          const stream = readFile(info);
          zip.append(stream, { name: uniqueName(info.metadata.name, info.key) });
          await finished(stream);
        }
        await zip.finalize();
      } else {
        const pack = tar.pack();
        pipeline(pack, createGzip(), res).catch(e => debug(`tar.gz stream ended: ${ e.message }`));
        for (const info of files) {
          const entry = pack.entry({ name: uniqueName(info.metadata.name, info.key), size: info.size });
          await pipeline(readFile(info), entry);
        }
        pack.finalize();
      }
    } catch (e) {
      if (e.code !== 'ERR_STREAM_PREMATURE_CLOSE') console.error(e);
      res.destroy();
    }
    return;
  }

  debug(`Download ${ req.params.fid }`);
  if (!utils.isSafeTusUploadId(req.params.fid)) {
    return renderError(req, res, 404, req.translations.errors.invalidLink);
  }
  let info;
  try {
    info = await store.info(req.params.fid);
  } catch (e) {
    if (e instanceof httpErrors.NotFound) return renderError(req, res, 404, req.translations.errors.fileNotFound);
    return next(e);
  }
  const isHead = req.method === 'HEAD';
  const oneTime = info.metadata.retention === 'one-time';
  // the download page shows images and texts: not a download, and never of a one-time file
  const preview = 'preview' in req.query;
  if (info.isPartial || Db.isExpired(info) || (preview && oneTime)) return renderError(req, res, 404, req.translations.errors.fileNotFound);

  // atomically claim one-time files; HEAD neither claims nor consumes
  let claimed = false;
  if (oneTime) {
    claimed = !isHead && db.claim(info.metadata.sid, info.metadata.key);
    if (isHead ? db.isClaimed(info.metadata.sid, info.metadata.key) : !claimed) {
      return renderError(req, res, 404, req.translations.errors.fileNotFound);
    }
  }
  const release = () => {
    if (!claimed) return;
    claimed = false;
    db.release(info.metadata.sid, info.metadata.key);
  };

  res.set('Content-Disposition', contentDispositionUtf8Filename(info.metadata.name, info.key));
  // a one-time file is sent whole: a partial request would consume it after the first chunk
  res.sendFile(store.getFilename(req.params.fid), { acceptRanges: !oneTime }, err => {
    if (!err) return;
    release();
    if (!res.headersSent) next(err);
  });

  // release the claim on aborted downloads
  res.on('close', () => {
    if (!res.writableFinished) release();
  });

  // remove one-time files after download
  res.on('finish', async () => {
    // the following chunks of a resumed or streamed download are not new downloads
    const firstChunk = res.statusCode === 200 || (res.statusCode === 206 && /^bytes=0-/.test(req.get('range') || ''));
    if (isHead || preview || !firstChunk) return release();
    let removeFailed = false;
    try {
      if (oneTime) {
        await db.remove(info.metadata.sid, info.metadata.key);
      } else {
        await db.updateLastDownload(info.metadata.sid, info.metadata.key);
      }

      eventBus.emit('fileDownloaded', { sid, file: info.metadata.name, metadata: info.metadata, ...client });
    }
    catch (e) {
      console.error(e);
      removeFailed = oneTime;
    }
    // keep the claim if removal failed to prevent further downloads
    if (!removeFailed) release();
  });
});


// what the upload page sends, the server sets the rest of the metadata
const CLIENT_METADATA = ['sid', 'retention', 'password', 'name', 'comment', 'type'];
// new transfer ids: they are the share links, keep them URL-safe and hard to guess
const SID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const UPLOAD_LENGTH_RE = /^(0|[1-9][0-9]*)$/;

function uploadError(res, status, code, message, extra = {}) {
  return res.status(status).json({ error: code, message, ...extra });
}

const refuse = (status, code, message, extra = {}) => ({ status, code, message, extra });
const invalid = message => refuse(400, 'invalidUpload', message);

/**
 * Checks a new upload and reserves its space.
 * @returns {Promise<Object|null>} why the upload is refused
 */
async function createUpload(req, res, ownerId, uploader) {
  const sent = tusMeta.decode(req.get('Upload-Metadata'));
  const meta = Object.fromEntries(CLIENT_METADATA.filter(k => k in sent).map(k => [k, sent[k]]));
  if (!meta.name || !meta.sid || !meta.retention) return invalid('Upload-Metadata needs name, sid and retention');
  if (!SID_RE.test(meta.sid) || RESERVED_SIDS.has(meta.sid.toLowerCase())) return invalid('Invalid bucket id');
  if (!settings.get('retentions').includes(meta.retention)) return invalid(`Invalid retention ${ meta.retention }`);
  // a flat name keeps archives free of paths (zip slip)
  if (!utils.isSafeBasename(meta.name)) return invalid('Invalid file name');
  const blocked = settings.blockedExtension(meta.name);
  if (blocked) return refuse(415, 'blockedExtension', `Files of type .${ blocked } are not accepted`, { extension: blocked });
  if (settings.get('requireTransferPassword') && !meta.password) {
    return refuse(400, 'passwordRequired', 'A password is required for every transfer');
  }
  const uploadLength = req.get('Upload-Length') || '';
  if (!UPLOAD_LENGTH_RE.test(uploadLength) || !Number.isSafeInteger(+uploadLength)) return invalid('Invalid Upload-Length');

  const existing = db.transfer(meta.sid);
  if (existing && !mayWrite(existing, ownerId, uploader)) {
    return refuse(403, 'notOwner', 'This transfer belongs to someone else');
  }
  if (existing && existing.suspendedAt) return refuse(403, 'suspended', 'This transfer is suspended');
  if (db.isLocked(meta.sid)) return invalid('Bucket locked');

  // check and reserve in the same tick: concurrent uploads cannot both fit the last free bytes
  const exceeded = checkUpload({
    limits: limitsFor(req.user, settings),
    size: +uploadLength,
    bucketSize: db.bucketSize(meta.sid),
    bucketFiles: (db.get(meta.sid) || []).length,
    isNewBucket: !db.get(meta.sid),
    usage: ownerId !== null ? db.usage(ownerId) : null,
  });
  if (exceeded) return refuse(413, exceeded.code, exceeded.message, { limit: exceeded.limit });

  meta.uploadLength = uploadLength;
  meta.key = randomUUID();
  meta.createdAt = Date.now().toString();
  const persisted = db.claimTransfer(meta.sid, ownerId, uploader);
  db.add(meta.sid, meta.key, { isPartial: true, metadata: meta });
  // tusboy may still refuse the upload, or the client go away: the reserved space is freed,
  // once the transfer row is written so that removing the last file also removes it
  res.on('close', () => {
    if (res.statusCode === 201 && res.writableFinished) return;
    persisted.catch(() => {}).then(() => db.remove(meta.sid, meta.key)).catch(e => console.error(e));
  });

  if (meta.password) meta.password = await transferPasswordHash(meta.sid, meta.password);
  else delete meta.password;
  await persisted;
  req.headers['upload-metadata'] = tusMeta.encode(meta);
  req.FID = meta.sid + '++' + meta.key;
  return null;
}

app.use(`${ config.uploadAppPath }files`,
  async function(req, res, next) {
    if (req.method === 'GET') return res.status(405).end();
    if (['OPTIONS', 'HEAD'].includes(req.method)) return next();

    if (!req.user && !settings.get('anonymousUpload')) {
      return uploadError(res, 401, 'loginRequired', 'Login required to upload');
    }
    if (req.session && !utils.safeEqual(req.get('x-csrf-token') || '', req.session.csrf)) {
      return uploadError(res, 403, 'csrf', 'Invalid or missing CSRF token, reload the page');
    }
    if (settings.get('maintenanceMode') && !(req.user && req.user.role === 'admin')) {
      return uploadError(res, 503, 'maintenance', settings.get('maintenanceMessage') || 'Uploads are paused for maintenance');
    }
    const ownerId = req.user ? req.user.id : null;
    const uploader = ownerId === null ? sha256Hex(uploaderToken(req, res)) : null;

    try {
      if (req.method === 'POST') {
        if (decodedUploadPathSegment(req) !== '') return res.status(405).end();
        const refusal = await createUpload(req, res, ownerId, uploader);
        if (refusal) return uploadError(res, refusal.status, refusal.code, refusal.message, refusal.extra);
        return next();
      }
      if (req.method !== 'PATCH') return res.status(405).end();

      const fid = decodedUploadPathSegment(req);
      if (fid === null) return uploadError(res, 400, 'invalidUpload', 'Invalid path encoding');
      const bucketId = fid.split('++')[0];
      const transfer = db.transfer(bucketId);
      if (transfer && !mayWrite(transfer, ownerId, uploader)) {
        return uploadError(res, 403, 'notOwner', 'This transfer belongs to someone else');
      }

      // PATCH /files/:sid?lock=yes closes a transfer once its files are sent
      if (!fid.includes('++')) {
        if (!utils.isSafeBucketFid(fid)) return uploadError(res, 400, 'invalidUpload', 'Invalid bucket id');
        if (!req.query.lock) return res.status(405).end();
        await db.lock(fid);
        return res.status(204).end();
      }

      if (!utils.isSafeTusUploadId(fid)) return uploadError(res, 400, 'invalidUpload', 'Invalid upload id');
      if (db.isLocked(bucketId)) return uploadError(res, 400, 'invalidUpload', 'Bucket locked');
      try {
        if (!(await store.info(fid)).isPartial) return uploadError(res, 400, 'invalidUpload', 'Upload already completed');
      } catch (e) {
        if (!(e instanceof httpErrors.NotFound)) throw e;
      }
      next();
    } catch (e) {
      console.error(e);
      uploadError(res, 500, 'serverError', 'Internal error');
    }
  },

  tusboy(store, {
    getKey: req => req.FID,
    afterComplete: (req, upload, fid) => {
      db.add(upload.metadata.sid, upload.metadata.key, upload);
      debug(`Completed upload ${ fid }, size=${ upload.size } name=${ upload.metadata.name }`);
      eventBus.emit('fileUploaded', upload);
    },
  })
);

app.use((req, res, next) => {
  if (req.url === config.baseUrl) {
    return res.redirect(config.uploadAppPath);
  }
  renderError(req, res, 404, req.translations.errors.transferNotFound);
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  if (res.headersSent) return res.destroy();
  req.translations = req.translations || config.languages[config.defaultLanguage];
  renderError(req, res, status, status >= 500 ? req.translations.errors.serverError : req.translations.errors.notFound);
});

// resolves once the files are loaded from the database, before that every bucket looks empty
app.ready = ready;
app.ctx = ctx;

module.exports = app;
