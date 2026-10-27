'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const utils = require('../../lib/utils');

test('decodePasswordHeader decodes URI-encoded non-ASCII passwords', () => {
  assert.strictEqual(utils.decodePasswordHeader(encodeURIComponent('cœur€パスワード')), 'cœur€パスワード');
});

test('decodePasswordHeader keeps plain ASCII passwords unchanged', () => {
  assert.strictEqual(utils.decodePasswordHeader('secret123'), 'secret123');
});

test('decodePasswordHeader falls back to raw value on malformed encoding', () => {
  assert.strictEqual(utils.decodePasswordHeader('100%'), '100%');
});

test('decodePasswordHeader returns empty string for missing header', () => {
  assert.strictEqual(utils.decodePasswordHeader(undefined), '');
});

test('safeEqual compares strings of different lengths', () => {
  assert.strictEqual(utils.safeEqual('abc', 'abcd'), false);
  assert.strictEqual(utils.safeEqual('abc', 'abc'), true);
});
