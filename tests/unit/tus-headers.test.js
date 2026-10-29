'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const parser = require('../../lib/tusboy/tus-header-parser');
const tusMeta = require('../../lib/tusboy/tus-metadata');

function parse(headers) {
  const req = { headers };
  parser()(req, null, () => {});
  return req.tus;
}

test('lengths and offsets are plain non-negative integers', () => {
  assert.deepStrictEqual(parse({ 'upload-length': '10', 'upload-offset': '0' }), { uploadLength: 10, uploadOffset: 0 });
  for (const bad of ['007', '-1', '1.5', '1e3', '', '99999999999999999999']) {
    assert.strictEqual(parse({ 'upload-length': bad }).uploadLength, undefined, bad);
  }
});

test('metadata keeps only well formed pairs and survives a round trip', () => {
  const meta = { name: 'été.txt', sid: 'abc' };
  assert.deepStrictEqual(tusMeta.decode(tusMeta.encode(meta)), meta);
  assert.deepStrictEqual(tusMeta.decode('name ' + Buffer.from('a').toString('base64') + ',broken,a b c, eA=='), { name: 'a' });
  assert.strictEqual(Object.getPrototypeOf(tusMeta.decode('__proto__ eA==')), Object.prototype);
});
