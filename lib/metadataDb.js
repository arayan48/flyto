'use strict';
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const debug = require('debug')('flyto:metadata');

const SCHEMA_VERSION = 1;

/**
 * SQLite persistence for file metadata (replaces the <fid>.json sidecar files)
 * and a log of completed downloads.
 * The API is async to stay interchangeable with PgMetadataDb.
 */
class MetadataDb {

  constructor(file) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.file = file;
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    this._migrate();

    this.stmts = {
      get: this.db.prepare('SELECT data FROM files WHERE fid = ?'),
      upsert: this.db.prepare(`
        INSERT INTO files (fid, sid, file_key, data, updated_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(fid) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`),
      del: this.db.prepare('DELETE FROM files WHERE fid = ?'),
      all: this.db.prepare('SELECT fid FROM files ORDER BY sid, file_key'),
      logDownload: this.db.prepare('INSERT INTO downloads (sid, file_key, name, downloaded_at) VALUES (?, ?, ?, ?)'),
      downloadCounts: this.db.prepare('SELECT sid, file_key, COUNT(*) AS count FROM downloads GROUP BY sid, file_key'),
    };
  }


  /**
   * @private
   */
  _migrate() {
    const { user_version: version } = this.db.prepare('PRAGMA user_version').get();
    if (version >= SCHEMA_VERSION) return;
    debug(`Migrating schema ${ version } -> ${ SCHEMA_VERSION }`);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS files (
        fid        TEXT PRIMARY KEY,
        sid        TEXT NOT NULL,
        file_key   TEXT NOT NULL,
        data       TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS files_sid ON files (sid);
      CREATE TABLE IF NOT EXISTS downloads (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        sid           TEXT NOT NULL,
        file_key      TEXT NOT NULL,
        name          TEXT,
        downloaded_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS downloads_file ON downloads (sid, file_key);
      PRAGMA user_version = ${ SCHEMA_VERSION };
    `);
  }


  async get(fid) {
    const row = this.stmts.get.get(fid);
    return row ? JSON.parse(row.data) : null;
  }


  async set(fid, data) {
    const [sid, key] = fid.split('++');
    this.stmts.upsert.run(fid, sid, key, JSON.stringify(data), Date.now());
  }


  async delete(fid) {
    this.stmts.del.run(fid);
  }


  async fids() {
    return this.stmts.all.all().map(row => row.fid);
  }


  async logDownload(sid, key, name) {
    this.stmts.logDownload.run(sid, key, name || null, Date.now());
  }


  /**
   * @returns {Object<string, Object<string, number>>} sid -> key -> download count
   */
  async downloadCounts() {
    const result = {};
    for (const { sid, file_key, count } of this.stmts.downloadCounts.all()) {
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
    this.db.close();
  }
}

module.exports = MetadataDb;
