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

test('a new upload reports offset 0 before any data', async () => {
  const { dir, store } = await setup(6);
  assert.strictEqual((await store.info(FID)).offset, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('an empty upload is complete as soon as it is created', async () => {
  const { dir, store } = await setup(0);
  const info = await store.info(FID);
  assert.ok(!('isPartial' in info));
  assert.strictEqual(info.offset, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('append to an unknown upload is not found and writes nothing', async () => {
  const { dir, store } = await setup(6);
  const fid = 'bucket++00000000-0000-4000-8000-000000000002';
  await assert.rejects(store.append(fid, Readable.from([Buffer.from('abc')]), 0), { status: 404 });
  assert.ok(!fs.existsSync(store.getFilename(fid)));
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

test('append refuses a body larger than the announced Upload-Length', async () => {
  const { dir, store } = await setup(6);
  await store.append(FID, Readable.from([Buffer.from('abcd')]), 0);
  await assert.rejects(store.append(FID, Readable.from([Buffer.from('efgh')]), 4, { contentLength: 4 }), { status: 413 });
  assert.strictEqual(fs.readFileSync(store.getFilename(FID), 'utf8'), 'abcd');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('append stops writing once a body without Content-Length goes past Upload-Length', async () => {
  const { dir, store } = await setup(6);
  const chunks = [Buffer.from('abc'), Buffer.from('def'), Buffer.from('ghi')];
  await assert.rejects(store.append(FID, Readable.from(chunks), 0), { status: 413 });
  // writes in flight may be dropped, the client resumes from the reported offset
  const written = fs.readFileSync(store.getFilename(FID), 'utf8');
  assert.ok('abcdef'.startsWith(written), written);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a second PATCH while one is being written is refused, the first one is kept', async () => {
  const { dir, store } = await setup(6);
  const slow = new Readable({ read() {} });
  const first = store.append(FID, slow, 0);
  slow.push('abc');
  await new Promise(resolve => setTimeout(resolve, 20));
  await assert.rejects(store.append(FID, Readable.from([Buffer.from('abc')]), 0), { status: 423 });
  slow.push(null);
  assert.strictEqual((await first).offset, 3);
  assert.strictEqual(fs.readFileSync(store.getFilename(FID), 'utf8'), 'abc');
  // the lock is gone once the first PATCH ended
  assert.strictEqual((await store.append(FID, Readable.from([Buffer.from('def')]), 3)).offset, 6);
  fs.rmSync(dir, { recursive: true, force: true });
});
