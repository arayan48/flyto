'use strict';
const express = require('express');
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const Settings = require('../settings');
const { limitsFor } = require('../quotas');
const { expiryOf } = require('../db');
const { sendError } = require('../auth');
const { httpError } = require('../accounts');
const utils = require('../utils');

const RESET_LINK_TTL = 7 * 86400;

function page(req, max = 200) {
  const p = Math.max(1, parseInt(req.query.page, 10) || 1);
  const perPage = Math.min(max, Math.max(1, parseInt(req.query.perPage, 10) || 25));
  return { page: p, perPage };
}

function str(value) {
  return typeof value === 'string' ? value : '';
}

// a leading = + - @ would make spreadsheets evaluate the cell
function csvCell(value) {
  if (value === null || value === undefined) return '';
  let s = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r;]/.test(s) ? `"${ s.replace(/"/g, '""') }"` : s;
}

function sendCsv(res, filename, columns, rows) {
  const lines = [columns.map(c => csvCell(c.label)).join(',')];
  for (const row of rows) lines.push(columns.map(c => csvCell(c.value(row))).join(','));
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${ filename }"`);
  // BOM so Excel reads UTF-8
  res.send('﻿' + lines.join('\r\n') + '\r\n');
}

function iso(ms) {
  return ms ? new Date(ms).toISOString() : '';
}

function knownLocale(value) {
  return typeof value === 'string' && config.languages[value] ? value : null;
}

function adminUserView(user, usage = { storage: 0, transfers: 0, files: 0 }) {
  return { ...user, usage };
}

module.exports = function adminApi(ctx) {
  const { settings, accounts, sessions, audit, mailer, db, auth, stats, cache, store, pool } = ctx;
  const router = express.Router();
  router.use(auth.requireAdmin, auth.csrf);

  const log = (req, action, targetType, targetId, details) =>
    audit.log({ action, actor: req.user, req, targetType, targetId, details });

  const langOf = (user, req) => (user && user.locale && config.languages[user.locale]) || req.translations;

  async function mail(user, req, name, vars) {
    try {
      return await mailer.send(user.email, langOf(user, req), name, { name: user.name || user.email, ...vars });
    } catch (e) {
      console.error(`Could not send ${ name } to ${ user.email }: ${ e.message }`);
      return false;
    }
  }

  async function findUser(req) {
    const user = await accounts.get(req.params.id);
    if (!user) throw httpError(404, 'userNotFound', 'User not found');
    return user;
  }

  // --- dashboard

  router.get('/stats', async (req, res) => {
    const days = Math.min(365, Math.max(7, parseInt(req.query.days, 10) || 30));
    res.json(await stats.dashboard(days));
  });

  router.get('/system', async (req, res) => {
    res.json(await stats.system());
  });

  // --- users

  router.get('/users', async (req, res) => {
    const result = await accounts.list({
      q: str(req.query.q), role: str(req.query.role), status: str(req.query.status),
      sort: str(req.query.sort), dir: str(req.query.dir), ...page(req),
    });
    const usage = db.usageByOwner();
    result.items = result.items.map(u => adminUserView(u, usage.get(u.id)));
    res.json(result);
  });

  router.post('/users', async (req, res) => {
    const body = req.body || {};
    const password = str(body.password);
    const user = await accounts.create({
      email: str(body.email),
      name: str(body.name),
      password: password || null,
      role: body.role === 'admin' ? 'admin' : 'user',
      status: ['active', 'pending', 'disabled'].includes(body.status) ? body.status : 'active',
      emailVerified: body.emailVerified !== false,
      locale: knownLocale(body.locale),
      quotaTransfer: body.quotaTransfer,
      quotaStorage: body.quotaStorage,
      quotaTransfers: body.quotaTransfers,
      notes: str(body.notes),
    });
    let link = null;
    let mailed = false;
    if (!password) {
      // without a password the new user picks one through a reset link
      const token = await accounts.createToken(user.id, 'reset', RESET_LINK_TTL);
      link = `${ ctx.publicUrl(req) }reset/${ token }`;
      if (body.sendEmail !== false) mailed = await mail(user, req, 'welcome', { url: link, admin: req.user.email });
    }
    await log(req, 'admin.user.created', 'user', user.id, { email: user.email, role: user.role, mailed });
    res.status(201).json({ user: adminUserView(user), link, mailed });
  });

  router.get('/users/:id', async (req, res) => {
    const user = await findUser(req);
    const counts = await ctx.downloadCounts();
    const [sessionList, journal, uploads] = await Promise.all([
      sessions.list(user.id),
      audit.list({ q: '', actorId: user.id, perPage: 20 }),
      pool.query(`SELECT COUNT(*)::int AS count, COALESCE(SUM(size), 0)::bigint AS bytes FROM uploads WHERE owner_id = $1`,
        [user.id]).then(r => r.rows[0]),
    ]);
    const about = await audit.list({ targetType: 'user', targetId: user.id, perPage: 20 });
    res.json({
      user: adminUserView(user, db.usage(user.id)),
      limits: limitsFor(user, settings),
      sessions: sessionList,
      transfers: db.sidsOf(user.id).map(sid => db.summary(sid, counts)).sort((a, b) => b.createdAt - a.createdAt),
      activity: journal.items,
      history: about.items,
      totals: { uploads: uploads.count, uploadBytes: +uploads.bytes },
      invitedBy: user.invitedBy ? await accounts.get(user.invitedBy).then(u => u && { id: u.id, email: u.email }) : null,
    });
  });

  router.patch('/users/:id', async (req, res) => {
    const target = await findUser(req);
    const body = req.body || {};
    const allowed = ['name', 'email', 'role', 'status', 'emailVerified', 'locale', 'notifyDownloads',
      'quotaTransfer', 'quotaStorage', 'quotaTransfers', 'notes'];
    const patch = {};
    for (const key of allowed) if (key in body) patch[key] = body[key];
    if ('locale' in patch) patch.locale = knownLocale(patch.locale);
    if (target.id === req.user.id && (patch.role === 'user' || (patch.status && patch.status !== 'active'))) {
      return sendError(res, 409, 'selfDemotion', 'You cannot demote or disable your own account');
    }
    const { user, changed } = await accounts.update(target.id, patch);
    if (changed.status && changed.status.to !== 'active') await sessions.revokeAll(user.id);
    else await sessions.refreshUser(user.id);
    if (changed.status && changed.status.from === 'pending' && changed.status.to === 'active') {
      await mail(user, req, 'approved', { url: `${ ctx.publicUrl(req) }login` });
    }
    if (Object.keys(changed).length) await log(req, 'admin.user.updated', 'user', user.id, { changed });
    res.json({ user: adminUserView(user, db.usage(user.id)) });
  });

  router.delete('/users/:id', async (req, res) => {
    const target = await findUser(req);
    if (target.id === req.user.id) return sendError(res, 409, 'selfDelete', 'Delete your own account from your profile');
    const keep = req.query.transfers === 'keep';
    const sids = db.sidsOf(target.id);
    if (target.role === 'admin' && target.status === 'active' && (await accounts.count()).admins <= 1) {
      throw httpError(409, 'lastAdmin', 'This is the last active admin');
    }
    if (!keep) for (const sid of sids) await db.removeBucket(sid);
    else for (const sid of sids) await db.updateTransfer(sid, { ownerId: null });
    await sessions.revokeAll(target.id);
    await accounts.remove(target.id);
    await log(req, 'admin.user.deleted', 'user', target.id,
      { email: target.email, transfers: sids.length, transfersKept: keep });
    res.json({ ok: true });
  });

  router.post('/users/:id/reset-link', async (req, res) => {
    const user = await findUser(req);
    const token = await accounts.createToken(user.id, 'reset', RESET_LINK_TTL);
    const link = `${ ctx.publicUrl(req) }reset/${ token }`;
    const mailed = req.body && req.body.sendEmail ? await mail(user, req, 'reset', { url: link }) : false;
    await log(req, 'admin.user.reset_link', 'user', user.id, { mailed });
    res.json({ link, mailed, expiresAt: Date.now() + RESET_LINK_TTL * 1000 });
  });

  router.post('/users/:id/password', async (req, res) => {
    const user = await findUser(req);
    await accounts.setPassword(user.id, str(req.body && req.body.password));
    const revoked = user.id === req.user.id
      ? await sessions.revokeAll(user.id, req.session.id)
      : await sessions.revokeAll(user.id);
    await log(req, 'admin.user.password_set', 'user', user.id, { sessionsRevoked: revoked });
    res.json({ ok: true });
  });

  router.post('/users/:id/disable-2fa', async (req, res) => {
    const user = await findUser(req);
    await accounts.disableTotp(user.id);
    await sessions.refreshUser(user.id);
    await log(req, 'admin.user.2fa_reset', 'user', user.id);
    res.json({ ok: true });
  });

  router.post('/users/:id/unlock', async (req, res) => {
    const user = await findUser(req);
    await accounts.unlock(user.id);
    await log(req, 'admin.user.unlocked', 'user', user.id);
    res.json({ ok: true });
  });

  router.post('/users/:id/verify-email', async (req, res) => {
    const user = await findUser(req);
    await accounts.update(user.id, { emailVerified: true });
    await sessions.refreshUser(user.id);
    await log(req, 'admin.user.email_verified', 'user', user.id);
    res.json({ ok: true });
  });

  router.delete('/users/:id/sessions', async (req, res) => {
    const user = await findUser(req);
    const count = user.id === req.user.id
      ? await sessions.revokeAll(user.id, req.session.id)
      : await sessions.revokeAll(user.id);
    await log(req, 'admin.user.sessions_revoked', 'user', user.id, { count });
    res.json({ ok: true, count });
  });

  router.delete('/users/:id/sessions/:sessionId', async (req, res) => {
    const user = await findUser(req);
    const count = await sessions.revoke(req.params.sessionId, user.id);
    if (!count) return sendError(res, 404, 'sessionNotFound', 'Session not found');
    await log(req, 'admin.user.session_revoked', 'user', user.id);
    res.json({ ok: true });
  });

  router.get('/users.csv', async (req, res) => {
    const users = await accounts.all();
    const usage = db.usageByOwner();
    sendCsv(res, 'flyto-users.csv', [
      { label: 'id', value: u => u.id },
      { label: 'email', value: u => u.email },
      { label: 'name', value: u => u.name },
      { label: 'role', value: u => u.role },
      { label: 'status', value: u => u.status },
      { label: 'email_verified', value: u => u.emailVerified },
      { label: '2fa', value: u => u.totpEnabled },
      { label: 'storage_bytes', value: u => (usage.get(u.id) || {}).storage || 0 },
      { label: 'transfers', value: u => (usage.get(u.id) || {}).transfers || 0 },
      { label: 'quota_transfer', value: u => u.quotaTransfer },
      { label: 'quota_storage', value: u => u.quotaStorage },
      { label: 'quota_transfers', value: u => u.quotaTransfers },
      { label: 'created_at', value: u => iso(u.createdAt) },
      { label: 'last_login_at', value: u => iso(u.lastLoginAt) },
      { label: 'last_login_ip', value: u => u.lastLoginIp },
    ], users);
    await log(req, 'admin.export', 'export', 'users');
  });

  // --- transfers

  async function transferList(req) {
    const counts = await ctx.downloadCounts();
    let list = db.summaries(counts);
    const ownerIds = [...new Set(list.map(t => t.ownerId).filter(id => id !== null))];
    const owners = await accounts.getMany(ownerIds);
    list = list.map(t => {
      const owner = t.ownerId !== null ? owners.get(t.ownerId) : null;
      return { ...t, ownerEmail: owner ? owner.email : null, ownerName: owner ? owner.name : null };
    });

    const q = str(req.query.q).toLowerCase();
    if (q) {
      list = list.filter(t => t.sid.toLowerCase().includes(q)
        || (t.ownerEmail && t.ownerEmail.toLowerCase().includes(q))
        || db.get(t.sid).some(f => String(f.metadata.name).toLowerCase().includes(q)));
    }
    if (req.query.owner) {
      list = list.filter(t => req.query.owner === 'anonymous' ? t.ownerId === null : t.ownerId === +req.query.owner);
    }
    const soon = Date.now() + 86400000;
    const filters = {
      suspended: t => !!t.suspendedAt,
      partial: t => t.partial,
      oneTime: t => t.oneTime,
      password: t => t.password,
      protected: t => t.password,
      expiringSoon: t => t.expiresAt && t.expiresAt < soon,
      anonymous: t => t.ownerId === null,
      active: t => !t.suspendedAt && !t.partial,
    };
    if (filters[req.query.status]) list = list.filter(filters[req.query.status]);
    const sorts = {
      created: t => t.createdAt, size: t => t.size, expires: t => t.expiresAt || Number.MAX_SAFE_INTEGER,
      downloads: t => t.downloads, files: t => t.files, lastDownload: t => t.lastDownload || 0,
    };
    const key = sorts[req.query.sort] || sorts.created;
    const dir = req.query.dir === 'asc' ? 1 : -1;
    list.sort((a, b) => (key(a) - key(b)) * dir);
    return list;
  }

  router.get('/transfers', async (req, res) => {
    const list = await transferList(req);
    const { page: p, perPage } = page(req);
    const base = ctx.publicUrl(req);
    res.json({
      total: list.length,
      size: list.reduce((s, t) => s + t.size, 0),
      page: p,
      perPage,
      items: list.slice((p - 1) * perPage, p * perPage).map(t => ({ ...t, url: base + t.sid })),
    });
  });

  router.get('/transfers.csv', async (req, res) => {
    const list = await transferList(req);
    const base = ctx.publicUrl(req);
    sendCsv(res, 'flyto-transfers.csv', [
      { label: 'sid', value: t => t.sid },
      { label: 'url', value: t => base + t.sid },
      { label: 'owner', value: t => t.ownerEmail || '' },
      { label: 'files', value: t => t.files },
      { label: 'size_bytes', value: t => t.size },
      { label: 'downloads', value: t => t.downloads },
      { label: 'created_at', value: t => iso(t.createdAt) },
      { label: 'expires_at', value: t => iso(t.expiresAt) },
      { label: 'one_time', value: t => t.oneTime },
      { label: 'password', value: t => t.password },
      { label: 'suspended', value: t => !!t.suspendedAt },
      { label: 'suspended_reason', value: t => t.suspendedReason },
    ], list);
    await log(req, 'admin.export', 'export', 'transfers');
  });

  function findTransfer(req) {
    const files = db.get(req.params.sid);
    if (!files) throw httpError(404, 'transferNotFound', 'Transfer not found');
    return files;
  }

  router.get('/transfers/:sid', async (req, res) => {
    const files = findTransfer(req);
    const counts = await ctx.downloadCounts();
    const summary = db.summary(req.params.sid, counts);
    const owner = summary.ownerId !== null ? await accounts.get(summary.ownerId) : null;
    const { rows } = await pool.query(`
      SELECT name, downloaded_at, ip, user_agent, size FROM downloads WHERE sid = $1
      ORDER BY downloaded_at DESC LIMIT 100`, [req.params.sid]);
    res.json({
      ...summary,
      url: ctx.publicUrl(req) + req.params.sid,
      owner: owner && { id: owner.id, email: owner.email, name: owner.name },
      items: files.map(f => ({
        key: f.key,
        name: f.metadata.name,
        type: f.metadata.type || null,
        comment: f.metadata.comment || '',
        size: +f.metadata.uploadLength,
        received: f.size === undefined ? null : f.size,
        partial: !!f.isPartial,
        createdAt: +f.metadata.createdAt,
        expiresAt: expiryOf(f),
        retention: f.metadata.retention,
        lastDownload: f.metadata.lastDownload ? +f.metadata.lastDownload : null,
        downloads: (counts[req.params.sid] && counts[req.params.sid][f.key]) || 0,
      })),
      log: rows.map(r => ({ name: r.name, at: +r.downloaded_at, ip: r.ip, userAgent: r.user_agent,
        size: r.size === null ? null : +r.size })),
      history: (await audit.list({ targetType: 'transfer', targetId: req.params.sid, perPage: 20 })).items,
    });
  });

  router.delete('/transfers/:sid', async (req, res) => {
    const files = findTransfer(req);
    const summary = db.summary(req.params.sid);
    await db.removeBucket(req.params.sid);
    await log(req, 'admin.transfer.deleted', 'transfer', req.params.sid,
      { files: files.length, size: summary.size, owner: summary.ownerId });
    res.json({ ok: true });
  });

  router.delete('/transfers/:sid/files/:key', async (req, res) => {
    const files = findTransfer(req);
    const file = files.find(f => f.key === req.params.key);
    if (!file) return sendError(res, 404, 'fileNotFound', 'File not found');
    await db.remove(req.params.sid, file.key);
    await log(req, 'admin.transfer.file_deleted', 'transfer', req.params.sid, { name: file.metadata.name });
    res.json({ ok: true });
  });

  router.post('/transfers/:sid/suspend', async (req, res) => {
    findTransfer(req);
    const reason = str(req.body && req.body.reason).slice(0, 500);
    await db.updateTransfer(req.params.sid, { suspendedAt: Date.now(), suspendedReason: reason || null });
    await log(req, 'admin.transfer.suspended', 'transfer', req.params.sid, { reason });
    res.json({ ok: true });
  });

  router.post('/transfers/:sid/unsuspend', async (req, res) => {
    findTransfer(req);
    await db.updateTransfer(req.params.sid, { suspendedAt: null, suspendedReason: null });
    await log(req, 'admin.transfer.unsuspended', 'transfer', req.params.sid);
    res.json({ ok: true });
  });

  router.post('/transfers/:sid/expiration', async (req, res) => {
    findTransfer(req);
    const expiresAt = req.body && req.body.expiresAt;
    if (expiresAt !== null && (!Number.isSafeInteger(expiresAt) || expiresAt < Date.now())) {
      return sendError(res, 400, 'invalidDate', 'The expiration must be in the future');
    }
    await db.setExpiration(req.params.sid, expiresAt);
    await log(req, 'admin.transfer.expiration', 'transfer', req.params.sid, { expiresAt });
    res.json({ ok: true, expiresAt: db.summary(req.params.sid).expiresAt });
  });

  router.post('/transfers/:sid/owner', async (req, res) => {
    findTransfer(req);
    const ownerId = req.body && req.body.ownerId ? +req.body.ownerId : null;
    if (ownerId !== null && !await accounts.get(ownerId)) throw httpError(404, 'userNotFound', 'User not found');
    await db.updateTransfer(req.params.sid, { ownerId });
    await log(req, 'admin.transfer.owner_changed', 'transfer', req.params.sid, { ownerId });
    res.json({ ok: true });
  });

  router.post('/transfers/bulk', async (req, res) => {
    const { sids, action, reason } = req.body || {};
    if (!Array.isArray(sids) || !sids.length || sids.length > 500) {
      return sendError(res, 400, 'invalidSelection', 'Select between 1 and 500 transfers');
    }
    const actions = {
      delete: sid => db.removeBucket(sid),
      suspend: sid => db.updateTransfer(sid, { suspendedAt: Date.now(), suspendedReason: str(reason).slice(0, 500) || null }),
      unsuspend: sid => db.updateTransfer(sid, { suspendedAt: null, suspendedReason: null }),
    };
    if (!Object.hasOwn(actions, action)) return sendError(res, 400, 'invalidAction', 'Unknown action');
    let done = 0;
    for (const sid of sids.filter(s => typeof s === 'string' && db.get(s))) {
      await actions[action](sid);
      done++;
    }
    await log(req, `admin.transfer.bulk_${ action }`, 'transfer', null, { sids, done });
    res.json({ ok: true, done });
  });

  // --- downloads journal

  async function downloadRows(req, limit, offset) {
    const params = [];
    const where = [];
    if (req.query.sid) {
      params.push(str(req.query.sid));
      where.push(`d.sid = $${ params.length }`);
    }
    if (req.query.q) {
      params.push(`%${ str(req.query.q).replace(/[\\%_]/g, c => '\\' + c) }%`);
      where.push(`(d.name ILIKE $${ params.length } OR d.sid ILIKE $${ params.length } OR d.ip ILIKE $${ params.length } OR u.email ILIKE $${ params.length })`);
    }
    const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const { rows: [{ total }] } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM downloads d LEFT JOIN users u ON u.id = d.owner_id ${ clause }`, params);
    params.push(limit, offset);
    const { rows } = await pool.query(`
      SELECT d.id, d.sid, d.file_key, d.name, d.downloaded_at, d.ip, d.user_agent, d.size, d.owner_id, u.email AS owner_email
      FROM downloads d LEFT JOIN users u ON u.id = d.owner_id ${ clause }
      ORDER BY d.downloaded_at DESC LIMIT $${ params.length - 1 } OFFSET $${ params.length }`, params);
    return {
      total,
      items: rows.map(r => ({
        id: +r.id, sid: r.sid, key: r.file_key, name: r.name, at: +r.downloaded_at, ip: r.ip,
        userAgent: r.user_agent, size: r.size === null ? null : +r.size,
        ownerId: r.owner_id === null ? null : +r.owner_id, ownerEmail: r.owner_email,
        available: !!(db.get(r.sid) || []).find(f => f.key === r.file_key),
      })),
    };
  }

  router.get('/downloads', async (req, res) => {
    const { page: p, perPage } = page(req);
    res.json({ page: p, perPage, ...await downloadRows(req, perPage, (p - 1) * perPage) });
  });

  router.get('/downloads.csv', async (req, res) => {
    const { items } = await downloadRows(req, 100000, 0);
    sendCsv(res, 'flyto-downloads.csv', [
      { label: 'at', value: d => iso(d.at) },
      { label: 'sid', value: d => d.sid },
      { label: 'file', value: d => d.name },
      { label: 'size_bytes', value: d => d.size },
      { label: 'owner', value: d => d.ownerEmail },
      { label: 'ip', value: d => d.ip },
      { label: 'user_agent', value: d => d.userAgent },
    ], items);
    await log(req, 'admin.export', 'export', 'downloads');
  });

  // --- invitations

  router.get('/invites', async (req, res) => {
    res.json(await accounts.listInvites());
  });

  router.post('/invites', async (req, res) => {
    const body = req.body || {};
    const days = body.expiresInDays === null || body.expiresInDays === '' ? null : +(body.expiresInDays ?? 7);
    if (days !== null && (!Number.isFinite(days) || days <= 0 || days > 3650)) {
      return sendError(res, 400, 'invalidDate', 'Invalid expiration');
    }
    const { token, invite } = await accounts.createInvite({
      email: str(body.email).trim() || null,
      role: body.role === 'admin' ? 'admin' : 'user',
      note: str(body.note),
      maxUses: body.maxUses === null || body.maxUses === '' ? null : +(body.maxUses ?? 1),
      expiresAt: days === null ? null : Date.now() + days * 86400000,
      createdBy: req.user.id,
    });
    const link = `${ ctx.publicUrl(req) }register?invite=${ token }`;
    let mailed = false;
    if (invite.email && body.sendEmail !== false) {
      mailed = await mail({ email: invite.email, name: invite.email, locale: null }, req, 'invite',
        { url: link, admin: req.user.name || req.user.email });
    }
    await log(req, 'admin.invite.created', 'invite', invite.id,
      { email: invite.email, role: invite.role, maxUses: invite.maxUses, mailed });
    res.status(201).json({ invite, link, mailed });
  });

  router.post('/invites/:id/revoke', async (req, res) => {
    const invite = await accounts.revokeInvite(req.params.id);
    await log(req, 'admin.invite.revoked', 'invite', invite.id, { email: invite.email });
    res.json({ ok: true });
  });

  router.delete('/invites/:id', async (req, res) => {
    await accounts.deleteInvite(req.params.id);
    await log(req, 'admin.invite.deleted', 'invite', req.params.id);
    res.json({ ok: true });
  });

  // --- audit journal

  function auditFilter(req) {
    return {
      q: str(req.query.q), action: str(req.query.action),
      actorId: req.query.actor ? +req.query.actor : null,
      targetType: str(req.query.targetType), targetId: str(req.query.targetId),
      from: req.query.from ? +req.query.from : null, to: req.query.to ? +req.query.to : null,
    };
  }

  router.get('/audit', async (req, res) => {
    const [result, actions] = await Promise.all([
      audit.list({ ...auditFilter(req), ...page(req) }),
      audit.actions(),
    ]);
    res.json({ ...result, actions });
  });

  router.get('/audit.csv', async (req, res) => {
    const { items } = await audit.list({ ...auditFilter(req), page: 1, perPage: 100000 });
    sendCsv(res, 'flyto-audit.csv', [
      { label: 'at', value: e => iso(e.at) },
      { label: 'action', value: e => e.action },
      { label: 'actor', value: e => e.actorEmail },
      { label: 'target_type', value: e => e.targetType },
      { label: 'target_id', value: e => e.targetId },
      { label: 'ip', value: e => e.ip },
      { label: 'details', value: e => e.details },
    ], items);
  });

  // --- settings

  router.get('/settings', async (req, res) => {
    const schema = {};
    for (const [key, def] of Object.entries(Settings.schema)) {
      schema[key] = { type: def.type, default: def.type === 'secret' ? '' : def.default, values: def.values,
        min: def.min, max: def.max };
    }
    res.json({
      values: settings.all(),
      schema,
      retentionLabels: config.retentions,
      mail: { enabled: mailer.enabled, fromEnv: !!config.smtpUrl },
      languages: Object.keys(config.languages),
      storage: { used: db.totals().size, transfers: Object.keys(db.db).length, disk: await stats.disk(config.uploadDir) },
    });
  });

  router.patch('/settings', async (req, res) => {
    const changed = await settings.update(req.body || {}, req.user.id);
    await cache.del('stats:dashboard:30');
    if (Object.keys(changed).length) await log(req, 'admin.settings.updated', 'settings', null, { changed });
    res.json({ values: settings.all(), changed: Object.keys(changed) });
  });

  router.post('/settings/reset', async (req, res) => {
    const key = str(req.body && req.body.key);
    const change = await settings.reset(key);
    await log(req, 'admin.settings.reset', 'settings', key, change);
    res.json({ values: settings.all() });
  });

  router.post('/settings/test-email', async (req, res) => {
    await mailer.verify();
    const to = str(req.body && req.body.to).trim() || req.user.email;
    accounts.checkEmail(to);
    await mailer.send(to, req.translations, 'test', { name: req.user.name || req.user.email });
    await log(req, 'admin.settings.test_email', 'settings', null, { to });
    res.json({ ok: true, to });
  });

  // --- maintenance

  router.post('/maintenance/gc', async (req, res) => {
    const removed = await db.gc();
    await log(req, 'admin.maintenance.gc', 'maintenance', null, { removed });
    res.json({ removed });
  });

  async function findOrphans() {
    const result = { files: [], directories: [], missing: [] };
    const root = config.uploadDir;
    let entries = [];
    try {
      entries = await fs.promises.readdir(root, { withFileTypes: true });
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    for (const dir of entries) {
      if (!dir.isDirectory()) continue;
      const sid = dir.name;
      const bucket = db.get(sid) || [];
      // e.g. lost+found on a dedicated disk
      const names = await fs.promises.readdir(path.join(root, sid)).catch(() => null);
      if (!names) continue;
      if (!names.length) result.directories.push(sid);
      for (const name of names) {
        if (!bucket.some(f => f.key === name)) {
          const stat = await fs.promises.stat(path.join(root, sid, name)).catch(() => null);
          result.files.push({ sid, name, size: stat ? stat.size : null });
        }
      }
    }
    for (const sid of Object.keys(db.db)) {
      for (const f of db.get(sid)) {
        if (!fs.existsSync(store.getFilename(`${ sid }++${ f.key }`))) result.missing.push({ sid, key: f.key, name: f.metadata.name });
      }
    }
    return result;
  }

  router.get('/maintenance/orphans', async (req, res) => {
    res.json(await findOrphans());
  });

  router.post('/maintenance/orphans', async (req, res) => {
    const orphans = await findOrphans();
    for (const { sid, name } of orphans.files) {
      if (!utils.isSafeBasename(sid) || !utils.isSafeBasename(name)) continue;
      await fs.promises.unlink(path.join(config.uploadDir, sid, name)).catch(() => {});
    }
    for (const { sid, key } of orphans.missing) await db.remove(sid, key).catch(e => console.error(e));
    for (const sid of [...orphans.directories, ...orphans.files.map(f => f.sid)]) {
      if (!db.get(sid) && utils.isSafeBasename(sid)) await fs.promises.rmdir(path.join(config.uploadDir, sid)).catch(() => {});
    }
    const summary = { files: orphans.files.length, missing: orphans.missing.length, directories: orphans.directories.length };
    await log(req, 'admin.maintenance.orphans', 'maintenance', null, summary);
    res.json(summary);
  });

  router.post('/maintenance/purge', async (req, res) => {
    const [sessionsRemoved, tokens, auditRemoved, downloads] = await Promise.all([
      sessions.purgeExpired(),
      accounts.purgeTokens(),
      audit.purge(settings.get('auditRetentionDays')),
      ctx.purgeDownloadLog(),
    ]);
    const summary = { sessions: sessionsRemoved, tokens, audit: auditRemoved, downloads };
    await log(req, 'admin.maintenance.purge', 'maintenance', null, summary);
    res.json(summary);
  });

  router.post('/maintenance/cache', async (req, res) => {
    const removed = await cache.clear();
    await log(req, 'admin.maintenance.cache_cleared', 'maintenance', null, { removed });
    res.json({ removed });
  });

  router.post('/maintenance/revoke-sessions', async (req, res) => {
    const { rows } = await pool.query('DELETE FROM sessions WHERE id <> $1 RETURNING id', [req.session.id]);
    await Promise.all(rows.map(r => cache.del(`session:${ r.id }`)));
    await log(req, 'admin.maintenance.sessions_revoked', 'maintenance', null, { count: rows.length });
    res.json({ count: rows.length });
  });

  return router;
};
