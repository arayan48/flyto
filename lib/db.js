'use strict';
const fsp = require('fs-promise');
const path = require('path');
const debug = require('debug')('flyto:db');
const config = require('../config');

module.exports = class DB {

  constructor(uploadDir, store) {
    this.initialized = false;
    this.db = {};
    // fids of one-time files with a running download
    this.claims = new Set();

    this.uploadDir = uploadDir;
    this.store = store;

    // delete expired files
    const gc = () => {
      let sid,f,expires;
      for (sid of Object.keys(this.db)) {
        for (f of this.db[sid]) {
          // expire on maxAge
          expires = (+f.metadata.createdAt) + (config.maxAge * 1000) - Date.now();

          // respect one-time downloads
          if(expires > 0 && Number.isInteger(+f.metadata.retention)) {
            expires = (+f.metadata.createdAt) + (+f.metadata.retention * 1000) - Date.now();
          }

          if(expires <= 0) {
            debug(`Expired ${sid}++${f.key}`);
            this.remove(sid, f.key).catch(e => console.error(e));
          }
        }
      }
    };
    setInterval(gc, 60 * 1000).unref();

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


  /**
   * @private
   */
  async _sync() {
    fsp.ensureDirSync(this.uploadDir);
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
  }


  add(sid, key, data) {
    if(!this.initialized) throw new Error('DB not initialized_');
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
      try {
        await fsp.rmdir(path.resolve(this.uploadDir, sid));
      } catch(e) {
        if(e.code !== 'ENOENT' && e.code !== 'ENOTEMPTY') throw e;
      }
    }
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
    const data = this.get(sid).find(item => item.key === key);
    if(!data) return;
    data.metadata.lastDownload = Date.now();
    await this.store.update(`${sid}++${key}`, data);
  }


  async updateMetadata(sid, key, data) {
    debug(`Update metadata ${ sid }++${ key }`);
    const file = this.get(sid).find(item => item.key === key);
    if (!file) return;
    file.metadata = { ...file.metadata, ...data };
    await this.store.update(`${ sid }++${ key }`, file);
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

  recordDownload(sid, key, name) {
    return this.store.metadata.logDownload(sid, key, name);
  }

  downloadCounts() {
    return this.store.metadata.downloadCounts();
  }

  bucketSize(sid) {
    const bucket = this.get(sid);
    if(!bucket) return 0;
    return bucket.reduce((v, file) => v + +file.metadata.uploadLength, 0);
  }

};