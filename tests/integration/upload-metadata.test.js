'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('node:http');

const { url, skip } = require('../helpers/db');
const { test, before, after } = require('node:test');
if (skip) return test('upload metadata', { skip });
process.env.FLYTO_DB_URL = url;

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flyto-meta-'));
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

async function upload(sid, name, content, extra = {}) {
  const created = await request('POST', '/files/', {
    ...TUS,
    'Upload-Length': String(content.length),
    'Upload-Metadata': tusMeta.encode({ name, sid, retention: '3600', ...extra }),
  });
  assert.strictEqual(created.status, 201);
  const fid = decodeURIComponent(created.headers.location.split('/').pop());
  if (content.length) {
    const patched = await request('PATCH', `/files/${ encodeURIComponent(fid) }`, {
      ...TUS,
      'Upload-Offset': '0',
      'Content-Type': 'application/offset+octet-stream',
    }, content);
    assert.strictEqual(patched.status, 204);
  }
  return fid;
}

before(async () => {
  await app.ready;
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

test('metadata set by the server cannot be sent by the client', async () => {
  const fid = await upload('metaforged', 'a.txt', Buffer.from('abc'),
    { expiresAt: '99999999999999', buckedLocked: 'true', lastDownload: '1' });
  const [sid, key] = fid.split('++');
  const { metadata } = app.ctx.db.get(sid).find(f => f.key === key);
  assert.strictEqual(metadata.expiresAt, undefined);
  assert.strictEqual(metadata.buckedLocked, undefined);
  assert.strictEqual(metadata.lastDownload, undefined);
  assert.strictEqual(metadata.name, 'a.txt');
  assert.ok(app.ctx.db.summary(sid).expiresAt <= Date.now() + 3600 * 1000);
});

test('an empty file is listed and downloadable', async () => {
  await upload('metaempty', 'full.txt', Buffer.from('abc'));
  const fid = await upload('metaempty', 'empty.txt', Buffer.alloc(0));

  const list = await request('GET', '/metaempty.json');
  assert.strictEqual(list.status, 200);
  const names = JSON.parse(list.body).items.map(i => i.metadata.name).sort();
  assert.deepStrictEqual(names, ['empty.txt', 'full.txt']);

  const download = await request('GET', `/files/${ encodeURIComponent(fid) }`);
  assert.strictEqual(download.status, 200);
  assert.strictEqual(download.body.length, 0);
});

test('HEAD on a locked, downloaded and protected file answers without the password', async () => {
  const fid = await upload('metahead', 'a.txt', Buffer.from('abc'), { password: 'secret' });
  assert.strictEqual((await request('PATCH', '/files/metahead?lock=yes')).status, 204);
  assert.strictEqual((await request('GET', '/metahead.json', { 'x-download-pass': 'secret' })).status, 200);
  assert.strictEqual((await request('GET', `/files/${ encodeURIComponent(fid) }`)).status, 200);

  const head = await request('HEAD', `/files/${ encodeURIComponent(fid) }`, TUS);
  assert.strictEqual(head.status, 200);
  assert.strictEqual(head.headers['upload-offset'], '3');
  const meta = tusMeta.decode(head.headers['upload-metadata']);
  assert.strictEqual(meta.name, 'a.txt');
  assert.ok(!('password' in meta));
});
