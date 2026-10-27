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

function request(method, pathname, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, method, path: pathname, headers, agent: false },
      (res) => {
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
