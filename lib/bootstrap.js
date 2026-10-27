'use strict';
const { randomInt } = require('node:crypto');
const config = require('../config');

// no 0/O or 1/I, the code is typed from a log line
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PLACEHOLDERS = ['change-me', 'change-me-too', 'changeme', 'password', 'admin'];

function setupCode() {
  const groups = [];
  for (let g = 0; g < 4; g++) {
    let s = '';
    for (let i = 0; i < 4; i++) s += ALPHABET[randomInt(ALPHABET.length)];
    groups.push(s);
  }
  return groups.join('-');
}

/**
 * Makes sure the instance can be administered:
 * - FLYTO_ADMIN_EMAIL + FLYTO_ADMIN_PASSWORD create the first admin on start,
 * - otherwise /setup asks for a one-time code printed in the logs,
 * - `node cli.js admin create` works at any time from the container.
 */
class Bootstrap {

  constructor() {
    this.setupRequired = false;
    this.setupToken = null;
  }

  async run(accounts, audit) {
    if (config.adminPass) {
      console.warn('FLYTO_ADMIN_PASS is not used anymore: admins log in with their own account. ' +
        'Set FLYTO_ADMIN_EMAIL and FLYTO_ADMIN_PASSWORD to create the first one.');
    }
    if (config.uploadPass) {
      console.warn('FLYTO_UPLOAD_PASS is not used anymore: uploads need an account (or anonymous uploads enabled in /admin).');
    }
    if (await accounts.hasAdmin()) return;

    // the example values of docker-compose.yml must not become a real admin password
    const placeholder = PLACEHOLDERS.includes(String(config.adminPassword).toLowerCase());
    if (placeholder) {
      console.warn('FLYTO_ADMIN_PASSWORD still has the example value of docker-compose.yml, ignoring it.');
    }
    if (config.adminEmail && config.adminPassword && !placeholder) {
      const existing = await accounts.getByEmail(config.adminEmail);
      let user;
      if (existing) {
        // an account with this address exists (e.g. the only admin was demoted): promote it back
        ({ user } = await accounts.update(existing.id, { role: 'admin', status: 'active', emailVerified: true }));
        await accounts.setPassword(existing.id, config.adminPassword);
      } else {
        user = await accounts.create({
          email: config.adminEmail,
          name: config.adminName || '',
          password: config.adminPassword,
          role: 'admin',
          emailVerified: true,
        });
      }
      await audit.log({ action: 'setup.admin_from_env', actor: user, targetType: 'user', targetId: user.id });
      console.log(`Admin account ready for ${ user.email } (from FLYTO_ADMIN_EMAIL)`);
      return;
    }

    this.setupRequired = true;
    this.setupToken = setupCode();
    console.log([
      '',
      '  No admin account yet. Open the setup page to create one:',
      `    ${ (config.publicUrl || `http://localhost:${ config.port }`).replace(/\/$/, '') }${ config.baseUrl }setup`,
      `  Setup code: ${ this.setupToken }`,
      '  (or set FLYTO_ADMIN_EMAIL and FLYTO_ADMIN_PASSWORD, or run `node cli.js admin create`)',
      '',
    ].join('\n'));
  }

  // an admin may have been created meanwhile from the CLI
  async refresh(accounts) {
    if (this.setupRequired && await accounts.hasAdmin()) this.done();
    return this.setupRequired;
  }

  done() {
    this.setupRequired = false;
    this.setupToken = null;
  }
}

module.exports = Bootstrap;
module.exports.setupCode = setupCode;
