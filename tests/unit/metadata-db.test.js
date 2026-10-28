'use strict';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MetadataDb = require('../../lib/metadataDb');
const { url, skip } = require('../helpers/db');
const KEY = '00000000-0000-4000-8000-000000000001';

let db;
before(() => { if (url) db = new MetadataDb(url); });
after(async () => { if (db) await db.close(); });
beforeEach(async () => { if (db) await db._query('TRUNCATE files, downloads'); });

test('set/get/delete round-trips file metadata', { skip }, async () => {
  const fid = `abc++${ KEY }`;
  await db.set(fid, { metadata: { name: 'a.txt' }, isPartial: true });
  assert.deepStrictEqual(await db.get(fid), { metadata: { name: 'a.txt' }, isPartial: true });
  await db.set(fid, { metadata: { name: 'a.txt' } });
  assert.deepStrictEqual(await db.get(fid), { metadata: { name: 'a.txt' } });
  assert.deepStrictEqual(await db.fids(), [fid]);
  await db.delete(fid);
  assert.strictEqual(await db.get(fid), null);
});

test('logDownload counts downloads per file', { skip }, async () => {
  await db.logDownload('abc', KEY, 'a.txt');
  await db.logDownload('abc', KEY, 'a.txt');
  assert.deepStrictEqual(await db.downloadCounts(), { abc: { [KEY]: 2 } });
});

test('importLegacyJson moves sidecar files into the database', { skip }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flyto-metadata-'));
  fs.mkdirSync(path.join(dir, 'abc'));
  fs.writeFileSync(path.join(dir, 'abc', KEY), 'hello');
  fs.writeFileSync(path.join(dir, 'abc', `${ KEY }.json`), JSON.stringify({ metadata: { name: 'a.txt' } }));
  assert.strictEqual(await db.importLegacyJson(dir), 1);
  assert.deepStrictEqual(await db.get(`abc++${ KEY }`), { metadata: { name: 'a.txt' } });
  assert.strictEqual(fs.existsSync(path.join(dir, 'abc', `${ KEY }.json`)), false);
});

test('startup retries an unreachable database until connectTimeout', async () => {
  for (const url of ['postgres://flyto@127.0.0.1:1/flyto', 'postgres://flyto@flyto-missing.invalid/flyto']) {
    const started = Date.now();
    const unreachable = new MetadataDb(url, { connectTimeout: 1200 });
    await assert.rejects(unreachable.ready, e => ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'].includes(e.code));
    assert.ok(Date.now() - started >= 1200, url);
    await unreachable.close();
  }
});

test('a refused password fails at once with a hint about POSTGRES_PASSWORD', async () => {
  const db = new MetadataDb('postgres://flyto:wrong@127.0.0.1:1/flyto', { connectTimeout: 60 * 1000 });
  db.pool.connect = async () => { throw Object.assign(new Error('password authentication failed'), { code: '28P01' }); };
  const started = Date.now();
  await assert.rejects(db._migrate(), e => e.code === '28P01' && /ALTER USER flyto/.test(e.message));
  assert.ok(Date.now() - started < 1000);
  await db.ready.catch(() => {});
  await db.close();
});
