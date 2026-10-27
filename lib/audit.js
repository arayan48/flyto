'use strict';
const debug = require('debug')('flyto:audit');

/**
 * Security and administration journal: logins, account changes, admin actions.
 */
class Audit {

  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Never throws: a failing journal must not break the action it records.
   * @param {Object} entry
   * @param {string} entry.action e.g. user.login, admin.user.delete
   * @param {Object} [entry.actor] user doing the action
   * @param {Object} [entry.req] request, for the IP
   */
  async log({ action, actor = null, req = null, targetType = null, targetId = null, details = {} }) {
    debug(`${ action } by ${ actor ? actor.email : '-' } on ${ targetType || '-' }:${ targetId || '-' }`);
    try {
      await this.pool.query(`
        INSERT INTO audit_log (at, actor_id, actor_email, action, target_type, target_id, ip, details)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [Date.now(), actor ? actor.id : null, actor ? actor.email : null, action, targetType,
          targetId == null ? null : String(targetId), req ? req.ip : null, JSON.stringify(details)]);
    } catch (e) {
      console.error(`Could not write audit log ${ action }: ${ e.message }`);
    }
  }

  async list({ q = '', action = '', actorId = null, targetType = '', targetId = '', from = null, to = null,
    page = 1, perPage = 50 } = {}) {
    const where = [];
    const params = [];
    const add = (sql, value) => {
      params.push(value);
      where.push(sql.replace('?', `$${ params.length }`));
    };
    if (action) add(action.endsWith('.') ? 'action LIKE ?' : 'action = ?', action.endsWith('.') ? action + '%' : action);
    if (actorId) add('actor_id = ?', actorId);
    if (targetType) add('target_type = ?', targetType);
    if (targetId) add('target_id = ?', String(targetId));
    if (from) add('at >= ?', from);
    if (to) add('at <= ?', to);
    if (q) {
      params.push(`%${ q.replace(/[\\%_]/g, c => '\\' + c) }%`);
      const i = `$${ params.length }`;
      where.push(`(actor_email ILIKE ${ i } OR action ILIKE ${ i } OR target_id ILIKE ${ i } OR ip ILIKE ${ i } OR details::text ILIKE ${ i })`);
    }
    const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const { rows: [{ total }] } = await this.pool.query(`SELECT COUNT(*)::int AS total FROM audit_log ${ clause }`, params);
    params.push(perPage, (page - 1) * perPage);
    const { rows } = await this.pool.query(`
      SELECT id, at, actor_id, actor_email, action, target_type, target_id, ip, details
      FROM audit_log ${ clause } ORDER BY at DESC, id DESC LIMIT $${ params.length - 1 } OFFSET $${ params.length }`,
      params);
    return { total, page, perPage, items: rows.map(toEntry) };
  }

  async actions() {
    const { rows } = await this.pool.query('SELECT DISTINCT action FROM audit_log ORDER BY action');
    return rows.map(r => r.action);
  }

  async purge(days) {
    const { rowCount } = await this.pool.query('DELETE FROM audit_log WHERE at < $1', [Date.now() - days * 86400000]);
    return rowCount;
  }
}

function toEntry(row) {
  return {
    id: +row.id,
    at: +row.at,
    actorId: row.actor_id === null ? null : +row.actor_id,
    actorEmail: row.actor_email,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    ip: row.ip,
    details: row.details,
  };
}

module.exports = Audit;
