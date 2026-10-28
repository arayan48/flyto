'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('node:http');
const { Pool } = require('pg');

const { url, skip } = require('../helpers/db');
const { test, before, after } = require('node:test');
if (skip) return test('middleware', { skip });
process.env.FLYTO_DB_URL = url;

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flyto-int-'));
process.env.FLYTO_UPLOAD_DIR = tmpDir;

const assert = require('node:assert');

const tusMeta = require('../../lib/tusboy/tus-metadata');
const app = require('../../lib/endpoints');

const TUS = { 'Tus-Resumable': '1.0.0' };
const UUID = '00000000-0000-4000-8000-000000000001';

// the uploader cookie of anonymous uploads, kept like a browser does
let uploaderCookie = '';

function request(port, method, pathname, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    if (uploaderCookie) headers = { cookie: uploaderCookie, ...headers };
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        method,
        path: pathname,
        headers,
      },
      (res) => {
        const set = (res.headers['set-cookie'] || []).find(c => c.startsWith('flyto_uploader='));
        if (set) uploaderCookie = set.split(';')[0];
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString(),
          });
        });
      }
    );
    req.on('error', reject);
    if (body != null) req.write(body);
    req.end();
  });
}

before(async () => {
  await app.ready;
  await app.ctx.settings.update({ anonymousUpload: true });
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('store.info error that is not NotFound yields 500 (instanceof guard)', async (t) => {
  const sid = 'corruptsid';
  const bucketDir = path.join(tmpDir, sid);
  const fileBase = path.join(bucketDir, UUID);
  fs.mkdirSync(bucketDir, { recursive: true });
  // a scalar instead of an object makes store.info throw a TypeError
  const pool = new Pool({ connectionString: url });
  await pool.query(`
    INSERT INTO files (fid, sid, file_key, data, updated_at) VALUES ($1, $2, $3, '"corrupt"', $4)
    ON CONFLICT (fid) DO UPDATE SET data = excluded.data`, [`${sid}++${UUID}`, sid, UUID, Date.now()]);
  await pool.end();
  fs.writeFileSync(fileBase, '', 'utf8');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const fid = `${sid}++${UUID}`;
    const res = await request(port, 'PATCH', `/files/${encodeURIComponent(fid)}`, {
      ...TUS,
      'Upload-Offset': '0',
      'Content-Type': 'application/offset+octet-stream',
    });
    assert.strictEqual(res.status, 500);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(bucketDir, { recursive: true, force: true });
  }
});

test('PATCH with encoded traversal in upload id is rejected before Tus handler', async (t) => {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const pathname =
      '/files/foo%2B%2B' + encodeURIComponent('../..') + '%2Fetc%2Fpasswd';
    const res = await request(port, 'PATCH', pathname, {
      ...TUS,
      'Upload-Offset': '0',
      'Content-Type': 'application/offset+octet-stream',
    });
    assert.ok(res.status === 400 || res.status === 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST with malicious meta.sid is rejected', async (t) => {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const meta = {
      name: 'x',
      sid: '../../etc',
      retention: '3600',
    };
    const res = await request(port, 'POST', '/files/', {
      ...TUS,
      'Upload-Length': '10',
      'Upload-Metadata': tusMeta.encode(meta),
      'Content-Type': 'application/offset+octet-stream',
    });
    assert.strictEqual(res.status, 400);
    assert.match(res.body, /bucket|Invalid/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('lock PATCH with traversal bucket id is rejected', async (t) => {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const res = await request(
      port,
      'PATCH',
      '/files/' + encodeURIComponent('..') + '%2F' + encodeURIComponent('..') + '%2Fetc?lock=yes',
      TUS
    );
    assert.strictEqual(res.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('PATCH on a running upload of a locked bucket is rejected', async (t) => {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const sid = 'lockedbucket';
    const created = await request(port, 'POST', '/files/', {
      ...TUS,
      'Upload-Length': '10',
      'Upload-Metadata': tusMeta.encode({ name: 'x', sid, retention: '3600' }),
    });
    assert.strictEqual(created.status, 201);
    const fid = decodeURIComponent(created.headers.location.split('/').pop());

    const lock = await request(port, 'PATCH', `/files/${sid}?lock=yes`, TUS);
    assert.strictEqual(lock.status, 204);

    const res = await request(port, 'PATCH', `/files/${encodeURIComponent(fid)}`, {
      ...TUS,
      'Upload-Offset': '0',
      'Content-Type': 'application/offset+octet-stream',
    }, '0123456789');
    assert.strictEqual(res.status, 400);
    assert.match(res.body, /Bucket locked/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(path.join(tmpDir, 'lockedbucket'), { recursive: true, force: true });
  }
});
