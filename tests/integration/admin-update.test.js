'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('node:http');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flyto-int-'));
process.env.FLYTO_UPLOAD_DIR = tmpDir;
process.env.FLYTO_ADMIN_PASS = 'secret';

const { test, before, after } = require('node:test');
const assert = require('node:assert');

const app = require('../../lib/endpoints');
const updateCheck = require('../../lib/updateCheck');

let server;
let port;

function get(pathname, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port, path: pathname, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
    }).on('error', reject);
  });
}

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  port = server.address().port;
});

after(() => {
  server.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('update status needs the admin password', async () => {
  assert.strictEqual((await get('/admin/update.json')).status, 401);
  assert.strictEqual((await get('/admin/update.json', { 'x-passwd': 'wrong' })).status, 403);
});

test('update status is returned to the admin', async () => {
  Object.assign(updateCheck.state, { current: '0.1.0', latest: 'v0.2.0', updateAvailable: true });
  const res = await get('/admin/update.json', { 'x-passwd': 'secret' });
  assert.strictEqual(res.status, 200);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.latest, 'v0.2.0');
  assert.strictEqual(body.updateAvailable, true);
  assert.strictEqual(body.repo, 'arayan48/flyto');
  assert.strictEqual(body.enabled, true);
});
