'use strict';
const { Pool } = require('pg');
const debug = require('debug')('flyto:metadata');
const MetadataDb = require('./metadataDb');

/**
 * PostgreSQL persistence for file metadata and the download log,
 * same API as the SQLite MetadataDb. Used when `dbUrl` is set,
 * e.g. to run the database as its own container.
 */
class PgMetadataDb {

  constructor(url) {
    this.pool = new Pool({ connectionString: url });
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


  async close() {
    await this.pool.end();
  }
}

// only touches the upload dir and the async get/set API
PgMetadataDb.prototype.importLegacyJson = MetadataDb.prototype.importLegacyJson;

module.exports = PgMetadataDb;
