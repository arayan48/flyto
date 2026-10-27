const pug = require('pug');
const express = require('express');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');
const fs = require("fs");
const assert = require('assert');
const { createHash, randomUUID } = require('node:crypto');
const tar = require('tar-stream');
const { finished, pipeline } = require('node:stream/promises');
const config = require('../config');
const eventBus = require('./eventBus');
const tusboy = require('./tusboy');
const Store = require('./store');
const tusMeta = require('./tusboy/tus-metadata');
const utils = require('./utils');
const updateCheck = require('./updateCheck');
const debug = require('debug')('flyto:main');
const { hashPassword, verifyPassword } = require('./passwordHash');

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

/** Decoded path segment under the /files mount (must match req.params used by tusboy). */
function decodedUploadPathSegment(req) {
  const raw = req.path.startsWith('/') ? req.path.slice(1) : req.path;
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

const pugVars = {
  baseUrl: config.baseUrl
};

const errorPage = pug.compileFile(path.join(__dirname, '../public/pug/error.pug'), { pretty: true });
const adminPage = pug.compileFile(path.join(__dirname, '../public/pug/admin.pug'), { pretty: true });
const uploadPage = pug.compileFile(path.join(__dirname, '../public/pug/upload.pug'), { pretty: true });
const downloadPage = pug.compileFile(path.join(__dirname, '../public/pug/download.pug'), { pretty: true });

const MetadataDb = require('./metadataDb');
if (!config.dbUrl) {
  throw new Error('FLYTO_DB_URL is not set, e.g. postgres://flyto:secret@database:5432/flyto');
}
const store = new Store(config.uploadDir, new MetadataDb(config.dbUrl));
const Db = require('./db');
const { createGzip } = require("zlib");
const httpErrors = require("http-errors");
const db = new Db(config.uploadDir, store);
db.init().catch(e => {
  console.error(e);
  process.exit(1);
});

// unfinished uploads are listed in /admin but never served
function completedFiles(sid) {
  return (db.get(sid) || []).filter(file => !file.isPartial);
}

function recordDownload(metadata) {
  db.recordDownload(metadata.sid, metadata.key, metadata.name).catch(e => console.error(e));
}
eventBus.on('fileDownloaded', ({ metadata }) => recordDownload(metadata));
eventBus.on('archiveDownloaded', ({ bucket }) => bucket.forEach(info => recordDownload(info.metadata)));
const app = express();

app.disable('x-powered-by');
app.use(compression());
app.use(express.json());

if (config.accessLog) {
  app.use(morgan(config.accessLog));
}

if (config.trustProxy) {
  app.set('trust proxy', config.trustProxy);
}

if (config.forceHttps) {
  app.enable('trust proxy');
  app.use(function(req, res, next) {
    if (req.secure) return next();
    const target = config.forceHttps === 'true' ? 'https://' + req.headers.host : config.forceHttps;
    res.redirect(target + req.url);
  });
}

// Static files
app.use(`${ config.baseUrl }app`, express.static(path.join(__dirname, '../public/app')));
app.use(`${ config.baseUrl }assets`, express.static(path.join(__dirname, '../public/assets')));

// Resolve language
app.use((req, res, next) => {
  const lang = req.acceptsLanguages(...Object.keys(config.languages)) || config.defaultLanguage;
  req.translations = config.languages[lang];
  next();
});

// robots.txt
app.get(`${ config.baseUrl }robots.txt`, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/robots.txt'));
});

// Init plugins
config.plugins.forEach(pluginName => {
  require('../plugins/' + pluginName)(eventBus, app, config, db);
});

// Upload App
app.get(config.uploadAppPath, (req, res) => {
  res.send(uploadPage({
    ...pugVars,
    baseUrl: config.baseUrl,
    uploadAppPath: config.uploadAppPath,
    lang: req.translations
  }));
});

// Return translations
app.get(`${ config.baseUrl }lang.json`, (req, res) => {
  eventBus.emit('getLang', req.translations);
  res.json(req.translations);
});

// Config
app.get(`${ config.baseUrl }config.json`, (req, res) => {
  // Upload password protection
  if (config.uploadPass) {
    const bfTimeout = 200;
    if (!req.get('x-passwd')) {
      setTimeout(() => res.status(401).send('Unauthorized'), bfTimeout);
      return;
    }
    if (!utils.safeEqual(utils.decodePasswordHeader(req.get('x-passwd')), config.uploadPass)) {
      setTimeout(() => res.status(403).send('Forbidden'), bfTimeout);
      return;
    }
  }

  const frontendConfig = {
    retentions: config.retentions,
    defaultRetention: config.defaultRetention,
    mailTemplate: config.mailTemplate,
    requireBucketPassword: config.requireBucketPassword,
    maxFileSize: config.maxFileSize,
    maxBucketSize: config.maxBucketSize,
    disableQrCode: config.disableQrCode,
  };

  eventBus.emit('getFrontendConfig', frontendConfig);

  res.json(frontendConfig);
});

app.get(`${ config.baseUrl }admin`, (req, res, next) => {
  if (!config.adminPass) return next();
  res.send(adminPage({ ...pugVars, lang: req.translations }));
});

const adminBfTimeout = 500;

function requireAdmin(req, res, next) {
  if (!config.adminPass) return next('route');
  if (!req.get('x-passwd')) {
    // delay answer to make brute force attacks more difficult
    setTimeout(() => res.status(401).send('Unauthorized'), adminBfTimeout);
    return;
  }
  if (!utils.safeEqual(utils.decodePasswordHeader(req.get('x-passwd')), config.adminPass)) {
    setTimeout(() => res.status(403).send('Forbidden'), adminBfTimeout);
    return;
  }
  next();
}

app.get(`${ config.baseUrl }admin/update.json`, requireAdmin, (req, res) => {
  res.json({ ...updateCheck.state, repo: config.updateCheckRepo, enabled: updateCheck.isEnabled(config) });
});

app.get(`${ config.baseUrl }admin/data.json`, requireAdmin, async (req, res) => {
  let result = JSON.parse(JSON.stringify(db.db));
  const downloadCounts = await db.downloadCounts();
  Object.entries(result).forEach(([sid, bucket]) => {
    bucket.forEach(file => {
      file.downloadCount = (downloadCounts[sid] && downloadCounts[sid][file.key]) || 0;
      if (file.metadata.password) {
        file.metadata._password = true;
        delete file.metadata.password;
        delete file.metadata.key;
        delete file.key;
        delete file.url;
      }
    });
  });

  setTimeout(() => res.json(result), adminBfTimeout);
});


// List files / Download App
app.get(`${ config.baseUrl }:sid`, async (req, res, next) => {
  if (req.path.endsWith('.json')) {
    const sid = req.params.sid.substr(0, req.params.sid.length - 5);
    const bucket = completedFiles(sid);
    if (!bucket.length) return res.status(404).end();

    const downloadPassword = utils.decodePasswordHeader(req.get('x-download-pass'));
    const items = bucket.map(item => ({
      ...item,
      url: `${ config.baseUrl }files/${ sid }++${ item.key }`
    }));

    res.header('Cache-control', 'private, max-age=0, no-cache, no-store, must-revalidate');

    // Currently, every item in a bucket must have the same password
    try {
      const pass = downloadPassword || '';
      for (const item of items) {
        if (!item.metadata.password) continue;
        const ok = await verifyPassword(item.metadata.password, pass);
        if (!ok) {
          setTimeout(() => res.status(401).send('Unauthorized'), 500);
          return;
        }
      }
    } catch (e) {
      console.error(e);
      setTimeout(() => res.status(401).send('Unauthorized'), 500);
      return;
    }

    const keyList = items.map(item => item.key).join();
    const archiveToken = sha256Hex(keyList).slice(0, 32);

    res.json({
      items: items.map(({ metadata: { password, ...metadata }, ...item }) => ({ ...item, metadata })),
      archiveToken,
      config: {
        maxPreviewSize: config.maxPreviewSize
      }
    });
  } else {
    if (!db.get(req.params.sid)) return next();
    res.send(downloadPage({ ...pugVars, lang: req.translations }));
  }
});


// Download files
app.get(`${ config.baseUrl }files/:fid`, async (req, res, next) => {
  // let tusboy handle HEAD requests with Tus Header
  if (req.method === 'HEAD' && req.get('Tus-Resumable')) return next();

  // Disable HTTP transport compression for file downloads.
  // Archives already handle their own compression (zip/gzip), and for single
  // files this preserves Content-Length and Range request support needed for
  // resumable downloads of large files.
  res.set('Cache-Control', 'no-transform');

  const sid = req.params.fid.split('++')[0];

  // Download all files
  const archive = /^(.+?)\+\+([0-9a-f]{32})\.(tar\.gz|zip)$/.exec(req.params.fid);
  if (archive) {
    const format = archive[3];
    const files = completedFiles(sid);

    if (!files.length) return res.status(404).send(errorPage({
        ...pugVars,
        error: 'Download bucket not found.',
        lang: req.translations,
        uploadAppPath: config.uploadAppPath || config.baseUrl,
      }));

    const keyList = files.map(f => f.key).join();
    if (archive[2] !== md5Hex(keyList) && archive[2] !== sha256Hex(keyList).slice(0, 32)) {
      res.status(404).send(errorPage({
        ...pugVars,
        error: 'Invalid link',
        uploadAppPath: config.uploadAppPath || config.baseUrl,
        lang: req.translations,
      }));
      return;
    }
    debug(`Download Bucket ${ sid }`);

    const isHead = req.method === 'HEAD';

    // atomically claim all one-time files; HEAD neither claims nor consumes
    const claimed = [];
    const release = () => claimed.splice(0).forEach(info => db.release(sid, info.key));
    for (const info of files.filter(info => info.metadata.retention === 'one-time')) {
      if (isHead ? db.isClaimed(sid, info.key) : !db.claim(sid, info.key)) {
        release();
        return res.status(404).send(errorPage({
          ...pugVars,
          error: 'File not found',
          lang: req.translations,
          uploadAppPath: config.uploadAppPath || config.baseUrl,
        }));
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
      if (isHead || res.statusCode !== 200) return release();
      let removeFailed = false;
      try {
        await Promise.all(files.map(info => info.metadata.retention === 'one-time'
          ? db.remove(info.metadata.sid, info.metadata.key)
          : db.updateLastDownload(info.metadata.sid, info.metadata.key)
        ));

        eventBus.emit('archiveDownloaded', {
          sid,
          file: filename,
          metadata: files[0].metadata,
          bucket: files,
          url: req.protocol + '://' + req.get('host') + req.originalUrl,
        });
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

  // Download single file
  debug(`Download ${ req.params.fid }`);
  try {
    if (req.params.fid.includes('++') && !utils.isSafeTusUploadId(req.params.fid)) {
      return res.status(404).send(errorPage({
        ...pugVars,
        error: 'Invalid link',
        lang: req.translations,
        uploadAppPath: config.uploadAppPath || config.baseUrl,
      }));
    }
    const info = await store.info(req.params.fid); // throws on 404
    if (info.isPartial) throw httpErrors.NotFound();
    const contentDisposition = contentDispositionUtf8Filename(utils.toSafeBasename(info.metadata.name, info.key), info.key);
    const isHead = req.method === 'HEAD';
    const oneTime = info.metadata.retention === 'one-time';

    // atomically claim one-time files; HEAD neither claims nor consumes
    let claimed = false;
    if (oneTime) {
      claimed = !isHead && db.claim(info.metadata.sid, info.metadata.key);
      if (isHead ? db.isClaimed(info.metadata.sid, info.metadata.key) : !claimed) {
        return res.status(404).send(errorPage({
          ...pugVars,
          error: 'File not found',
          lang: req.translations,
          uploadAppPath: config.uploadAppPath || config.baseUrl,
        }));
      }
    }
    const release = () => {
      if (!claimed) return;
      claimed = false;
      db.release(info.metadata.sid, info.metadata.key);
    };

    res.set('Content-Disposition', contentDisposition);
    res.sendFile(store.getFilename(req.params.fid), err => {
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
      if (isHead || ![200, 206].includes(res.statusCode)) return release();
      let removeFailed = false;
      try {
        if (oneTime) {
          await db.remove(info.metadata.sid, info.metadata.key);
        } else {
          await db.updateLastDownload(info.metadata.sid, info.metadata.key);
        }

        eventBus.emit('fileDownloaded', {
          sid,
          file: info.metadata.name,
          metadata: info.metadata,
          url: req.protocol + '://' + req.get('host') + req.originalUrl,
        });
      }
      catch (e) {
        console.error(e);
        removeFailed = oneTime;
      }
      // keep the claim if removal failed to prevent further downloads
      if (!removeFailed) release();
    });
  }
  catch (e) {
    res.status(404).send(errorPage({
      ...pugVars,
      error: e.message,
      lang: req.translations,
      uploadAppPath: config.uploadAppPath || config.baseUrl,
    }));
  }
});


// Upload file
app.use(`${ config.uploadAppPath }files`,
  async function(req, res, next) {
    // Upload password protection
    if (config.uploadPass) {
      const bfTimeout = 500;
      if (!req.get('x-passwd')) {
        setTimeout(() => res.status(401).send('Unauthorized'), bfTimeout);
        return;
      }
      if (!utils.safeEqual(utils.decodePasswordHeader(req.get('x-passwd')), config.uploadPass)) {
        setTimeout(() => res.status(403).send('Forbidden'), bfTimeout);
        return;
      }
    }

    if (req.method === 'GET') return res.status(405).end();

    const fid = decodedUploadPathSegment(req);
    if (fid === null) {
      return res.status(400).end('Invalid path encoding');
    }

    // Lock bucket by PATCH /files/:sid?lock=yes
    if (fid && !fid.includes('++') && req.method === 'PATCH' && req.query.lock) {
      if (!utils.isSafeBucketFid(fid)) {
        return res.status(400).end('Invalid bucket id');
      }
      await db.lock(fid);
      return res.status(204).end('Bucket locked');
    }

    if (['POST', 'PATCH'].includes(req.method)) {
      if (fid && !fid.includes('++') && !utils.isSafeBucketFid(fid)) {
        return res.status(400).end('Invalid bucket id');
      }
      if (fid && !fid.includes('++') && db.isLocked(fid)) {
        return res.status(400).end('Bucket locked');
      }
      if (fid) {
        if (fid.includes('++') && !utils.isSafeTusUploadId(fid)) {
          return res.status(400).end('Invalid upload id');
        }
        if (fid.includes('++') && db.isLocked(fid.split('++')[0])) {
          return res.status(400).end('Bucket locked');
        }
        try {
          const info = await store.info(fid);
          if (!info.isPartial) {
            return res.status(400).end('Upload already completed');
          }
        } catch (e) {
          if (!(e instanceof httpErrors.NotFound)) {
            console.error(e);
            return next(e);
          }
        }
      }
    }

    if (req.method === 'POST') {
      // validate meta-data
      // !! tusMeta.encode supports only strings !!
      const meta = tusMeta.decode(req.get('Upload-Metadata'));

      try {
        assert(meta.name, 'tus meta prop missing: name');
        assert(meta.sid, 'tus meta prop missing: sid');
        if (!utils.isSafeBasename(meta.sid)) {
          return res.status(400).end('Invalid bucket id');
        }
        assert(meta.retention, 'tus meta prop missing: retention');
        assert(Object.keys(config.retentions).indexOf(meta.retention) >= 0,
          `invalid tus meta prop retention. Value ${ meta.retention } not in [${ Object.keys(config.retentions).join(',') }]`);

        // Prevent ZipSlip/tar path traversal by requiring a safe basename at upload time.
        // Policy (flat archive): no directories, no absolute paths, no traversal, no control chars.
        if (!utils.isSafeBasename(meta.name)) {
          return res.status(400).end('Invalid file name');
        }

        const uploadLength = req.get('Upload-Length');
        assert(uploadLength, 'missing Upload-Length header');

        // Restrict creating new files for locked buckets
        if(db.isLocked(meta.sid)) {
          return res.status(400).end('Bucket locked');
        }

        meta.uploadLength = uploadLength;
        meta.key = randomUUID();
        meta.createdAt = Date.now().toString();

        // limit file and bucket size
        if (config.maxFileSize && config.maxFileSize < +uploadLength) {
          return res
            .status(413)
            .json({ message: `File exceeds maximum upload size ${ config.maxFileSize }.` });
        } else if (config.maxBucketSize && db.bucketSize(meta.sid) + +uploadLength > config.maxBucketSize) {
          return res
            .status(413)
            .json({ message: `Bucket exceeds maximum upload size ${ config.maxBucketSize }.` });
        }

        // store changed metadata for tusboy
        if (typeof meta.password === 'string' && meta.password.length > 0) {
          meta.password = await hashPassword(meta.password);
        } else {
          delete meta.password;
        }
        req.headers['upload-metadata'] = tusMeta.encode(meta);
        // for tusboy getKey()
        req.FID = meta.sid + '++' + meta.key;

        db.add(meta.sid, meta.key, {
          "isPartial": true,
          metadata: meta
        });
      }
      catch (e) {
        console.error(e);
        return res.status(400).end(e.message);
      }
    }

    next();
  },

  // let tusboy handle the upload
  tusboy(store, {
    getKey: req => req.FID,
    maxUploadLength: config.maxFileSize || Infinity,
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

  res.status(404).send(errorPage({
    ...pugVars,
    error: 'Download bucket not found.',
    uploadAppPath: config.uploadAppPath || config.baseUrl,
    lang: req.translations
  }));
});

module.exports = app;
