'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const totp = require('../../lib/totp');

// RFC 6238 appendix B, SHA1 seed "12345678901234567890"
const SEED = Buffer.from('12345678901234567890');

test('matches the RFC 6238 test vectors', () => {
  const vectors = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ];
  for (const [seconds, code] of vectors) {
    assert.strictEqual(totp.totp(SEED, seconds * 1000, { digits: 8 }), code, `T=${ seconds }`);
  }
});

test('base32 round-trips', () => {
  const secret = totp.generateSecret();
  assert.match(secret, /^[A-Z2-7]{32}$/);
  assert.strictEqual(totp.base32Encode(totp.base32Decode(secret)), secret);
  assert.strictEqual(totp.base32Encode(SEED), 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
});

test('verify accepts the neighbouring windows only', () => {
  const secret = totp.generateSecret();
  const now = 1700000000000;
  assert.ok(totp.verify(secret, totp.totp(secret, now), { time: now }) !== null);
  assert.ok(totp.verify(secret, totp.totp(secret, now - 30000), { time: now }) !== null);
  assert.strictEqual(totp.verify(secret, totp.totp(secret, now - 90000), { time: now }), null);
  assert.strictEqual(totp.verify(secret, 'abcdef', { time: now }), null);
  assert.strictEqual(totp.verify(secret, '', { time: now }), null);
});

test('otpauth url carries issuer and account', () => {
  const url = totp.otpauthUrl('ABC', 'me@example.com', 'Flyto');
  assert.ok(url.startsWith('otpauth://totp/Flyto%3Ame%40example.com?secret=ABC&issuer=Flyto'));
});
