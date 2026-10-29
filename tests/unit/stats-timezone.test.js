'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const path = require('path');

function resolvedWith(tz) {
  const env = { ...process.env };
  if (tz === undefined) delete env.TZ;
  else env.TZ = tz;
  const script = `process.stdout.write(require(${ JSON.stringify(path.join(__dirname, '../../lib/stats')) }).resolveTimezone())`;
  return execFileSync(process.execPath, ['-e', script], { env }).toString();
}

test('keeps a valid TZ', () => {
  assert.strictEqual(resolvedWith('Europe/Paris'), 'Europe/Paris');
});

test('falls back to UTC instead of Etc/Unknown', () => {
  assert.strictEqual(resolvedWith('Nowhere/Invalid'), 'UTC');
  assert.strictEqual(resolvedWith(''), 'UTC');
});
