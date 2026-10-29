'use strict';
const { randomBytes } = require('node:crypto');
const { Pool } = require('pg');
const config = require('../config');
const { migrate } = require('./migrations');
const Settings = require('./settings');
const Accounts = require('./accounts');
const Sessions = require('./sessions');
const Audit = require('./audit');
const Cache = require('./cache');

const HELP = `Usage: node cli.js [command]

Without a command the server starts.

  admin create --email <e-mail> [--password <password>] [--name <name>]
      Create an admin account (or turn an existing account into an active admin).
      Without --password a random one is printed.
  user list
  user reset-password <e-mail> [--password <password>]
      Set a new password, unlock the account and close its sessions.
  user promote <e-mail>      make an admin
  user demote <e-mail>       back to a normal user
  user enable <e-mail>       activate a pending or disabled account
  user disable <e-mail>
  user disable-2fa <e-mail>  when the phone and the recovery codes are lost
  user unlock <e-mail>       after too many failed logins

In Docker: docker exec -it flyto node cli.js user list`;

function parseArgs(argv) {
  const positional = [];
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      options[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    } else {
      positional.push(argv[i]);
    }
  }
  return { positional, options };
}

function generatePassword() {
  return randomBytes(12).toString('base64url');
}

async function run(argv) {
  const { positional: [scope, command, target], options } = parseArgs(argv);
  if (!scope || scope === 'help' || options.help) {
    console.log(HELP);
    return 0;
  }
  if (!config.dbUrl) throw new Error('FLYTO_DB_URL is not set');

  const pool = new Pool({ connectionString: config.dbUrl });
  // the server caches sessions: closing them must reach that cache too
  const cache = new Cache(config.redisUrl);
  try {
    await cache.ready;
    await migrate(pool);
    const settings = new Settings(pool);
    await settings.load();
    const accounts = new Accounts(pool, settings);
    const audit = new Audit(pool);
    const actor = { id: null, email: 'cli' };
    const log = (action, user, details = {}) => audit.log({ action, actor, targetType: 'user', targetId: user.id, details });

    const findUser = async () => {
      if (!target) throw new Error('Give the e-mail address of the account');
      const user = await accounts.getByEmail(target);
      if (!user) throw new Error(`No account for ${ target }`);
      return user;
    };
    const sessions = new Sessions(pool, cache, settings);
    const closeSessions = id => sessions.revokeAll(id);

    if (scope === 'admin' && command === 'create') {
      if (!options.email) throw new Error('--email is required');
      const password = typeof options.password === 'string' ? options.password : generatePassword();
      let user = await accounts.getByEmail(options.email);
      if (user) {
        ({ user } = await accounts.update(user.id, { role: 'admin', status: 'active', emailVerified: true }));
        await accounts.setPassword(user.id, password);
        await log('cli.admin_promoted', user);
        console.log(`${ user.email } is now an active admin, its password was replaced.`);
      } else {
        user = await accounts.create({
          email: options.email, name: typeof options.name === 'string' ? options.name : '', password,
          role: 'admin', emailVerified: true,
        });
        await log('cli.admin_created', user);
        console.log(`Admin ${ user.email } created.`);
      }
      if (typeof options.password !== 'string') console.log(`Password: ${ password }`);
      return 0;
    }

    if (scope === 'user' && command === 'list') {
      const users = await accounts.all();
      if (!users.length) console.log('No account yet.');
      for (const u of users) {
        const flags = [u.role, u.status, u.totpEnabled ? '2fa' : '', u.lockedUntil > Date.now() ? 'locked' : '']
          .filter(Boolean).join(', ');
        console.log(`${ String(u.id).padStart(4) }  ${ u.email.padEnd(40) } ${ flags }`);
      }
      return 0;
    }

    if (scope === 'user') {
      const user = await findUser();
      switch (command) {
        case 'reset-password': {
          const password = typeof options.password === 'string' ? options.password : generatePassword();
          await accounts.setPassword(user.id, password);
          await closeSessions(user.id);
          await log('cli.password_reset', user);
          console.log(`Password of ${ user.email } replaced, sessions closed.`);
          if (typeof options.password !== 'string') console.log(`Password: ${ password }`);
          return 0;
        }
        case 'promote':
        case 'demote':
        case 'enable':
        case 'disable': {
          const patch = { promote: { role: 'admin' }, demote: { role: 'user' }, enable: { status: 'active' },
            disable: { status: 'disabled' } }[command];
          await accounts.update(user.id, patch);
          if (command === 'disable' || command === 'demote') await closeSessions(user.id);
          else await sessions.refreshUser(user.id);
          await log(`cli.user_${ command }`, user);
          console.log(`${ user.email }: ${ command } done.`);
          return 0;
        }
        case 'disable-2fa':
          await accounts.disableTotp(user.id);
          await closeSessions(user.id);
          await log('cli.2fa_disabled', user);
          console.log(`Two-factor authentication of ${ user.email } turned off.`);
          return 0;
        case 'unlock':
          await accounts.unlock(user.id);
          await log('cli.user_unlocked', user);
          console.log(`${ user.email } unlocked.`);
          return 0;
      }
    }
    console.error(`Unknown command: ${ argv.join(' ') }\n`);
    console.log(HELP);
    return 1;
  } finally {
    await cache.close();
    await pool.end();
  }
}

module.exports = { run, parseArgs };
