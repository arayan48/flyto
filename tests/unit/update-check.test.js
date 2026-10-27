'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const updateCheck = require('../../lib/updateCheck');
const { compareVersions, check, isEnabled, state } = updateCheck;

function fakeFetch(status, body) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts });
    return {
      status,
      ok: status >= 200 && status < 300,
      statusText: String(status),
      json: async () => body,
    };
  };
  fn.calls = calls;
  return fn;
}

test('compareVersions orders releases and pre-releases', () => {
  assert.strictEqual(compareVersions('v0.2.0', '0.1.0'), 1);
  assert.strictEqual(compareVersions('0.1.0', 'v0.1.0'), 0);
  assert.strictEqual(compareVersions('0.1.9', '0.1.10'), -1);
  assert.strictEqual(compareVersions('1.0.0', '0.99.99'), 1);
  assert.strictEqual(compareVersions('0.2.0', '0.2.0-rc.1'), 1);
  assert.strictEqual(compareVersions('0.2.0-rc.1', '0.2.0'), -1);
  assert.strictEqual(compareVersions('0.2.0-rc.2', '0.2.0-rc.10'), -1);
  assert.strictEqual(compareVersions('0.2.0-rc.1', '0.2.0-beta.1'), 1);
  assert.strictEqual(compareVersions('0.2.0-rc', '0.2.0-rc.1'), -1);
  assert.strictEqual(compareVersions('dev', '0.1.0'), 0);
});

test('isEnabled accepts the string coming from FLYTO_UPDATE_CHECK', () => {
  assert.strictEqual(isEnabled({ updateCheck: true }), true);
  assert.strictEqual(isEnabled({ updateCheck: 'true' }), true);
  assert.strictEqual(isEnabled({ updateCheck: 'false' }), false);
  assert.strictEqual(isEnabled({ updateCheck: false }), false);
});

test('check flags a newer release', async (t) => {
  t.mock.method(console, 'log', () => {});
  state.current = '0.1.0';
  const fetch = fakeFetch(200, {
    tag_name: 'v0.2.0',
    html_url: 'https://github.com/arayan48/flyto/releases/tag/v0.2.0',
    published_at: '2026-11-01T10:00:00Z',
  });
  await check('arayan48/flyto', fetch);

  assert.strictEqual(fetch.calls[0].url, 'https://api.github.com/repos/arayan48/flyto/releases/latest');
  assert.strictEqual(state.latest, 'v0.2.0');
  assert.strictEqual(state.updateAvailable, true);
  assert.ok(state.checkedAt);
  assert.strictEqual(console.log.mock.callCount(), 1);

  await check('arayan48/flyto', fetch);
  assert.strictEqual(console.log.mock.callCount(), 1, 'same release is only logged once');
});

test('check stays quiet when up to date or nothing is published', async () => {
  state.current = '0.2.0';
  await check('arayan48/flyto', fakeFetch(200, { tag_name: 'v0.2.0' }));
  assert.strictEqual(state.updateAvailable, false);

  state.latest = null;
  await check('arayan48/flyto', fakeFetch(404, { message: 'Not Found' }));
  assert.strictEqual(state.latest, null);
  assert.strictEqual(state.updateAvailable, false);
});

test('check rejects on GitHub errors', async () => {
  await assert.rejects(check('arayan48/flyto', fakeFetch(403, {})), /403/);
});
