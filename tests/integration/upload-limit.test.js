'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('node:http');

const { url, skip } = require('../helpers/db');
const { test, before, after } = require('node:test');
if (skip) return test('upload limit', { skip });
process.env.FLYTO_DB_URL = url;

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flyto-limit-'));
process.env.FLYTO_UPLOAD_DIR = tmpDir;

const assert = require('node:assert');

const tusMeta = require('../../lib/tusboy/tus-metadata');
const app = require('../../lib/endpoints');

const TUS = { 'Tus-Resumable': '1.0.0' };

let server;
let port;

// the uploader cookie of anonymous uploads, kept like a browser does
let uploaderCookie = '';

function request(method, pathname, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    if (uploaderCookie) headers = { cookie: uploaderCookie, ...headers };
    const req = http.request(
      { hostname: '127.0.0.1', port, method, path: pathname, headers, agent: false },
      (res) => {
        const set = (res.headers['set-cookie'] || []).find(c => c.startsWith('flyto_uploader='));
        if (set) uploaderCookie = set.split(';')[0];
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      }
    );
    req.on('error', reject);
    if (body != null) req.write(body);
    req.end();
  });
}

before(async () => {
  await app.ready;
  // these tests are about downloads, not accounts
  await app.ctx.settings.update({ anonymousUpload: true });
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});

after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('a PATCH larger than Upload-Length is refused and nothing is written', async () => {
  const created = await request('POST', '/files/', {
    ...TUS,
    'Upload-Length': '5',
    'Upload-Metadata': tusMeta.encode({ name: 'small.txt', sid: 'uploadlimit', retention: '3600' }),
  });
  assert.strictEqual(created.status, 201);
  const fid = decodeURIComponent(created.headers.location.split('/').pop());

  const patched = await request('PATCH', `/files/${ encodeURIComponent(fid) }`, {
    ...TUS,
    'Upload-Offset': '0',
    'Content-Type': 'application/offset+octet-stream',
  }, Buffer.alloc(1024, 'x'));
  assert.strictEqual(patched.status, 413);

  const head = await request('HEAD', `/files/${ encodeURIComponent(fid) }`, TUS);
  assert.strictEqual(head.headers['upload-offset'], '0');
  assert.strictEqual(fs.statSync(path.join(tmpDir, 'uploadlimit', fid.split('++')[1])).size, 0);
});

test('an upload past the total size of all transfers is refused', async () => {
  await app.ctx.settings.update({ maxTotalStorage: 1024 });
  try {
    const refused = await request('POST', '/files/', {
      ...TUS,
      'Upload-Length': '2048',
      'Upload-Metadata': tusMeta.encode({ name: 'big.txt', sid: 'serverfull', retention: '3600' }),
    });
    assert.strictEqual(refused.status, 507);
    assert.strictEqual(JSON.parse(refused.body).error, 'serverFull');
  } finally {
    await app.ctx.settings.update({ maxTotalStorage: 0 });
  }
});
