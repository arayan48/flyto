'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const config = require('../../config');
const Accounts = require('../../lib/accounts');
const Bootstrap = require('../../lib/bootstrap');

test('a too short FLYTO_ADMIN_PASSWORD falls back to the setup page instead of stopping', async (t) => {
  Object.assign(config, { adminEmail: 'admin@example.com', adminPassword: 'short' });
  t.after(() => Object.assign(config, { adminEmail: '', adminPassword: '' }));
  const accounts = new Accounts(null, { get: () => 10 });
  accounts.hasAdmin = async () => false;
  t.mock.method(console, 'log', () => {});
  const warn = t.mock.method(console, 'warn', () => {});

  const bootstrap = new Bootstrap();
  await bootstrap.run(accounts, { log: async () => {} });
  assert.strictEqual(bootstrap.setupRequired, true);
  assert.match(bootstrap.setupToken, /^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
  assert.ok(warn.mock.calls.some(c => /ignored/.test(c.arguments[0])));
});
