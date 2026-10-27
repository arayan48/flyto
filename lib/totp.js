'use strict';
const { createHmac, randomBytes, timingSafeEqual } = require('node:crypto');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const char of clean) {
    const i = ALPHABET.indexOf(char);
    if (i === -1) throw new Error('invalid base32');
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function generateSecret() {
  return base32Encode(randomBytes(20));
}

function hotp(secret, counter, digits = 6, algorithm = 'sha1') {
  const key = Buffer.isBuffer(secret) ? secret : base32Decode(secret);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac(algorithm, key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % Math.pow(10, digits);
  return String(code).padStart(digits, '0');
}

function totp(secret, time = Date.now(), { step = 30, digits = 6, algorithm = 'sha1' } = {}) {
  return hotp(secret, Math.floor(time / 1000 / step), digits, algorithm);
}

/**
 * Accepts the previous and next 30 s window for clock drift.
 * @returns {number|null} the matched time step, to refuse a replay of the same code
 */
function verify(secret, code, { time = Date.now(), window = 1, step = 30 } = {}) {
  const given = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(given)) return null;
  const counter = Math.floor(time / 1000 / step);
  for (let i = -window; i <= window; i++) {
    const expected = hotp(secret, counter + i);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(given))) return counter + i;
  }
  return null;
}

function otpauthUrl(secret, account, issuer) {
  const label = encodeURIComponent(`${ issuer }:${ account }`);
  return `otpauth://totp/${ label }?secret=${ secret }&issuer=${ encodeURIComponent(issuer) }&algorithm=SHA1&digits=6&period=30`;
}

module.exports = { base32Encode, base32Decode, generateSecret, hotp, totp, verify, otpauthUrl };
