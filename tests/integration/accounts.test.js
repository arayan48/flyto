'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('node:http');
const { Pool } = require('pg');

const { url, skip } = require('../helpers/db');
const { test, before, after } = require('node:test');
if (skip) return test('accounts', { skip });
process.env.FLYTO_DB_URL = url;

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flyto-accounts-'));
process.env.FLYTO_UPLOAD_DIR = tmpDir;
process.env.FLYTO_ADMIN_EMAIL = '';
process.env.FLYTO_ADMIN_PASSWORD = '';

const assert = require('node:assert');
const tusMeta = require('../../lib/tusboy/tus-metadata');
const totp = require('../../lib/totp');

const TUS = { 'Tus-Resumable': '1.0.0' };
const PASSWORD = 'correct horse battery';

let app;
let server;
let base;

/** A browser: keeps the session cookie and the CSRF token. */
class Client {
  constructor() {
    this.cookie = '';
    this.csrf = null;
  }

  async request(method, pathname, { json, body, headers = {} } = {}) {
    const h = { ...headers };
    if (this.cookie) h.cookie = this.cookie;
    if (this.csrf) h['x-csrf-token'] = this.csrf;
    if (json !== undefined) {
      h['content-type'] = 'application/json';
      body = JSON.stringify(json);
    }
    const res = await fetch(base + pathname, { method, headers: h, body, redirect: 'manual' });
    const set = res.headers.getSetCookie().find(c => c.startsWith('flyto_session='));
    if (set) {
      const value = set.split(';')[0];
      this.cookie = value === 'flyto_session=' ? '' : value;
    }
    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = text;
    }
    if (data && data.csrf) this.csrf = data.csrf;
    return { status: res.status, data, headers: res.headers };
  }

  get(p) { return this.request('GET', p); }
  post(p, json = {}) { return this.request('POST', p, { json }); }
  patch(p, json = {}) { return this.request('PATCH', p, { json }); }
  del(p) { return this.request('DELETE', p); }

  async login(email, password = PASSWORD, extra = {}) {
    return this.post('/api/auth/login', { email, password, ...extra });
  }

  async upload(sid, content, name = 'a.txt', extraMeta = {}) {
    const created = await this.request('POST', '/files/', {
      headers: {
        ...TUS,
        'Upload-Length': String(content.length),
        'Upload-Metadata': tusMeta.encode({ name, sid, retention: '3600', ...extraMeta }),
      },
    });
    if (created.status !== 201) return created;
    const fid = decodeURIComponent(created.headers.get('location').split('/').pop());
    const patched = await this.request('PATCH', `/files/${ encodeURIComponent(fid) }`, {
      headers: { ...TUS, 'Upload-Offset': '0', 'Content-Type': 'application/offset+octet-stream' },
      body: content,
    });
    return { status: patched.status, fid };
  }
}

const admin = new Client();
const alice = new Client();
const bob = new Client();

before(async () => {
  // a known starting point: no account, so the instance asks for its setup
  const pool = new Pool({ connectionString: url });
  await require('../../lib/migrations').migrate(pool);
  await pool.query('TRUNCATE users, sessions, invites, settings, audit_log, transfers RESTART IDENTITY CASCADE');
  await pool.end();

  app = require('../../lib/endpoints');
  await app.ready;
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${ server.address().port }`;
});

after(async () => {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('a fresh instance asks for the setup code before creating the admin', async () => {
  assert.strictEqual((await admin.get('/api/session')).data.setupRequired, true);
  const wrong = await admin.post('/api/setup', { token: 'AAAA-AAAA-AAAA-AAAA', email: 'root@flyto.test', password: PASSWORD });
  assert.strictEqual(wrong.status, 403);

  const ok = await admin.post('/api/setup', {
    token: app.ctx.bootstrap.setupToken, email: 'root@flyto.test', name: 'Root', password: PASSWORD,
  });
  assert.strictEqual(ok.status, 201);
  assert.strictEqual(ok.data.user.role, 'admin');
  assert.ok(admin.cookie);

  const again = await new Client().post('/api/setup', { token: 'x', email: 'evil@flyto.test', password: PASSWORD });
  assert.strictEqual(again.status, 409);
});

test('pages show the running version and the brand logo', async () => {
  const { version } = require('../../package.json');
  const visitor = new Client();
  for (const [client, page] of [[visitor, '/'], [visitor, '/login'], [admin, '/admin']]) {
    const res = await client.get(page);
    assert.strictEqual(res.status, 200, page);
    assert.ok(res.data.includes(`Flyto v${ version }`), page);
    assert.ok(res.data.includes('class="site-logo"'), page);
  }
});

test('the legal notice and privacy pages follow the settings', async () => {
  await admin.patch('/api/admin/settings', {
    legalPublisher: 'Jeanne <Test>', legalHost: 'Serveur perso', contactEmail: 'contact@flyto.test', anonymizeIps: false,
  });
  const visitor = new Client();
  const legal = await visitor.get('/legal');
  assert.strictEqual(legal.status, 200);
  assert.ok(legal.data.includes('Jeanne &lt;Test&gt;'));
  assert.ok(legal.data.includes('Serveur perso'));
  assert.ok(legal.data.includes('contact@flyto.test'));
  const privacy = await visitor.get('/privacy');
  assert.strictEqual(privacy.status, 200);
  assert.ok(privacy.data.includes('href="legal"'), 'footer links the legal notice');
  assert.ok(!privacy.data.includes('PsiTransfer'));
  await admin.patch('/api/admin/settings', { legalPublisher: '', legalHost: '', contactEmail: '', anonymizeIps: true });
});

test('the admin page needs an admin', async () => {
  const anonymous = await new Client().get('/admin');
  assert.strictEqual(anonymous.status, 302);
  assert.match(anonymous.headers.get('location'), /login\?next=admin/);
  assert.strictEqual((await new Client().get('/api/admin/stats')).status, 401);
});

test('uploads need an account', async () => {
  const res = await new Client().upload('anonsid0001', Buffer.from('hello'));
  assert.strictEqual(res.status, 401);
});

test('state changing calls need the CSRF token', async () => {
  const noToken = new Client();
  noToken.cookie = admin.cookie;
  const res = await noToken.post('/api/admin/users', { email: 'x@flyto.test' });
  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.data.error, 'csrf');
});

test('the admin creates accounts, users log in and upload', async () => {
  for (const email of ['alice@flyto.test', 'bob@flyto.test']) {
    const res = await admin.post('/api/admin/users', { email, password: PASSWORD });
    assert.strictEqual(res.status, 201, JSON.stringify(res.data));
  }
  assert.strictEqual((await alice.login('alice@flyto.test')).status, 200);
  assert.strictEqual((await bob.login('bob@flyto.test')).status, 200);

  const config = await alice.get('/config.json');
  assert.strictEqual(config.data.loginRequired, false);
  assert.strictEqual(config.data.maxBucketSize, 10 * Math.pow(2, 30));

  const up = await alice.upload('alicesid0001', Buffer.from('hello'));
  assert.strictEqual(up.status, 204);
  const mine = await alice.get('/api/me/transfers');
  assert.deepStrictEqual(mine.data.map(t => t.sid), ['alicesid0001']);
  assert.strictEqual(mine.data[0].size, 5);
});

test('nobody else can add files to a transfer', async () => {
  const res = await bob.upload('alicesid0001', Buffer.from('intruder'));
  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.data.error, 'notOwner');
});

test('downloads need no account', async () => {
  const res = await new Client().get('/alicesid0001.json');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.data.items[0].metadata.name, 'a.txt');
  assert.strictEqual(res.data.items[0].metadata.password, undefined);
});

test('quotas are enforced per user', async () => {
  const { data: { items } } = await admin.get('/api/admin/users?q=bob');
  const bobId = items[0].id;
  assert.strictEqual((await admin.patch(`/api/admin/users/${ bobId }`, { quotaTransfer: 10 })).status, 200);

  const tooBig = await bob.upload('bobsid000001', Buffer.alloc(11, 'x'));
  assert.strictEqual(tooBig.status, 413);
  assert.strictEqual(tooBig.data.error, 'transferTooLarge');
  assert.strictEqual((await bob.upload('bobsid000001', Buffer.alloc(10, 'x'))).status, 204);

  // 0 lifts the limit for this user
  await admin.patch(`/api/admin/users/${ bobId }`, { quotaTransfer: 0, quotaTransfers: 1 });
  const second = await bob.upload('bobsid000002', Buffer.alloc(20, 'x'));
  assert.strictEqual(second.status, 413);
  assert.strictEqual(second.data.error, 'transferQuota');
  await admin.patch(`/api/admin/users/${ bobId }`, { quotaTransfers: null });
});

test('blocked extensions and required passwords are checked on the server', async () => {
  await admin.patch('/api/admin/settings', { blockedExtensions: 'exe, bat', requireTransferPassword: true });
  const exe = await alice.upload('alicesid0002', Buffer.from('MZ'), 'setup.EXE', { password: 'pw' });
  assert.strictEqual(exe.status, 415);
  const noPassword = await alice.upload('alicesid0002', Buffer.from('hi'), 'a.txt');
  assert.strictEqual(noPassword.status, 400);
  assert.strictEqual(noPassword.data.error, 'passwordRequired');
  await admin.patch('/api/admin/settings', { blockedExtensions: '', requireTransferPassword: false });
});

test('a suspended transfer cannot be downloaded', async () => {
  assert.strictEqual((await admin.post('/api/admin/transfers/alicesid0001/suspend', { reason: 'abuse' })).status, 200);
  assert.strictEqual((await new Client().get('/alicesid0001.json')).status, 451);
  assert.strictEqual((await new Client().get('/alicesid0001')).status, 451);
  await admin.post('/api/admin/transfers/alicesid0001/unsuspend');
  assert.strictEqual((await new Client().get('/alicesid0001.json')).status, 200);
});

test('admins see every transfer and users only theirs', async () => {
  const all = await admin.get('/api/admin/transfers');
  assert.ok(all.data.items.some(t => t.sid === 'alicesid0001' && t.ownerEmail === 'alice@flyto.test'));
  assert.strictEqual((await alice.get('/api/admin/transfers')).status, 403);
  assert.strictEqual((await bob.del('/api/me/transfers/alicesid0001')).status, 404);
});

test('failed logins lock the account for a while', async () => {
  const mallory = new Client();
  for (let i = 0; i < 5; i++) {
    assert.strictEqual((await mallory.login('bob@flyto.test', 'wrong password!')).status, 401);
  }
  const locked = await mallory.login('bob@flyto.test');
  assert.strictEqual(locked.status, 429);
  assert.strictEqual(locked.data.error, 'accountLocked');

  const { data: { items } } = await admin.get('/api/admin/users?q=bob');
  await admin.post(`/api/admin/users/${ items[0].id }/unlock`);
  assert.strictEqual((await new Client().login('bob@flyto.test')).status, 200);
});

test('failed logins long ago do not count toward the lock', async () => {
  const created = await admin.post('/api/admin/users', { email: 'erin@flyto.test', password: PASSWORD });
  assert.strictEqual(created.status, 201);
  const pool = new Pool({ connectionString: url });
  // one failure away from the lock, but a day ago
  await pool.query('UPDATE users SET failed_logins = 4, last_failed_login_at = $2 WHERE id = $1',
    [created.data.user.id, Date.now() - 86400000]);
  assert.strictEqual((await new Client().login('erin@flyto.test', 'wrong password!')).status, 401);
  const { rows: [row] } = await pool.query('SELECT failed_logins, locked_until FROM users WHERE id = $1', [created.data.user.id]);
  await pool.end();
  assert.strictEqual(row.failed_logins, 1);
  assert.strictEqual(row.locked_until, null);
});

test('admin forms refuse invalid values instead of failing', async () => {
  const quota = await admin.post('/api/admin/users', { email: 'frank@flyto.test', quotaStorage: 'abc', sendEmail: false });
  assert.strictEqual(quota.status, 400);
  assert.strictEqual(quota.data.error, 'invalidQuota');
  assert.strictEqual((await admin.post('/api/admin/invites/abc/revoke')).status, 404);
  assert.strictEqual((await admin.del('/api/admin/invites/abc')).status, 404);
  const bulk = await admin.post('/api/admin/transfers/bulk', { sids: ['nothing0'], action: 'explode' });
  assert.strictEqual(bulk.status, 400);
  assert.strictEqual(bulk.data.error, 'invalidAction');
});

test('two-factor authentication with a recovery code', async () => {
  const setup = await alice.post('/api/me/2fa/setup', { password: PASSWORD });
  assert.strictEqual(setup.status, 200);
  const enabled = await alice.post('/api/me/2fa/enable', { code: totp.totp(setup.data.secret) });
  assert.strictEqual(enabled.status, 200);
  assert.strictEqual(enabled.data.recoveryCodes.length, 10);

  const phone = new Client();
  const first = await phone.login('alice@flyto.test');
  assert.deepStrictEqual(first.data, { mfaRequired: true });
  assert.ok(!phone.cookie);
  assert.strictEqual((await phone.login('alice@flyto.test', PASSWORD, { code: '000000' })).status, 401);

  const recovery = enabled.data.recoveryCodes[0];
  assert.strictEqual((await phone.login('alice@flyto.test', PASSWORD, { code: recovery })).status, 200);
  // each recovery code works once
  assert.strictEqual((await new Client().login('alice@flyto.test', PASSWORD, { code: recovery })).status, 401);
});

test('an invitation creates exactly as many accounts as it allows', async () => {
  await admin.patch('/api/admin/settings', { registrationMode: 'invite' });
  assert.strictEqual((await new Client().post('/api/auth/register', { email: 'c@flyto.test', password: PASSWORD })).status, 403);

  const { data } = await admin.post('/api/admin/invites', { maxUses: 1, sendEmail: false });
  const token = new URL(data.link).searchParams.get('invite');
  const results = await Promise.all(['carol@flyto.test', 'dave@flyto.test'].map(email =>
    new Client().post('/api/auth/register', { email, password: PASSWORD, invite: token })));
  assert.deepStrictEqual(results.map(r => r.status).sort(), [201, 400]);

  await admin.patch('/api/admin/settings', { registrationMode: 'closed' });
  const closed = await new Client().post('/api/auth/register', { email: 'e@flyto.test', password: PASSWORD, invite: token });
  assert.strictEqual(closed.status, 403);
});

test('a reset link sets a new password once and closes the sessions', async () => {
  const user = await app.ctx.accounts.getByEmail('bob@flyto.test');
  const token = await app.ctx.accounts.createToken(user.id, 'reset', 3600);
  const tooShort = await new Client().post('/api/auth/reset', { token, password: 'short' });
  assert.strictEqual(tooShort.status, 400);
  assert.strictEqual((await new Client().post('/api/auth/reset', { token, password: 'a brand new password' })).status, 200);
  assert.strictEqual((await new Client().post('/api/auth/reset', { token, password: 'another new password' })).status, 400);
  assert.strictEqual((await bob.get('/api/me')).status, 401);
  assert.strictEqual((await bob.login('bob@flyto.test', 'a brand new password')).status, 200);
});

test('the last admin cannot be demoted nor delete itself', async () => {
  const me = (await admin.get('/api/me')).data.user;
  assert.strictEqual((await admin.patch(`/api/admin/users/${ me.id }`, { role: 'user' })).status, 409);
  const res = await admin.request('DELETE', '/api/me', { json: { password: PASSWORD } });
  assert.strictEqual(res.status, 409);
});

test('settings are validated', async () => {
  assert.strictEqual((await admin.patch('/api/admin/settings', { passwordMinLength: 2 })).status, 400);
  assert.strictEqual((await admin.patch('/api/admin/settings', { nope: true })).status, 400);
  assert.strictEqual((await admin.patch('/api/admin/settings', { publicUrl: 'javascript:alert(1)' })).status, 400);
  const res = await admin.patch('/api/admin/settings', { siteName: 'Transferts' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual((await new Client().get('/api/session')).data.settings.siteName, 'Transferts');
});

test('an admin without 2FA is sent to turn it on when it is required', async () => {
  await app.ctx.settings.update({ require2faForAdmins: true });
  try {
    const page = await admin.get('/admin');
    assert.strictEqual(page.status, 302);
    assert.match(page.headers.get('location'), /account#security$/);
    assert.strictEqual((await admin.get('/api/admin/stats')).status, 403);
  } finally {
    await app.ctx.settings.update({ require2faForAdmins: false });
  }
  assert.strictEqual((await admin.get('/admin')).status, 200);
});

test('the dashboard and the journal answer', async () => {
  const stats = await admin.get('/api/admin/stats');
  assert.strictEqual(stats.status, 200);
  assert.strictEqual(stats.data.activity.days.length, 30);
  assert.ok(stats.data.users.total >= 4);
  assert.ok(stats.data.transfers.active >= 2);

  const system = await admin.get('/api/admin/system');
  assert.strictEqual(system.status, 200);
  assert.strictEqual(system.data.cache.backend, 'memory');

  const journal = await admin.get('/api/admin/audit?action=auth.');
  assert.ok(journal.data.items.some(e => e.action === 'auth.login_failed'));
  const csv = await admin.get('/api/admin/users.csv');
  assert.ok(csv.data.includes('alice@flyto.test'));
});

test('deleting an account removes its transfers', async () => {
  const res = await alice.request('DELETE', '/api/me', { json: { password: PASSWORD } });
  assert.strictEqual(res.status, 200);
  assert.strictEqual((await new Client().get('/alicesid0001.json')).status, 404);
});
