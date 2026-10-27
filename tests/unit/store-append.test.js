'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Readable } = require('stream');

const Store = require('../../lib/store');
const { OffsetMismatch } = require('../../lib/tusboy/store/errors');

class MemoryMetadata {
  constructor() { this.files = new Map(); }
  async get(fid) { return this.files.has(fid) ? structuredClone(this.files.get(fid)) : null; }
  async set(fid, data) { this.files.set(fid, structuredClone(data)); }
  async delete(fid) { this.files.delete(fid); }
}

const FID = 'bucket++00000000-0000-4000-8000-000000000001';

async function setup(uploadLength) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flyto-append-'));
  const store = new Store(dir, new MemoryMetadata());
  await store.create(FID, { uploadLength, metadata: {} });
  fs.writeFileSync(store.getFilename(FID), '');
  return { dir, store };
}

test('append completes the upload once all bytes are written', async () => {
  const { dir, store } = await setup(6);
  let res = await store.append(FID, Readable.from([Buffer.from('abc')]), 0);
  assert.strictEqual(res.offset, 3);
  assert.strictEqual(res.upload.isPartial, true);
  res = await store.append(FID, Readable.from([Buffer.from('def')]), 3);
  assert.strictEqual(res.offset, 6);
  assert.ok(!('isPartial' in res.upload));
  assert.strictEqual(fs.readFileSync(store.getFilename(FID), 'utf8'), 'abcdef');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('append refuses a wrong offset without touching the file', async () => {
  const { dir, store } = await setup(6);
  await store.append(FID, Readable.from([Buffer.from('abc')]), 0);
  await assert.rejects(store.append(FID, Readable.from([Buffer.from('abc')]), 0), (err) => {
    assert.ok(err instanceof OffsetMismatch);
    assert.strictEqual(err.offset, 3);
    return true;
  });
  assert.strictEqual(fs.readFileSync(store.getFilename(FID), 'utf8'), 'abc');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('append rejects when the request stream breaks instead of hanging', async () => {
  const { dir, store } = await setup(6);
  const broken = new Readable({ read() {} });
  const pending = store.append(FID, broken, 0);
  broken.push('ab');
  setTimeout(() => broken.destroy(new Error('aborted')), 20);
  await assert.rejects(pending, /aborted/);
  // the bytes received so far stay, so the client can resume
  assert.strictEqual((await store.info(FID)).offset, 2);
  fs.rmSync(dir, { recursive: true, force: true });
});
