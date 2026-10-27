'use strict';
const debug = require('debug')('flyto:cache');

const PREFIX = 'flyto:';

/**
 * Small key/value cache with TTLs, backed by Redis when FLYTO_REDIS_URL is set
 * and by process memory otherwise. Values are JSON. Every call degrades to a
 * cache miss when Redis is unreachable, the database stays the source of truth.
 */
class Cache {

  constructor(url) {
    this.memory = new Map();
    this.redis = null;
    if (url) {
      const { createClient } = require('redis');
      this.redis = createClient({
        url,
        socket: { reconnectStrategy: retries => Math.min(retries * 500, 10000) },
      });
      let reported = false;
      this.redis.on('error', e => {
        if (!reported) console.error(`Redis error: ${ e.message }`);
        reported = true;
      });
      this.redis.on('ready', () => {
        reported = false;
        debug('Redis ready');
      });
      this.redis.connect().catch(e => console.error(`Redis connection failed: ${ e.message }`));
    }
    setInterval(() => this._sweep(), 60 * 1000).unref();
  }

  get backend() {
    return this.redis ? 'redis' : 'memory';
  }

  get connected() {
    return this.redis ? this.redis.isReady : true;
  }

  _sweep() {
    const now = Date.now();
    for (const [k, v] of this.memory) {
      if (v.expires <= now) this.memory.delete(k);
    }
  }

  async get(key) {
    if (this.redis) {
      if (!this.redis.isReady) return undefined;
      try {
        const raw = await this.redis.get(PREFIX + key);
        return raw === null ? undefined : JSON.parse(raw);
      } catch (e) {
        debug(`get ${ key }: ${ e.message }`);
        return undefined;
      }
    }
    const entry = this.memory.get(key);
    if (!entry) return undefined;
    if (entry.expires <= Date.now()) {
      this.memory.delete(key);
      return undefined;
    }
    return entry.value;
  }

  async set(key, value, ttlSeconds) {
    if (this.redis) {
      if (!this.redis.isReady) return;
      try {
        await this.redis.set(PREFIX + key, JSON.stringify(value), { EX: ttlSeconds });
      } catch (e) {
        debug(`set ${ key }: ${ e.message }`);
      }
      return;
    }
    this.memory.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
  }

  async del(key) {
    if (this.redis) {
      if (!this.redis.isReady) return;
      try {
        await this.redis.del(PREFIX + key);
      } catch (e) {
        debug(`del ${ key }: ${ e.message }`);
      }
      return;
    }
    this.memory.delete(key);
  }

  /**
   * Fixed window counter, used for rate limits.
   * @returns {Promise<number>} the count including this hit
   */
  async hit(key, windowSeconds) {
    if (this.redis && this.redis.isReady) {
      try {
        const count = await this.redis.incr(PREFIX + key);
        if (count === 1) await this.redis.expire(PREFIX + key, windowSeconds);
        return count;
      } catch (e) {
        debug(`hit ${ key }: ${ e.message }`);
      }
    }
    // without Redis, or while it is down, count in memory rather than not at all
    const now = Date.now();
    const entry = this.memory.get(key);
    if (!entry || entry.expires <= now) {
      this.memory.set(key, { value: 1, expires: now + windowSeconds * 1000 });
      return 1;
    }
    entry.value++;
    return entry.value;
  }

  async clear() {
    this.memory.clear();
    if (!this.redis || !this.redis.isReady) return 0;
    let removed = 0;
    for await (const keys of this.redis.scanIterator({ MATCH: PREFIX + '*', COUNT: 200 })) {
      const list = Array.isArray(keys) ? keys : [keys];
      if (list.length) removed += await this.redis.del(list);
    }
    return removed;
  }

  async info() {
    if (!this.redis) return { backend: 'memory', connected: true, keys: this.memory.size };
    if (!this.redis.isReady) return { backend: 'redis', connected: false };
    try {
      const [keys, memory] = await Promise.all([this.redis.dbSize(), this.redis.info('memory')]);
      const used = /used_memory_human:(\S+)/.exec(memory);
      return { backend: 'redis', connected: true, keys, memory: used ? used[1] : null };
    } catch (e) {
      return { backend: 'redis', connected: false, error: e.message };
    }
  }

  async close() {
    if (this.redis && this.redis.isOpen) await this.redis.quit().catch(() => {});
  }
}

module.exports = Cache;
