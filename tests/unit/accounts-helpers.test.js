'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { limitsFor, checkUpload, checkSpace } = require('../../lib/quotas');
const Settings = require('../../lib/settings');
const Cache = require('../../lib/cache');
const { anonymizeIp } = require('../../lib/utils');
const { parseCookies } = require('../../lib/auth');
const { setupCode } = require('../../lib/bootstrap');

const GiB = Math.pow(2, 30);

function settingsWith(values) {
  const s = new Settings(null);
  Object.assign(s.values, values);
  return s;
}

test('limits: 10 GiB per transfer by default, per-user override, 0 lifts it', () => {
  const settings = settingsWith({});
  assert.strictEqual(limitsFor({ role: 'user', quotaTransfer: null }, settings).transfer, 10 * GiB);
  assert.strictEqual(limitsFor({ role: 'user', quotaTransfer: 5 }, settings).transfer, 5);
  assert.strictEqual(limitsFor({ role: 'user', quotaTransfer: 0 }, settings).transfer, null);
  assert.strictEqual(limitsFor({ role: 'admin', quotaTransfer: 5 }, settings).transfer, null);
});

test('limits: the file limit never exceeds the transfer limit', () => {
  const settings = settingsWith({ maxFileSize: 100, maxTransferSize: 50 });
  assert.strictEqual(limitsFor({ role: 'user' }, settings).file, 50);
});

test('checkUpload refuses with the reason', () => {
  const limits = { transfer: 100, file: 60, storage: 150, transfers: 2, files: 3 };
  const ok = { limits, size: 10, bucketSize: 0, bucketFiles: 0, isNewBucket: true, usage: { storage: 0, transfers: 0 } };
  assert.strictEqual(checkUpload(ok), null);
  assert.strictEqual(checkUpload({ ...ok, size: 61 }).code, 'fileTooLarge');
  assert.strictEqual(checkUpload({ ...ok, bucketSize: 95 }).code, 'transferTooLarge');
  assert.strictEqual(checkUpload({ ...ok, bucketFiles: 3 }).code, 'tooManyFiles');
  assert.strictEqual(checkUpload({ ...ok, usage: { storage: 145, transfers: 0 } }).code, 'storageQuota');
  assert.strictEqual(checkUpload({ ...ok, usage: { storage: 0, transfers: 2 } }).code, 'transferQuota');
  // more files into an existing transfer do not count as a new one
  assert.strictEqual(checkUpload({ ...ok, isNewBucket: false, usage: { storage: 0, transfers: 2 } }), null);
});

test('checkSpace: total size of all transfers and free disk, admins included', () => {
  const settings = settingsWith({ maxTotalStorage: 1000, minFreeDisk: 100 });
  const totals = { size: 900, pending: 50 };
  assert.strictEqual(checkSpace({ settings, size: 100, totals, freeDisk: 500 }), null);
  assert.strictEqual(checkSpace({ settings, size: 101, totals, freeDisk: 500 }).code, 'serverFull');
  // bytes announced by unfinished uploads are not on the disk yet but will be
  assert.strictEqual(checkSpace({ settings, size: 60, totals, freeDisk: 200 }).code, 'serverFull');
  assert.strictEqual(checkSpace({ settings, size: 60, totals, freeDisk: null }), null);
  assert.strictEqual(checkSpace({ settings: settingsWith({ minFreeDisk: 0 }), size: 1e12, totals, freeDisk: 0 }), null);
});

test('settings validation', () => {
  assert.strictEqual(Settings.validate('maxTransferSize', '1024'), 1024);
  assert.strictEqual(Settings.validate('siteName', '  Flyto  '), 'Flyto');
  assert.throws(() => Settings.validate('passwordMinLength', 4), /between/);
  assert.throws(() => Settings.validate('registrationMode', 'everyone'), /one of/);
  assert.throws(() => Settings.validate('termsUrl', 'javascript:alert(1)'), /URL/);
  assert.throws(() => Settings.validate('nope', 1), /Unknown/);
  assert.deepStrictEqual(Settings.validate('retentions', ['one-time', '604800']), ['604800', 'one-time']);
});

test('settings: e-mail domains and blocked extensions', () => {
  const settings = settingsWith({ allowedEmailDomains: 'example.com, @corp.fr', blockedExtensions: '.exe, bat' });
  assert.ok(settings.emailDomainAllowed('a@example.com'));
  assert.ok(settings.emailDomainAllowed('a@team.corp.fr'));
  assert.ok(!settings.emailDomainAllowed('a@example.com.evil.org'));
  assert.strictEqual(settings.blockedExtension('Setup.EXE'), 'exe');
  assert.strictEqual(settings.blockedExtension('notes.txt'), null);
});

test('settings: secrets are masked unless asked for', () => {
  const settings = settingsWith({ smtpPass: 'hunter2' });
  assert.strictEqual(settings.all().smtpPass, '********');
  assert.strictEqual(settings.all({ secrets: true }).smtpPass, 'hunter2');
  assert.ok(!('smtpPass' in settings.public()));
});

test('memory cache: TTL and fixed window counter', async () => {
  const cache = new Cache('');
  await cache.set('a', { x: 1 }, 60);
  assert.deepStrictEqual(await cache.get('a'), { x: 1 });
  await cache.set('b', 1, -1);
  assert.strictEqual(await cache.get('b'), undefined);
  assert.strictEqual(await cache.hit('rl', 60), 1);
  assert.strictEqual(await cache.hit('rl', 60), 2);
  assert.strictEqual(await cache.get('rl'), 2);
  await cache.clear();
  assert.strictEqual(await cache.get('a'), undefined);
});

test('anonymizeIp keeps the network only', () => {
  assert.strictEqual(anonymizeIp('192.168.1.42'), '192.168.1.0');
  assert.strictEqual(anonymizeIp('::ffff:10.0.0.7'), '10.0.0.0');
  assert.strictEqual(anonymizeIp('2001:db8:85a3::8a2e:370:7334'), '2001:db8:85a3::');
  assert.strictEqual(anonymizeIp(''), null);
});

test('parseCookies', () => {
  assert.deepStrictEqual({ ...parseCookies('a=1; flyto_session=abc%3D; b') }, { a: '1', flyto_session: 'abc=' });
  assert.deepStrictEqual({ ...parseCookies(undefined) }, {});
});

test('setup codes are easy to type', () => {
  assert.match(setupCode(), /^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/);
});

test('rateLimit counts per IP, or per key only when a key is given', async () => {
  const createAuth = require('../../lib/auth');
  const auth = createAuth({ sessions: null, settings: null, cache: new Cache('') });
  const call = async (mw, email) => {
    let status = 200;
    const res = { set() {}, status(s) { status = s; return this; }, json() {} };
    await mw({ ip: '1.2.3.4', body: { email } }, res, () => {});
    return status;
  };
  const perIp = auth.rateLimit('t-ip', 2, 60);
  assert.deepStrictEqual([await call(perIp), await call(perIp), await call(perIp)], [200, 200, 429]);

  const perAccount = auth.rateLimit('t-acc', 2, 60, req => req.body.email);
  const statuses = [];
  for (const email of ['a@x', 'a@x', 'b@x', 'b@x', 'a@x']) statuses.push(await call(perAccount, email));
  // other accounts from the same IP are not blocked by this limiter
  assert.deepStrictEqual(statuses, [200, 200, 200, 200, 429]);
});
