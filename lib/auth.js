'use strict';
const { randomBytes } = require('node:crypto');
const config = require('../config');
const { safeEqual } = require('./utils');

const COOKIE = 'flyto_session';
// anonymous uploads have no account: this random cookie tells their uploader apart
const UPLOADER_COOKIE = 'flyto_uploader';
const UPLOADER_DAYS = 30;
const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

function parseCookies(header) {
  const result = Object.create(null);
  if (typeof header !== 'string') return result;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    const name = part.slice(0, i).trim();
    if (!name || name in result) continue;
    try {
      result[name] = decodeURIComponent(part.slice(i + 1).trim());
    } catch (e) {
      result[name] = part.slice(i + 1).trim();
    }
  }
  return result;
}

function cookie(req, name, value, { maxAge, sameSite = 'Lax' } = {}) {
  const parts = [`${ name }=${ encodeURIComponent(value) }`, `Path=${ config.baseUrl }`, 'HttpOnly', `SameSite=${ sameSite }`];
  if (req.secure) parts.push('Secure');
  if (maxAge !== undefined) parts.push(`Max-Age=${ maxAge }`);
  return parts.join('; ');
}

function setSessionCookie(req, res, token, session) {
  res.append('Set-Cookie', cookie(req, COOKIE, token,
    { maxAge: session.persistent ? Math.floor((session.expiresAt - Date.now()) / 1000) : undefined }));
}

function clearSessionCookie(req, res) {
  res.append('Set-Cookie', cookie(req, COOKIE, '', { maxAge: 0 }));
}

/**
 * The uploader cookie of an anonymous visitor, issued when missing.
 * @returns {string} the token, only its hash is stored with a transfer
 */
function uploaderToken(req, res) {
  const token = parseCookies(req.headers.cookie)[UPLOADER_COOKIE];
  if (typeof token === 'string' && /^[\w-]{32}$/.test(token)) return token;
  const fresh = randomBytes(24).toString('base64url');
  res.append('Set-Cookie', cookie(req, UPLOADER_COOKIE, fresh, { maxAge: UPLOADER_DAYS * 86400, sameSite: 'Strict' }));
  return fresh;
}

function sendError(res, status, code, message, extra = {}) {
  res.status(status).json({ error: code, message: message || code, ...extra });
}

module.exports = function createAuth({ sessions, settings, cache }) {

  async function loadSession(req, res, next) {
    req.user = null;
    req.session = null;
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (!token) return next();
    try {
      const found = await sessions.lookup(token, req);
      if (found) {
        req.user = found.user;
        req.session = found.session;
        req.sessionToken = token;
      } else {
        clearSessionCookie(req, res);
      }
    } catch (e) {
      console.error(`Session lookup failed: ${ e.message }`);
    }
    next();
  }

  // the token comes from GET api/session, a page on another site cannot read it
  function csrf(req, res, next) {
    if (SAFE_METHODS.includes(req.method) || !req.session) return next();
    const given = req.get('x-csrf-token') || (req.body && req.body._csrf) || '';
    if (!safeEqual(given, req.session.csrf)) {
      return sendError(res, 403, 'csrf', 'Invalid or missing CSRF token, reload the page');
    }
    next();
  }

  function requireUser(req, res, next) {
    if (!req.user) return sendError(res, 401, 'loginRequired', 'Login required');
    next();
  }

  function requireAdmin(req, res, next) {
    if (!req.user) return sendError(res, 401, 'loginRequired', 'Login required');
    if (req.user.role !== 'admin') return sendError(res, 403, 'forbidden', 'Admins only');
    if (settings.get('require2faForAdmins') && !req.user.totpEnabled) {
      return sendError(res, 403, 'twoFactorRequired', 'Enable two-factor authentication to administer this instance');
    }
    next();
  }

  /**
   * Fixed window rate limit, shared through Redis when it is configured.
   * @param {Function} [keyFn] counts per this value (e.g. the e-mail of a login) instead of per IP
   */
  function rateLimit(name, limit, windowSeconds, keyFn = null) {
    return async function(req, res, next) {
      const keys = [];
      if (!keyFn) keys.push(`rl:${ name }:ip:${ req.ip }`);
      const extra = keyFn && keyFn(req);
      if (extra) keys.push(`rl:${ name }:k:${ String(extra).toLowerCase().slice(0, 200) }`);
      const limitOf = typeof limit === 'function' ? limit() : limit;
      for (const key of keys) {
        const count = await cache.hit(key, windowSeconds);
        if (count > limitOf) {
          res.set('Retry-After', String(windowSeconds));
          return sendError(res, 429, 'rateLimited', 'Too many attempts, try again later', { retryAfter: windowSeconds });
        }
      }
      next();
    };
  }

  return { loadSession, csrf, requireUser, requireAdmin, rateLimit };
};

module.exports.COOKIE = COOKIE;
module.exports.parseCookies = parseCookies;
module.exports.setSessionCookie = setSessionCookie;
module.exports.clearSessionCookie = clearSessionCookie;
module.exports.uploaderToken = uploaderToken;
module.exports.sendError = sendError;
