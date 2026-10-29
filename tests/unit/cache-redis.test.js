'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const Cache = require('../../lib/cache');

const url = process.env.FLYTO_TEST_REDIS_URL;

test('rate limit counters always get a TTL in Redis', { skip: url ? false : 'FLYTO_TEST_REDIS_URL not set' }, async () => {
  const cache = new Cache(url);
  await cache.ready;
  try {
    const key = `test:hit:${ Date.now() }`;
    // a counter left without TTL, as after a lost EXPIRE
    await cache.redis.set('flyto:' + key, '5');
    assert.strictEqual(await cache.hit(key, 60), 6);
    const ttl = await cache.redis.ttl('flyto:' + key);
    assert.ok(ttl > 0 && ttl <= 60, `ttl ${ ttl }`);
    assert.strictEqual(await cache.hit(key, 60), 7);
    assert.strictEqual(await cache.get(key), 7);
    await cache.del(key);
  } finally {
    await cache.close();
  }
});
