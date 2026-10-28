'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Readable } = require('stream');

const Store = require('../../lib/store');
const DB = require('../../lib/db');

// in-memory stand-in for MetadataDb, these tests only exercise the DB index
class MemoryMetadata {
  constructor() { this.files = new Map(); }
  async get(fid) { return this.files.has(fid) ? structuredClone(this.files.get(fid)) : null; }
  async set(fid, data) { this.files.set(fid, structuredClone(data)); }
  async delete(fid) { this.files.delete(fid); }
  async fids() { return [...this.files.keys()]; }
  async importLegacyJson() { return 0; }
  async transfers() { return []; }
  async createTransfer() {}
  async updateTransfer() {}
  async deleteTransfer() {}
}

const KEY = '00000000-0000-4000-8000-00000000000a';
const FID = `bucket++${ KEY }`;

// the state of an upload in progress: a reservation in memory, the tus record in the store
async function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flyto-db-meta-'));
  const store = new Store(dir, new MemoryMetadata());
  const db = new DB(dir, store);
  await db.init();
  const meta = { sid: 'bucket', name: 'a.txt', retention: '3600', createdAt: String(Date.now()) };
  db.add('bucket', KEY, { isPartial: true, metadata: meta });
  await store.create(FID, { uploadLength: 6, metadata: meta });
  return { dir, store, db };
}

test('locking a bucket keeps the Upload-Length of an unfinished upload', async () => {
  const { dir, store, db } = await setup();
  try {
    await db.lock('bucket');
    const stored = await store.metadata.get(FID);
    assert.strictEqual(stored.uploadLength, 6);
    assert.strictEqual(stored.isPartial, true);
    assert.strictEqual(stored.metadata.buckedLocked, true);
    assert.strictEqual(stored.metadata.name, 'a.txt');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('an upload still completes after its expiration changed mid-way', async () => {
  const { dir, store, db } = await setup();
  try {
    await store.append(FID, Readable.from([Buffer.from('abc')]), 0);
    const expiresAt = Date.now() + 3600000;
    await db.setExpiration('bucket', expiresAt);
    const { upload } = await store.append(FID, Readable.from([Buffer.from('def')]), 3);
    assert.ok(!('isPartial' in upload));
    assert.strictEqual(upload.metadata.expiresAt, expiresAt);
    // the size limit still applies
    await assert.rejects(store.append(FID, Readable.from([Buffer.from('g')]), 6, { contentLength: 1 }), { status: 413 });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
