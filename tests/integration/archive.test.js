'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('node:http');
const zlib = require('node:zlib');
const { createHash } = require('node:crypto');

const { url, skip } = require('../helpers/db');
const { test, before, after } = require('node:test');
if (skip) return test('archive download', { skip });
process.env.FLYTO_DB_URL = url;

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flyto-archive-'));
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
        res.on('end', () => {
          resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) });
        });
        res.on('error', reject);
      }
    );
    req.on('error', reject);
    if (body != null) req.write(body);
    req.end();
  });
}

// Create a Tus upload; without content it stays partial
async function upload(sid, name, content, send = true) {
  const created = await request('POST', '/files/', {
    ...TUS,
    'Upload-Length': String(content.length),
    'Upload-Metadata': tusMeta.encode({ name, sid, retention: '3600' }),
  });
  assert.strictEqual(created.status, 201);
  const fid = decodeURIComponent(created.headers.location.split('/').pop());
  if (send) {
    const patched = await request('PATCH', `/files/${ encodeURIComponent(fid) }`, {
      ...TUS,
      'Upload-Offset': '0',
      'Content-Type': 'application/offset+octet-stream',
    }, content);
    assert.strictEqual(patched.status, 204);
  }
  return fid;
}

function archiveUrl(sid, fids, format) {
  const keyList = fids.map(fid => fid.split('++')[1]).join();
  const hash = createHash('sha256').update(keyList).digest('hex').slice(0, 32);
  return `/files/${ sid }++${ hash }.${ format }`;
}

before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});

after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('archives are sent with their content type', async () => {
  const sid = 'archivetypes';
  const fid = await upload(sid, 'a.txt', Buffer.from('hello'));

  const zip = await request('GET', archiveUrl(sid, [fid], 'zip'));
  assert.strictEqual(zip.status, 200);
  assert.strictEqual(zip.headers['content-type'], 'application/zip');
  assert.strictEqual(zip.body.subarray(0, 2).toString(), 'PK');

  const tgz = await request('GET', archiveUrl(sid, [fid], 'tar.gz'));
  assert.strictEqual(tgz.status, 200);
  assert.strictEqual(tgz.headers['content-type'], 'application/gzip');
  const tar = zlib.gunzipSync(tgz.body);
  assert.strictEqual(tar.subarray(0, 5).toString(), 'a.txt');
  assert.strictEqual(tar.subarray(512, 517).toString(), 'hello');
});

test('archives work for bucket ids with upper case and dashes', async () => {
  const sid = 'My-Bucket_1';
  const fid = await upload(sid, 'b.txt', Buffer.from('content'));
  const res = await request('GET', archiveUrl(sid, [fid], 'zip'));
  assert.strictEqual(res.status, 200);
});

test('unfinished uploads are not listed nor downloadable', async () => {
  const sid = 'partialbucket';
  const done = await upload(sid, 'done.txt', Buffer.from('done'));
  const partial = await upload(sid, 'partial.txt', Buffer.from('never sent'), false);

  const list = await request('GET', `/${ sid }.json`);
  assert.strictEqual(list.status, 200);
  const data = JSON.parse(list.body);
  assert.deepStrictEqual(data.items.map(item => item.key), [done.split('++')[1]]);

  assert.strictEqual((await request('GET', `/files/${ partial }`)).status, 404);
  assert.strictEqual((await request('GET', archiveUrl(sid, [done], 'zip'))).status, 200);
  assert.strictEqual((await request('GET', archiveUrl(sid, [done, partial], 'zip'))).status, 404);
});

test('a bucket with only unfinished uploads is not found', async () => {
  const sid = 'onlypartial';
  await upload(sid, 'p.txt', Buffer.from('xyz'), false);
  assert.strictEqual((await request('GET', `/${ sid }.json`)).status, 404);
});

test('password hashes are not sent to the download page', async () => {
  const sid = 'hashleak';
  const created = await request('POST', '/files/', {
    ...TUS,
    'Upload-Length': '3',
    'Upload-Metadata': tusMeta.encode({ name: 'h.txt', sid, retention: '3600', password: 'secret' }),
  });
  const fid = decodeURIComponent(created.headers.location.split('/').pop());
  await request('PATCH', `/files/${ encodeURIComponent(fid) }`, {
    ...TUS,
    'Upload-Offset': '0',
    'Content-Type': 'application/offset+octet-stream',
  }, Buffer.from('abc'));

  const res = await request('GET', `/${ sid }.json`, { 'x-download-pass': 'secret' });
  assert.strictEqual(res.status, 200);
  assert.ok(!('password' in JSON.parse(res.body).items[0].metadata));
});

test('a file missing on disk aborts the archive instead of hanging', async () => {
  const sid = 'missingondisk';
  const fid = await upload(sid, 'gone.txt', Buffer.from('gone'));
  fs.unlinkSync(path.join(tmpDir, sid, fid.split('++')[1]));

  for (const format of ['zip', 'tar.gz']) {
    await assert.rejects(request('GET', archiveUrl(sid, [fid], format)));
  }
  assert.strictEqual((await request('GET', '/robots.txt')).status, 200);
});
