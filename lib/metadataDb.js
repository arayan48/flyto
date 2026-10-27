'use strict';
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const debug = require('debug')('flyto:metadata');

/**
 * PostgreSQL persistence for file metadata (replaces the <fid>.json sidecar files)
 * and a log of completed downloads.
 */
class MetadataDb {

  constructor(url) {
    this.pool = new Pool({ connectionString: url, allowExitOnIdle: true });
    this.pool.on('error', e => console.error(`PostgreSQL pool error: ${ e.message }`));
    this.ready = this._migrate();
  }


  /**
   * @private
   */
  async _migrate() {
    debug('Ensuring PostgreSQL schema');
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS files (
        fid        TEXT PRIMARY KEY,
        sid        TEXT NOT NULL,
        file_key   TEXT NOT NULL,
        data       JSONB NOT NULL,
        updated_at BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS files_sid ON files (sid);
      CREATE TABLE IF NOT EXISTS downloads (
        id            BIGSERIAL PRIMARY KEY,
        sid           TEXT NOT NULL,
        file_key      TEXT NOT NULL,
        name          TEXT,
        downloaded_at BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS downloads_file ON downloads (sid, file_key);
    `);
  }


  /**
   * @private
   */
  async _query(text, params) {
    await this.ready;
    return this.pool.query(text, params);
  }


  async get(fid) {
    const { rows } = await this._query('SELECT data FROM files WHERE fid = $1', [fid]);
    return rows.length ? rows[0].data : null;
  }


  async set(fid, data) {
    const [sid, key] = fid.split('++');
    await this._query(`
      INSERT INTO files (fid, sid, file_key, data, updated_at) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (fid) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      [fid, sid, key, JSON.stringify(data), Date.now()]);
  }


  async delete(fid) {
    await this._query('DELETE FROM files WHERE fid = $1', [fid]);
  }


  async fids() {
    const { rows } = await this._query('SELECT fid FROM files ORDER BY sid, file_key');
    return rows.map(row => row.fid);
  }


  async logDownload(sid, key, name) {
    await this._query('INSERT INTO downloads (sid, file_key, name, downloaded_at) VALUES ($1, $2, $3, $4)',
      [sid, key, name || null, Date.now()]);
  }


  /**
   * @returns {Promise<Object<string, Object<string, number>>>} sid -> key -> download count
   */
  async downloadCounts() {
    const { rows } = await this._query(
      'SELECT sid, file_key, COUNT(*)::int AS count FROM downloads GROUP BY sid, file_key');
    const result = {};
    for (const { sid, file_key, count } of rows) {
      if (!result[sid]) result[sid] = {};
      result[sid][file_key] = count;
    }
    return result;
  }


  /**
   * Import legacy <uploadDir>/<sid>/<key>.json sidecar files and delete them.
   * @returns {number} count of imported files
   */
  async importLegacyJson(uploadDir) {
    if (!fs.existsSync(uploadDir)) return 0;
    let imported = 0;
    for (const sid of fs.readdirSync(uploadDir)) {
      const dir = path.join(uploadDir, sid);
      if (!fs.statSync(dir).isDirectory()) continue;
      for (const name of fs.readdirSync(dir)) {
        if (path.extname(name) !== '.json') continue;
        const jsonFile = path.join(dir, name);
        const fid = `${ sid }++${ path.basename(name, '.json') }`;
        try {
          if (!await this.get(fid)) await this.set(fid, JSON.parse(fs.readFileSync(jsonFile, 'utf8')));
          fs.unlinkSync(jsonFile);
          imported++;
        } catch (e) {
          console.error(`Could not import legacy metadata ${ jsonFile }: ${ e.message }`);
        }
      }
    }
    if (imported) debug(`Imported ${ imported } legacy metadata files`);
    return imported;
  }


  async close() {
    await this.pool.end();
  }
}

module.exports = MetadataDb;
