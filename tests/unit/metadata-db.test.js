'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MetadataDb = require('../../lib/metadataDb');

const KEY = '00000000-0000-4000-8000-000000000001';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'flyto-metadata-'));
}

test('set/get/delete round-trips file metadata', async () => {
  const db = new MetadataDb(path.join(tmpDir(), 'flyto.sqlite'));
  const fid = `abc++${ KEY }`;
  await db.set(fid, { metadata: { name: 'a.txt' }, isPartial: true });
  assert.deepStrictEqual(await db.get(fid), { metadata: { name: 'a.txt' }, isPartial: true });
  await db.set(fid, { metadata: { name: 'a.txt' } });
  assert.deepStrictEqual(await db.get(fid), { metadata: { name: 'a.txt' } });
  assert.deepStrictEqual(await db.fids(), [fid]);
  await db.delete(fid);
  assert.strictEqual(await db.get(fid), null);
  await db.close();
});

test('metadata survives reopening the database', async () => {
  const file = path.join(tmpDir(), 'flyto.sqlite');
  const fid = `abc++${ KEY }`;
  let db = new MetadataDb(file);
  await db.set(fid, { metadata: { name: 'a.txt' } });
  await db.close();
  db = new MetadataDb(file);
  assert.deepStrictEqual(await db.get(fid), { metadata: { name: 'a.txt' } });
  await db.close();
});

test('logDownload counts downloads per file', async () => {
  const db = new MetadataDb(path.join(tmpDir(), 'flyto.sqlite'));
  await db.logDownload('abc', KEY, 'a.txt');
  await db.logDownload('abc', KEY, 'a.txt');
  assert.deepStrictEqual(await db.downloadCounts(), { abc: { [KEY]: 2 } });
  await db.close();
});

test('importLegacyJson moves sidecar files into the database', async () => {
  const dir = tmpDir();
  fs.mkdirSync(path.join(dir, 'abc'));
  fs.writeFileSync(path.join(dir, 'abc', KEY), 'hello');
  fs.writeFileSync(path.join(dir, 'abc', `${ KEY }.json`), JSON.stringify({ metadata: { name: 'a.txt' } }));
  const db = new MetadataDb(path.join(dir, 'flyto.sqlite'));
  assert.strictEqual(await db.importLegacyJson(dir), 1);
  assert.deepStrictEqual(await db.get(`abc++${ KEY }`), { metadata: { name: 'a.txt' } });
  assert.strictEqual(fs.existsSync(path.join(dir, 'abc', `${ KEY }.json`)), false);
  assert.strictEqual(fs.existsSync(path.join(dir, 'abc', KEY)), true);
  await db.close();
});
