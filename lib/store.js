'use strict';
const fsp = require('fs-promise');
const path = require('path');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');
const debug = require('debug')('flyto:store');
const httpErrors = require('http-errors');
const { OffsetMismatch } = require('./tusboy/store/errors');

// TODO ???: make tus-store complaint: https://github.com/blockai/abstract-tus-store
class Store {

  /**
   * @param {string} targetDir upload directory for the file contents
   * @param {import('./metadataDb')} metadataDb metadata persistence
   */
  constructor(targetDir, metadataDb) {
    this.dir = path.resolve(targetDir);
    this.metadata = metadataDb;
  }


  getFilename(fid) {
    if (typeof fid !== 'string' || fid.includes('\0')) {
      throw new Error('file name not in jail path. aborting');
    }
    const base = this.dir;
    const resolved = path.resolve(base, fid.replace(/\+\+/g, '/'));
    const rel = path.relative(base, resolved);
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error('file name not in jail path. aborting');
    }
    return resolved;
  }


  async create(fid, opts = {}) {
    debug(`New File ${this.getFilename(fid)}`);
    await fsp.ensureDir(path.dirname(this.getFilename(fid)));
    // an empty file lets HEAD report offset 0 before the first PATCH
    await fsp.writeFile(this.getFilename(fid), '', {flag: 'a'});
    await this.metadata.set(fid, Object.assign(opts, {
      isPartial: true
    }));
    return {uploadId: fid};
  }


  async update(fid, data) {
    debug(`Update File ${this.getFilename(fid)}`);
    await this.metadata.set(fid, data);
    return data;
  }


  async info(fid) {
    try {
      const info = await this.metadata.get(fid);
      if(!info) throw httpErrors.NotFound();
      const stat = await fsp.stat(this.getFilename(fid));
      info.size = stat.size;
      info.offset = stat.size;
      debug(`Fetched Fileinfo ${this.getFilename(fid)}`);
      return info;
    } catch(e) {
      if(e.code === 'ENOENT') {
        throw httpErrors.NotFound();
      }
      throw e;
    }
  }


  async append(fid, readStream, offset, { contentLength } = {}) {
    debug(`Append Data to ${this.getFilename(fid)}`);
    const current = await this.metadata.get(fid);
    if (!current) throw httpErrors.NotFound();
    let size = 0;
    try {
      size = (await fsp.stat(this.getFilename(fid))).size;
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    if (offset !== undefined && offset !== size) {
      const err = new OffsetMismatch(`Offset mismatch, got ${offset} but expected ${size}`);
      err.offset = size;
      throw err;
    }

    // Upload-Length was checked against maxFileSize on creation, never write past it
    const remaining = Number.isInteger(current.uploadLength) ? current.uploadLength - size : Infinity;
    if (contentLength > remaining) {
      throw httpErrors(413, `Upload exceeds its Upload-Length by ${contentLength - remaining} bytes`);
    }
    let received = 0;
    const limit = new Transform({
      transform(chunk, encoding, cb) {
        received += chunk.length;
        if (received > remaining) return cb(httpErrors(413, 'Upload exceeds its Upload-Length'));
        cb(null, chunk);
      }
    });

    // No `start`: a positional write on an O_APPEND fd fails with EOPNOTSUPP on
    // musl >= 1.2.5 with kernels < 6.9 (no RWF_NOAPPEND); Linux ignores it anyway
    await pipeline(readStream, limit, fsp.createWriteStream(this.getFilename(fid), {flags: 'a'}));

    const info = await this.info(fid);
    if(info.size >= info.uploadLength) delete info.isPartial;
    await this.metadata.set(fid, info);
    debug(`Finished appending Data to ${this.getFilename(fid)}`);
    return { offset: info.offset, upload: info };
  }


  async del(fid) {
    debug(`Delete ${this.getFilename(fid)}`);
    await this.metadata.delete(fid);
    try {
      await fsp.unlink(this.getFilename(fid));
    }
    catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }


  /**
   * @returns {Promise<string[]>} fids of all known files
   */
  list() {
    return this.metadata.fids();
  }
}

module.exports = Store;
