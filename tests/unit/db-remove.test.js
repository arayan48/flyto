'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

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

const KEY_A = '00000000-0000-4000-8000-00000000000a';
const KEY_B = '00000000-0000-4000-8000-00000000000b';

async function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-db-'));
  const store = new Store(dir, new MemoryMetadata());
  const db = new DB(dir, store);
  await db.init();
  fs.mkdirSync(path.join(dir, 'bucket'));
  for (const key of [KEY_A, KEY_B]) {
    fs.writeFileSync(path.join(dir, 'bucket', key), 'x');
    await store.metadata.set(`bucket++${ key }`, {});
    db.add('bucket', key, { metadata: { sid: 'bucket', key } });
  }
  return { dir, db };
}

test('concurrent remove of the same file neither throws nor removes other files', async () => {
  const { dir, db } = await setup();
  try {
    await Promise.all([db.remove('bucket', KEY_A), db.remove('bucket', KEY_A)]);
    assert.deepStrictEqual(db.get('bucket').map(f => f.key), [KEY_B]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('remove tolerates an already deleted bucket', async () => {
  const { dir, db } = await setup();
  try {
    await Promise.all([
      db.remove('bucket', KEY_A),
      db.remove('bucket', KEY_B),
      db.remove('bucket', KEY_B),
    ]);
    assert.strictEqual(db.get('bucket'), undefined);
    await db.remove('bucket', KEY_A);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('claim is exclusive until released', async () => {
  const { dir, db } = await setup();
  try {
    assert.strictEqual(db.claim('bucket', KEY_A), true);
    assert.strictEqual(db.claim('bucket', KEY_A), false);
    assert.strictEqual(db.isClaimed('bucket', KEY_A), true);
    db.release('bucket', KEY_A);
    assert.strictEqual(db.claim('bucket', KEY_A), true);
    assert.strictEqual(db.claim('bucket', 'unknown'), false);
    assert.strictEqual(db.claim('nobucket', KEY_A), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('bucket ids that are Object.prototype keys are plain buckets', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-db-'));
  const db = new DB(dir, new Store(dir, new MemoryMetadata()));
  await db.init();
  for (const sid of ['__proto__', 'constructor', 'toString']) {
    assert.strictEqual(db.get(sid), undefined);
    db.add(sid, KEY_A, { metadata: { sid, key: KEY_A } });
    assert.strictEqual(db.get(sid).length, 1);
  }
  assert.deepStrictEqual(Object.keys(JSON.parse(JSON.stringify(db.db))), ['__proto__', 'constructor', 'toString']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('updating a file of a removed bucket is a no-op', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-db-'));
  const db = new DB(dir, new Store(dir, new MemoryMetadata()));
  await db.init();
  await db.updateLastDownload('gone', KEY_A);
  await db.updateMetadata('gone', KEY_A, { foo: 1 });
  fs.rmSync(dir, { recursive: true, force: true });
});
