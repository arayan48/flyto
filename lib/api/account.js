'use strict';
const express = require('express');
const config = require('../../config');
const { safeEqual } = require('../utils');
const totp = require('../totp');
const { limitsFor } = require('../quotas');
const { setSessionCookie, clearSessionCookie, sendError } = require('../auth');
const { httpError } = require('../accounts');

const RESET_TTL = 3600;
const VERIFY_TTL = 3 * 86400;

function selfView(user) {
  if (!user) return null;
  const { id, email, name, role, status, emailVerified, locale, notifyDownloads, totpEnabled, recoveryCodesLeft,
    createdAt, lastLoginAt, hasPassword } = user;
  return { id, email, name, role, status, emailVerified, locale, notifyDownloads, totpEnabled, recoveryCodesLeft,
    createdAt, lastLoginAt, hasPassword };
}

function str(value) {
  return typeof value === 'string' ? value : '';
}

module.exports = function accountApi(ctx) {
  const { settings, accounts, sessions, audit, mailer, db, auth, bootstrap } = ctx;
  const router = express.Router();

  const langOf = (user, req) => (user && user.locale && config.languages[user.locale]) || req.translations;

  async function sendMail(user, req, name, vars) {
    try {
      return await mailer.send(user.email, langOf(user, req), name, { name: user.name || user.email, ...vars });
    } catch (e) {
      console.error(`Could not send ${ name } to ${ user.email }: ${ e.message }`);
      return false;
    }
  }

  // links in mails triggered without a session never trust the Host header (reset poisoning)
  function linkBase(req) {
    if (req.user) return ctx.publicUrl(req);
    const base = ctx.trustedUrl();
    if (!base) console.warn('Not sending a link by e-mail: set the public address in /admin (or FLYTO_PUBLIC_URL)');
    return base;
  }

  async function sendVerification(user, req, email = user.email) {
    const base = linkBase(req);
    if (!mailer.enabled || !base) return false;
    const token = await accounts.createToken(user.id, 'verify', VERIFY_TTL, { email });
    return sendMail({ ...user, email }, req, 'verify', { url: `${ base }verify/${ token }` });
  }

  async function startSession(req, res, user, remember) {
    const { token, session } = await sessions.create(user.id, req, { remember: remember !== false });
    setSessionCookie(req, res, token, session);
    await accounts.loginSucceeded(user.id, req.ip);
    return session;
  }

  async function notifyAdmins(req, name, vars) {
    if (!settings.get('notifyAdminsOnSignup') || !mailer.enabled) return;
    const { items } = await accounts.list({ role: 'admin', status: 'active', perPage: 50 });
    await Promise.all(items.map(admin => sendMail(admin, req, name, vars)));
  }

  function usageOf(user) {
    return user ? db.usage(user.id) : null;
  }

  // --- session and public settings

  router.get('/session', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    await bootstrap.refresh(accounts);
    res.json({
      user: selfView(req.user),
      csrf: req.session ? req.session.csrf : null,
      settings: settings.public(),
      setupRequired: bootstrap.setupRequired,
      mail: mailer.enabled,
      limits: limitsFor(req.user, settings),
      usage: usageOf(req.user),
      version: ctx.version,
    });
  });

  // --- login, logout

  router.post('/auth/login',
    auth.rateLimit('login', 20, 15 * 60),
    auth.rateLimit('login-account', 10, 15 * 60, req => str(req.body && req.body.email)),
    async (req, res) => {
      const { email, password, code, remember } = req.body || {};
      let found;
      try {
        found = await accounts.authenticate(str(email), str(password));
      } catch (e) {
        if (e.code === 'invalidCredentials' || e.code === 'accountLocked') {
          await audit.log({ action: 'auth.login_failed', req, details: { email: str(email).slice(0, 254), reason: e.code } });
        }
        throw e;
      }
      const { user } = found;
      if (user.status === 'pending') return sendError(res, 403, 'accountPending', 'Your account waits for an admin approval');
      if (user.status === 'disabled') return sendError(res, 403, 'accountDisabled', 'This account is disabled');
      if (settings.get('requireEmailVerification') && mailer.enabled && !user.emailVerified) {
        return sendError(res, 403, 'emailNotVerified', 'Confirm your e-mail address first');
      }
      if (user.totpEnabled) {
        if (!code) return res.json({ mfaRequired: true });
        const used = await accounts.checkSecondFactor(user.id, code);
        if (!used) {
          await accounts.loginFailed(user.id);
          await audit.log({ action: 'auth.login_failed', actor: user, req, details: { reason: 'invalidCode' } });
          return sendError(res, 401, 'invalidCode', 'Wrong code');
        }
        if (used === 'recovery') {
          await audit.log({ action: 'auth.recovery_code_used', actor: user, req, targetType: 'user', targetId: user.id });
        }
      }
      const session = await startSession(req, res, user, remember);
      await audit.log({ action: 'auth.login', actor: user, req, targetType: 'user', targetId: user.id });
      res.json({ user: selfView(user), csrf: session.csrf });
    });

  router.post('/auth/logout', auth.csrf, async (req, res) => {
    if (req.session) {
      await sessions.revoke(req.session.id);
      await audit.log({ action: 'auth.logout', actor: req.user, req, targetType: 'user', targetId: req.user.id });
    }
    clearSessionCookie(req, res);
    // the logout button of the page header is a plain form
    if (req.is('application/x-www-form-urlencoded')) return res.redirect(303, config.uploadAppPath);
    res.json({ ok: true });
  });

  // --- sign-up

  router.get('/auth/invite/:token', auth.rateLimit('invite', 60, 15 * 60), async (req, res) => {
    const invite = settings.get('registrationMode') === 'closed' ? null : await accounts.findInvite(req.params.token);
    if (!invite) return sendError(res, 404, 'invalidInvite', 'This invitation is not valid anymore');
    res.json({ email: invite.email, role: invite.role, expiresAt: invite.expiresAt });
  });

  router.post('/auth/register', auth.rateLimit('register', 10, 3600), async (req, res) => {
    const { email, name, password, invite: inviteToken } = req.body || {};
    const mode = settings.get('registrationMode');
    if (bootstrap.setupRequired) return sendError(res, 409, 'setupRequired', 'Create the admin account first');

    let user;
    let invite = null;
    if (inviteToken) {
      if (mode === 'closed') return sendError(res, 403, 'registrationClosed', 'Registration is closed');
      ({ user, invite } = await accounts.createFromInvite(str(inviteToken), {
        email: str(email), name: str(name), password: str(password),
        locale: req.translations.langCode,
      }));
    } else {
      if (mode !== 'open') {
        return sendError(res, 403, mode === 'invite' ? 'inviteRequired' : 'registrationClosed',
          mode === 'invite' ? 'An invitation is required' : 'Registration is closed');
      }
      if (!settings.emailDomainAllowed(str(email))) {
        return sendError(res, 403, 'emailDomainNotAllowed', 'This e-mail domain is not allowed');
      }
      user = await accounts.create({
        email: str(email), name: str(name), password: str(password),
        status: settings.get('requireApproval') ? 'pending' : 'active',
        locale: req.translations.langCode,
      });
    }

    await audit.log({ action: 'auth.register', actor: user, req, targetType: 'user', targetId: user.id,
      details: invite ? { invite: invite.id } : {} });
    const base = ctx.trustedUrl();
    await notifyAdmins(req, user.status === 'pending' ? 'adminApprovalNeeded' : 'adminNewUser', {
      email: user.email,
      url: base ? `${ base }admin#/users/${ user.id }` : undefined,
    });

    if (user.status === 'pending') return res.status(201).json({ user: selfView(user), pending: true });
    if (!user.emailVerified && mailer.enabled) {
      const sent = await sendVerification(user, req);
      if (settings.get('requireEmailVerification')) {
        return res.status(201).json({ user: selfView(user), verificationSent: sent });
      }
    }
    const session = await startSession(req, res, user, true);
    res.status(201).json({ user: selfView(user), csrf: session.csrf });
  });

  // --- password reset and e-mail verification

  router.post('/auth/forgot',
    auth.rateLimit('forgot', 5, 3600),
    auth.rateLimit('forgot-account', 3, 3600, req => str(req.body && req.body.email)),
    async (req, res) => {
      const user = await accounts.getByEmail(str(req.body && req.body.email));
      // same answer whether the account exists or not
      const base = linkBase(req);
      if (user && user.status === 'active' && mailer.enabled && base) {
        const token = await accounts.createToken(user.id, 'reset', RESET_TTL);
        await sendMail(user, req, 'reset', { url: `${ base }reset/${ token }` });
        await audit.log({ action: 'auth.reset_requested', actor: user, req, targetType: 'user', targetId: user.id });
      }
      res.json({ ok: true, mail: mailer.enabled && !!base });
    });

  router.get('/auth/reset/:token', auth.rateLimit('reset', 30, 15 * 60), async (req, res) => {
    const token = await accounts.peekToken(req.params.token, 'reset');
    const user = token && await accounts.get(token.userId);
    if (!user) return sendError(res, 404, 'invalidToken', 'This link is not valid anymore');
    res.json({ email: user.email, expiresAt: token.expiresAt });
  });

  router.post('/auth/reset', auth.rateLimit('reset', 30, 15 * 60), async (req, res) => {
    const { token, password } = req.body || {};
    const pending = await accounts.peekToken(str(token), 'reset');
    const user = pending && await accounts.get(pending.userId);
    if (!user) return sendError(res, 400, 'invalidToken', 'This link is not valid anymore');
    // check the password before burning the link, a typo must not cost a new e-mail
    accounts.checkPassword(str(password), user.email);
    if (!await accounts.consumeToken(str(token), 'reset')) {
      return sendError(res, 400, 'invalidToken', 'This link is not valid anymore');
    }
    await accounts.setPassword(user.id, str(password));
    // a reset link proves the mailbox, as a verification link would
    if (!user.emailVerified) await accounts.update(user.id, { emailVerified: true });
    await sessions.revokeAll(user.id);
    await audit.log({ action: 'auth.password_reset', actor: user, req, targetType: 'user', targetId: user.id });
    res.json({ ok: true });
  });

  router.post('/auth/verify', auth.rateLimit('verify', 30, 15 * 60), async (req, res) => {
    const given = str(req.body && req.body.token);
    const pending = await accounts.peekToken(given, 'verify');
    if (!pending || !await accounts.get(pending.userId)) return sendError(res, 400, 'invalidToken', 'This link is not valid anymore');
    const patch = { emailVerified: true };
    if (pending.data && pending.data.email) {
      // the new address may have been taken since the link was sent: keep the link usable
      const other = await accounts.getByEmail(pending.data.email);
      if (other && other.id !== pending.userId) throw httpError(409, 'emailTaken', 'An account already uses this e-mail address');
      patch.email = pending.data.email;
    }
    if (!await accounts.consumeToken(given, 'verify')) return sendError(res, 400, 'invalidToken', 'This link is not valid anymore');
    const { user, changed } = await accounts.update(pending.userId, patch);
    await sessions.refreshUser(user.id);
    await audit.log({ action: 'auth.email_verified', actor: user, req, targetType: 'user', targetId: user.id,
      details: changed.email ? { email: changed.email } : {} });
    res.json({ ok: true, email: user.email });
  });

  router.post('/auth/resend-verification',
    auth.rateLimit('resend', 5, 3600),
    auth.rateLimit('resend-account', 3, 3600, req => str(req.body && req.body.email)),
    async (req, res) => {
      const user = await accounts.getByEmail(str(req.body && req.body.email));
      if (user && !user.emailVerified && user.status !== 'disabled') await sendVerification(user, req);
      res.json({ ok: true, mail: mailer.enabled });
    });

  // --- first admin

  router.get('/setup', async (req, res) => {
    res.json({ required: await bootstrap.refresh(accounts) });
  });

  router.post('/setup', auth.rateLimit('setup', 10, 15 * 60), async (req, res) => {
    if (!await bootstrap.refresh(accounts)) return sendError(res, 409, 'setupDone', 'The admin account exists already');
    const { token, email, name, password } = req.body || {};
    if (!bootstrap.setupToken || !safeEqual(str(token).trim().toUpperCase(), bootstrap.setupToken)) {
      await audit.log({ action: 'setup.failed', req });
      return sendError(res, 403, 'invalidSetupToken', 'Wrong setup code, see the server logs');
    }
    const user = await accounts.create({
      email: str(email), name: str(name), password: str(password),
      role: 'admin', emailVerified: true, locale: req.translations.langCode,
    });
    bootstrap.done();
    await audit.log({ action: 'setup.admin_created', actor: user, req, targetType: 'user', targetId: user.id });
    const session = await startSession(req, res, user, true);
    res.status(201).json({ user: selfView(user), csrf: session.csrf });
  });

  // --- own account

  const me = express.Router();
  me.use(auth.requireUser, auth.csrf);

  me.get('/', (req, res) => {
    res.json({ user: selfView(req.user), limits: limitsFor(req.user, settings), usage: usageOf(req.user) });
  });

  me.patch('/', async (req, res) => {
    const body = req.body || {};
    const patch = {};
    if ('name' in body) patch.name = str(body.name);
    if ('locale' in body) patch.locale = body.locale && config.languages[body.locale] ? body.locale : null;
    if ('notifyDownloads' in body) patch.notifyDownloads = !!body.notifyDownloads;

    let verificationSent = false;
    const email = str(body.email).trim();
    if (email && email.toLowerCase() !== req.user.email.toLowerCase()) {
      if (!await accounts.verifyPassword(req.user.id, str(body.currentPassword))) {
        return sendError(res, 403, 'wrongPassword', 'Wrong current password');
      }
      accounts.checkEmail(email);
      if (await accounts.getByEmail(email)) throw httpError(409, 'emailTaken', 'An account already uses this e-mail address');
      if (mailer.enabled) {
        // the address only changes once the new mailbox is confirmed
        verificationSent = await sendVerification(req.user, req, email);
      } else {
        patch.email = email;
        patch.emailVerified = false;
      }
    }
    const { user, changed } = await accounts.update(req.user.id, patch);
    await sessions.refreshUser(user.id);
    if (Object.keys(changed).length) {
      await audit.log({ action: 'user.profile_updated', actor: req.user, req, targetType: 'user', targetId: user.id,
        details: { fields: Object.keys(changed) } });
    }
    res.json({ user: selfView(user), verificationSent });
  });

  me.post('/password', auth.rateLimit('password', 10, 15 * 60), async (req, res) => {
    const { currentPassword, password } = req.body || {};
    if (req.user.hasPassword && !await accounts.verifyPassword(req.user.id, str(currentPassword))) {
      return sendError(res, 403, 'wrongPassword', 'Wrong current password');
    }
    await accounts.setPassword(req.user.id, str(password));
    const revoked = await sessions.revokeAll(req.user.id, req.session.id);
    await audit.log({ action: 'user.password_changed', actor: req.user, req, targetType: 'user', targetId: req.user.id,
      details: { sessionsRevoked: revoked } });
    await sendMail(req.user, req, 'passwordChanged', {});
    res.json({ ok: true, sessionsRevoked: revoked });
  });

  me.get('/sessions', async (req, res) => {
    const list = await sessions.list(req.user.id);
    res.json(list.map(s => ({ ...s, current: s.id === req.session.id })));
  });

  me.delete('/sessions/:id', async (req, res) => {
    if (!await sessions.revoke(req.params.id, req.user.id)) return sendError(res, 404, 'sessionNotFound', 'Session not found');
    await audit.log({ action: 'user.session_revoked', actor: req.user, req, targetType: 'user', targetId: req.user.id });
    res.json({ ok: true, current: req.params.id === req.session.id });
  });

  me.post('/sessions/revoke-others', async (req, res) => {
    const count = await sessions.revokeAll(req.user.id, req.session.id);
    await audit.log({ action: 'user.sessions_revoked', actor: req.user, req, targetType: 'user', targetId: req.user.id,
      details: { count } });
    res.json({ ok: true, count });
  });

  // --- two-factor authentication

  async function confirmPassword(req) {
    if (!await accounts.verifyPassword(req.user.id, str(req.body && req.body.password))) {
      throw httpError(403, 'wrongPassword', 'Wrong password');
    }
  }

  me.post('/2fa/setup', auth.rateLimit('2fa', 20, 15 * 60), async (req, res) => {
    if (req.user.totpEnabled) return sendError(res, 409, 'totpEnabled', 'Two-factor authentication is already on');
    await confirmPassword(req);
    const secret = await accounts.startTotp(req.user.id);
    res.json({ secret, otpauth: totp.otpauthUrl(secret, req.user.email, settings.get('siteName')) });
  });

  me.post('/2fa/enable', auth.rateLimit('2fa', 20, 15 * 60), async (req, res) => {
    if (req.user.totpEnabled) return sendError(res, 409, 'totpEnabled', 'Two-factor authentication is already on');
    const recoveryCodes = await accounts.enableTotp(req.user.id, str(req.body && req.body.code));
    await sessions.refreshUser(req.user.id);
    await audit.log({ action: 'user.2fa_enabled', actor: req.user, req, targetType: 'user', targetId: req.user.id });
    res.json({ recoveryCodes });
  });

  me.post('/2fa/disable', auth.rateLimit('2fa', 20, 15 * 60), async (req, res) => {
    await confirmPassword(req);
    if (!await accounts.checkSecondFactor(req.user.id, str(req.body && req.body.code))) {
      return sendError(res, 403, 'invalidCode', 'Wrong code');
    }
    await accounts.disableTotp(req.user.id);
    await sessions.refreshUser(req.user.id);
    await audit.log({ action: 'user.2fa_disabled', actor: req.user, req, targetType: 'user', targetId: req.user.id });
    res.json({ ok: true });
  });

  me.post('/2fa/recovery-codes', auth.rateLimit('2fa', 20, 15 * 60), async (req, res) => {
    await confirmPassword(req);
    if (!req.user.totpEnabled) return sendError(res, 409, 'totpDisabled', 'Two-factor authentication is off');
    const recoveryCodes = await accounts.regenerateRecoveryCodes(req.user.id);
    await sessions.refreshUser(req.user.id);
    await audit.log({ action: 'user.recovery_codes_renewed', actor: req.user, req, targetType: 'user', targetId: req.user.id });
    res.json({ recoveryCodes });
  });

  // --- own transfers

  function ownTransfer(req) {
    const t = db.transfer(req.params.sid);
    if (!t || t.ownerId !== req.user.id || !db.get(req.params.sid)) {
      throw httpError(404, 'transferNotFound', 'Transfer not found');
    }
    return t;
  }

  me.get('/transfers', async (req, res) => {
    const counts = await ctx.downloadCounts();
    const base = ctx.publicUrl(req);
    res.json(db.sidsOf(req.user.id)
      .map(sid => ({
        ...db.summary(sid, counts),
        url: base + sid,
        items: db.get(sid).map(f => ({
          key: f.key,
          name: f.metadata.name,
          size: +f.metadata.uploadLength,
          partial: !!f.isPartial,
          downloads: (counts[sid] && counts[sid][f.key]) || 0,
        })),
      }))
      .sort((a, b) => b.createdAt - a.createdAt));
  });

  me.delete('/transfers/:sid', async (req, res) => {
    ownTransfer(req);
    const files = await db.removeBucket(req.params.sid);
    await audit.log({ action: 'transfer.deleted', actor: req.user, req, targetType: 'transfer', targetId: req.params.sid,
      details: { files } });
    res.json({ ok: true });
  });

  me.delete('/transfers/:sid/files/:key', async (req, res) => {
    ownTransfer(req);
    const file = db.get(req.params.sid).find(f => f.key === req.params.key);
    if (!file) return sendError(res, 404, 'fileNotFound', 'File not found');
    await db.remove(req.params.sid, req.params.key);
    await audit.log({ action: 'transfer.file_deleted', actor: req.user, req, targetType: 'transfer',
      targetId: req.params.sid, details: { name: file.metadata.name } });
    res.json({ ok: true });
  });

  // --- personal data

  me.get('/export', auth.rateLimit('export', 10, 3600), async (req, res) => {
    const [sessionList, journal] = await Promise.all([
      sessions.list(req.user.id),
      audit.list({ actorId: req.user.id, perPage: 1000 }),
    ]);
    const counts = await ctx.downloadCounts();
    res.set('Content-Disposition', `attachment; filename="flyto-${ req.user.id }.json"`);
    res.json({
      exportedAt: new Date().toISOString(),
      account: selfView(req.user),
      transfers: db.sidsOf(req.user.id).map(sid => ({
        ...db.summary(sid, counts),
        files: db.get(sid).map(f => ({ name: f.metadata.name, size: +f.metadata.uploadLength, comment: f.metadata.comment })),
      })),
      sessions: sessionList,
      activity: journal.items,
    });
  });

  me.delete('/', auth.rateLimit('delete-account', 5, 3600), async (req, res) => {
    await confirmPassword(req);
    const sids = db.sidsOf(req.user.id);
    // remove() refuses to delete the last admin, check before touching the files
    if (req.user.role === 'admin' && (await accounts.count()).admins <= 1) {
      throw httpError(409, 'lastAdmin', 'This is the last active admin');
    }
    for (const sid of sids) await db.removeBucket(sid);
    await sessions.revokeAll(req.user.id);
    await accounts.remove(req.user.id);
    await audit.log({ action: 'user.deleted_self', actor: req.user, req, targetType: 'user', targetId: req.user.id,
      details: { transfers: sids.length } });
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  router.use('/me', me);
  return router;
};

module.exports.selfView = selfView;
