'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const head = require('../../lib/tusboy/handlers/head');
const tusMeta = require('../../lib/tusboy/tus-metadata');

const FID = 'bucket++00000000-0000-4000-8000-000000000001';

function fakeRes() {
  return {
    headers: {},
    ended: false,
    set(name, value) { this.headers[name] = value; },
    end() { this.ended = true; },
  };
}

test('HEAD answers for a downloaded, locked file and never sends the password hash', async () => {
  const store = {
    info: async () => ({
      uploadLength: 3,
      offset: 3,
      metadata: {
        name: 'a.txt', sid: 'bucket', password: 'stored-hash',
        buckedLocked: true, lastDownload: Date.now(), expiresAt: Date.now() + 1000,
      },
    }),
  };
  const res = fakeRes();
  await head(store)({ params: { uploadId: FID } }, res);
  assert.ok(res.ended);
  assert.strictEqual(res.headers['Upload-Offset'], 3);
  assert.deepStrictEqual(tusMeta.decode(res.headers['Upload-Metadata']), { name: 'a.txt', sid: 'bucket' });
});
