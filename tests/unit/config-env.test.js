'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '../..');

// config.js reads the environment once, at require time
function loadConfig(env) {
  const out = execFileSync(process.execPath, ['-e', 'process.stdout.write(JSON.stringify(require("./config")))'], {
    cwd: root,
    env: { PATH: process.env.PATH, ...env },
  });
  return JSON.parse(out);
}

test('"false" disables boolean and numeric options', () => {
  const config = loadConfig({
    FLYTO_REQUIRE_BUCKET_PASSWORD: 'false',
    FLYTO_DISABLE_QR_CODE: 'false',
    FLYTO_PORT: 'false',
    FLYTO_ACCESS_LOG: 'false',
  });
  assert.strictEqual(config.requireBucketPassword, false);
  assert.strictEqual(config.disableQrCode, false);
  assert.strictEqual(config.port, false);
  assert.strictEqual(config.accessLog, false);
});

test('"true" enables boolean options', () => {
  const config = loadConfig({ FLYTO_REQUIRE_BUCKET_PASSWORD: 'true', FLYTO_DISABLE_QR_CODE: 'true' });
  assert.strictEqual(config.requireBucketPassword, true);
  assert.strictEqual(config.disableQrCode, true);
});

test('options without default accept urls and numbers', () => {
  const config = loadConfig({
    FLYTO_FILE_DOWNLOADED_WEBHOOK: 'https://example.com/hook',
    FLYTO_MAX_FILE_SIZE: '1048576',
  });
  assert.strictEqual(config.fileDownloadedWebhook, 'https://example.com/hook');
  assert.strictEqual(config.maxFileSize, 1048576);
});

test('passwords, numbers, lists and objects keep their type', () => {
  const config = loadConfig({
    FLYTO_ADMIN_PASS: 'secret',
    FLYTO_PORT: '8080',
    FLYTO_PLUGINS: 'file-uploaded-webhook',
    FLYTO_RETENTIONS: '{"3600":"1 Hour"}',
    PSITRANSFER_DEFAULT_RETENTION: '3600',
  });
  assert.strictEqual(config.adminPass, 'secret');
  assert.strictEqual(config.port, 8080);
  assert.deepStrictEqual(config.plugins, ['file-uploaded-webhook']);
  assert.deepStrictEqual(config.retentions, { 3600: '1 Hour' });
  assert.strictEqual(config.defaultRetention, '3600');
});
