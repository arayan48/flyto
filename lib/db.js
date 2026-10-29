'use strict';
const fs = require('fs');
const path = require('path');
const debug = require('debug')('flyto:db');
const config = require('../config');

// an upload nobody resumed for this long is dropped, it would otherwise hold quota until maxAge
const PARTIAL_MAX_AGE = 48 * 3600 * 1000;

/**
 * When a file expires: an explicit expiresAt set from /admin wins, then the
 * retention chosen at upload, never later than maxAge.
 */
function expiryOf(file) {
  const m = file.metadata || {};
  if (m.expiresAt) return +m.expiresAt;
  const maxAgeAt = (+m.createdAt) + config.maxAge * 1000;
  if (Number.isInteger(+m.retention)) return Math.min(maxAgeAt, (+m.createdAt) + (+m.retention) * 1000);
  return maxAgeAt;
}

// between two gc runs an expired file must not be served
function isExpired(file, now = Date.now()) {
  return !file.isPartial && expiryOf(file) <= now;
}

module.exports = class DB {

  constructor(uploadDir, store) {
    this.initialized = false;
    // no prototype: a bucket id such as __proto__ must not hit Object.prototype
    this.db = Object.create(null);
    // sid -> { ownerId, uploader, createdAt, suspendedAt, suspendedReason }
    this.transfers = new Map();
    // fids of one-time files with a running download
    this.claims = new Set();

    this.uploadDir = uploadDir;
    this.store = store;

    setInterval(() => this.gc().catch(e => console.error(e)), 60 * 1000).unref();
  }


  /**
   * Delete expired files and abandoned uploads.
   * @returns {Promise<number>} removed files
   */
  async gc(now = Date.now()) {
    const expired = [];
    for (const sid of Object.keys(this.db)) {
      for (const f of this.db[sid]) {
        // a long upload outlives a short retention: only its own age counts until it is complete
        const gone = f.isPartial ? now - (+f.metadata.createdAt) > PARTIAL_MAX_AGE : expiryOf(f) <= now;
        if (gone) expired.push([sid, f.key]);
      }
    }
    await Promise.all(expired.map(async ([sid, key]) => {
      debug(`Expired ${sid}++${key}`);
      try {
        await this.remove(sid, key);
      } catch (e) {
        console.error(e);
      }
    }));
    return expired.length;
  }


  async init() {
    if(this.initialized) return;
    this.initialized = true;

    try {
      await this._sync();
    } catch(e) {
      this.initialized = false;
      e.message = `db initialization failed with error ${e.message}`;
      throw e;
    }
  }


  async _sync() {
    fs.mkdirSync(this.uploadDir, { recursive: true });
    await this.store.metadata.importLegacyJson(this.uploadDir);

    await Promise.all((await this.store.list()).map(async (fid) => {
      const [sid, key] = fid.split('++');
      try {
        let info = await this.store.info(fid);
        this.add(sid, key, info);
      } catch(e) {
        console.error(e);
      }
    }));

    for (const row of await this.store.metadata.transfers()) {
      this.transfers.set(row.sid, {
        ownerId: row.owner_id === null ? null : +row.owner_id,
        uploader: row.uploader,
        createdAt: +row.created_at,
        suspendedAt: row.suspended_at === null ? null : +row.suspended_at,
        suspendedReason: row.suspended_reason,
      });
    }
    // transfers uploaded before accounts existed have no row: anonymous
    for (const sid of Object.keys(this.db)) {
      if (this.transfers.has(sid)) continue;
      const createdAt = Math.min(...this.db[sid].map(f => +f.metadata.createdAt || Date.now()));
      this.transfers.set(sid, { ownerId: null, uploader: null, createdAt, suspendedAt: null, suspendedReason: null });
    }
  }


  add(sid, key, data) {
    if(!this.initialized) throw new Error('DB not initialized');
    if(!this.db[sid]) this.db[sid] = [];
    data.key = key;
    const old = this.db[sid].findIndex(i => i.key === key);
    if(old !== -1) {
      this.db[sid].splice(old, 1, data);
      debug(`Updated ${sid}++${key}`);
    } else {
      this.db[sid].push(data);
      debug(`Added ${sid}++${key}`);
    }
  }


  async remove(sid, key) {
    if(!this.initialized) throw new Error('DB not initialized');
    debug(`Remove ${sid}++${key}`);
    await this.store.del(sid + '++' + key);
    // tolerate concurrent removal of the same file
    const bucket = this.get(sid);
    if(!bucket) return;
    const i = bucket.findIndex(item => item.key === key);
    if(i === -1) return;
    bucket.splice(i, 1);
    if(bucket.length === 0) {
      delete this.db[sid];
      this.transfers.delete(sid);
      await this.store.metadata.deleteTransfer(sid);
      try {
        await fs.promises.rmdir(path.resolve(this.uploadDir, sid));
      } catch(e) {
        if(e.code !== 'ENOENT' && e.code !== 'ENOTEMPTY') throw e;
      }
    }
  }


  async removeBucket(sid) {
    const files = [...(this.get(sid) || [])];
    for (const file of files) await this.remove(sid, file.key);
    return files.length;
  }


  /**
   * Atomically claim a file for a one-time download.
   * Must stay synchronous: no await between check and set.
   * @returns {boolean} false if already claimed or not (anymore) in the db
   */
  claim(sid, key) {
    const fid = `${sid}++${key}`;
    if(this.claims.has(fid)) return false;
    const bucket = this.get(sid);
    if(!bucket || !bucket.some(item => item.key === key)) return false;
    this.claims.add(fid);
    return true;
  }


  release(sid, key) {
    this.claims.delete(`${sid}++${key}`);
  }


  isClaimed(sid, key) {
    return this.claims.has(`${sid}++${key}`);
  }


  async updateLastDownload(sid, key) {
    debug(`Update last download ${sid}++${key}`);
    const data = (this.get(sid) || []).find(item => item.key === key);
    if(!data) return;
    data.metadata.lastDownload = Date.now();
    await this.store.update(`${sid}++${key}`, data);
  }


  async updateMetadata(sid, key, data) {
    debug(`Update metadata ${ sid }++${ key }`);
    const file = (this.get(sid) || []).find(item => item.key === key);
    if (!file) return;
    file.metadata = { ...file.metadata, ...data };
    const fid = `${ sid }++${ key }`;
    if (!file.isPartial) return this.store.update(fid, file);
    // in memory an unfinished upload is only its reservation: keep the stored tus
    // record (uploadLength...) and change its metadata alone
    const stored = await this.store.metadata.get(fid);
    if (!stored) return;
    stored.metadata = { ...stored.metadata, ...data };
    await this.store.update(fid, stored);
  }

  async lock(sid) {
    const files = this.get(sid);
    if(!files) return;
    await Promise.all(files.map(async file => {
      await this.updateMetadata(sid, file.key, { buckedLocked: true });
    }));
  }

  isLocked(sid) {
    const files = this.get(sid);
    if(!files) return false;
    return files.some(file => file.metadata.buckedLocked);
  }

  get(sid) {
    return this.db[sid];
  }

  recordDownload(sid, key, name, extra) {
    return this.store.metadata.logDownload(sid, key, name, extra);
  }

  downloadCounts() {
    return this.store.metadata.downloadCounts();
  }

  bucketSize(sid) {
    const bucket = this.get(sid);
    if(!bucket) return 0;
    return bucket.reduce((v, file) => v + +file.metadata.uploadLength, 0);
  }


  // --- transfers and their owners

  transfer(sid) {
    return this.transfers.get(sid) || null;
  }

  /**
   * Gives a new bucket to its uploader. Synchronous up to the returned promise,
   * so two concurrent first uploads cannot both own the bucket.
   * @param {string|null} uploader for an anonymous bucket, the hash of its uploader cookie
   * @returns {Promise} resolves once the transfer is stored
   */
  claimTransfer(sid, ownerId, uploader = null) {
    if (this.transfers.has(sid)) return Promise.resolve();
    const transfer = { ownerId, uploader, createdAt: Date.now(), suspendedAt: null, suspendedReason: null };
    this.transfers.set(sid, transfer);
    return this.store.metadata.createTransfer(sid, transfer);
  }

  async updateTransfer(sid, patch) {
    const transfer = this.transfers.get(sid);
    if (!transfer) return null;
    Object.assign(transfer, patch);
    await this.store.metadata.createTransfer(sid, transfer);
    await this.store.metadata.updateTransfer(sid, transfer);
    return transfer;
  }

  async setExpiration(sid, expiresAt) {
    const files = this.get(sid) || [];
    await Promise.all(files.map(file => this.updateMetadata(sid, file.key, { expiresAt })));
  }

  sidsOf(ownerId) {
    const sids = [];
    for (const [sid, t] of this.transfers) {
      if (t.ownerId === ownerId && this.db[sid]) sids.push(sid);
    }
    return sids;
  }

  /**
   * Storage counts the announced size of unfinished uploads too: that space is reserved.
   */
  usage(ownerId) {
    const sids = this.sidsOf(ownerId);
    return {
      storage: sids.reduce((sum, sid) => sum + this.bucketSize(sid), 0),
      transfers: sids.length,
      files: sids.reduce((sum, sid) => sum + this.db[sid].length, 0),
    };
  }

  usageByOwner() {
    const result = new Map();
    for (const sid of Object.keys(this.db)) {
      const t = this.transfers.get(sid);
      const ownerId = t ? t.ownerId : null;
      const entry = result.get(ownerId) || { storage: 0, transfers: 0, files: 0 };
      entry.storage += this.bucketSize(sid);
      entry.transfers++;
      entry.files += this.db[sid].length;
      result.set(ownerId, entry);
    }
    return result;
  }

  /**
   * One line per bucket for the dashboards, newest first.
   */
  summaries(downloadCounts = {}) {
    return Object.keys(this.db).map(sid => this.summary(sid, downloadCounts)).sort((a, b) => b.createdAt - a.createdAt);
  }

  summary(sid, downloadCounts = {}) {
    const files = this.db[sid] || [];
    const t = this.transfers.get(sid) || {};
    const counts = downloadCounts[sid] || {};
    let expiresAt = Infinity;
    for (const f of files) expiresAt = Math.min(expiresAt, expiryOf(f));
    const first = files[0] ? files[0].metadata : {};
    return {
      sid,
      ownerId: t.ownerId === undefined ? null : t.ownerId,
      createdAt: Math.min(...files.map(f => +f.metadata.createdAt || Infinity), t.createdAt || Infinity),
      expiresAt: Number.isFinite(expiresAt) ? expiresAt : null,
      oneTime: files.some(f => f.metadata.retention === 'one-time'),
      retention: first.retention || null,
      password: files.some(f => !!f.metadata.password),
      locked: files.some(f => f.metadata.buckedLocked),
      partial: files.some(f => f.isPartial),
      suspendedAt: t.suspendedAt || null,
      suspendedReason: t.suspendedReason || null,
      files: files.length,
      size: files.reduce((sum, f) => sum + (+f.metadata.uploadLength || 0), 0),
      downloads: Object.values(counts).reduce((a, b) => a + b, 0),
      lastDownload: Math.max(0, ...files.map(f => +f.metadata.lastDownload || 0)) || null,
    };
  }

};

module.exports.expiryOf = expiryOf;
module.exports.isExpired = isExpired;
