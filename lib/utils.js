const path = require('path');
const { timingSafeEqual } = require('node:crypto');

// control characters, NUL included: some tools cut a path there
const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F]/g;

function toSafeBasename(input, fallback = 'file', opts = {}) {
  const maxLength = Number.isInteger(opts.maxLength) ? opts.maxLength : 255;

  let name = '';
  if (typeof input === 'string') name = input;
  else if (input == null) name = '';
  else name = String(input);

  name = name.replace(CONTROL_CHARS_RE, '');

  // archives are flat: only the last segment of a path
  name = name.replace(/\\/g, '/');
  name = path.posix.basename(name);

  name = name.trim();

  if (!name || name === '.' || name === '..') name = '';

  if (name.length > maxLength) name = name.slice(0, maxLength);

  if (!name) {
    const fb = (fallback == null ? '' : String(fallback)).replace(CONTROL_CHARS_RE, '').trim();
    return fb ? fb.slice(0, maxLength) : 'file';
  }

  return name;
}

function isSafeBasename(name, opts = {}) {
  if (typeof name !== 'string') return false;
  return toSafeBasename(name, '', opts) === name;
}

// the keys given by randomUUID()
const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Tus resume URL id: exactly one "++", safe bucket sid, UUID key.
 */
function isSafeTusUploadId(uploadId) {
  if (typeof uploadId !== 'string' || uploadId.includes('\0')) return false;
  const parts = uploadId.split('++');
  if (parts.length !== 2) return false;
  const [sid, key] = parts;
  if (!sid || !key) return false;
  return isSafeBasename(sid) && UUID_V4_RE.test(key);
}

/**
 * Bucket-only id (lock PATCH, middleware checks without "++").
 */
function isSafeBucketFid(fid) {
  if (typeof fid !== 'string' || fid.includes('++') || fid.includes('\0')) return false;
  return isSafeBasename(fid);
}

// Password headers are sent URI-encoded so non-Latin-1 characters survive HTTP.
// Falls back to the raw value for clients sending unencoded passwords.
function decodePasswordHeader(value) {
  if (typeof value !== 'string' || value === '') return '';
  try {
    return decodeURIComponent(value);
  } catch (e) {
    return value;
  }
}

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// keeps the network, drops the host: /24 for IPv4, /48 for IPv6
function anonymizeIp(ip) {
  if (typeof ip !== 'string' || !ip) return null;
  const v4 = /^(?:::ffff:)?(\d+\.\d+\.\d+)\.\d+$/.exec(ip);
  if (v4) return v4[1] + '.0';
  if (ip.includes(':')) {
    const groups = ip.split('::')[0].split(':').filter(Boolean).slice(0, 3);
    while (groups.length < 3) groups.push('0');
    return groups.join(':') + '::';
  }
  return null;
}

module.exports = {
  anonymizeIp,
  toSafeBasename,
  isSafeBasename,
  isSafeTusUploadId,
  isSafeBucketFid,
  UUID_V4_RE,
  decodePasswordHeader,
  safeEqual,
};


