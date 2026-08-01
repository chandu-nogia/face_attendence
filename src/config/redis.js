const Redis = require('ioredis');
const logger = require('../utils/logger');

/** @type {import('ioredis').Redis | null} */
let redis = null;
const memoryCache = new Map();

async function initRedis() {
  const url = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  try {
    redis = new Redis(url, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      connectTimeout: 3000,
    });
    await redis.connect();
    redis.on('error', (err) => logger.warn(`Redis error: ${err.message}`));
    logger.info('Redis connected');
  } catch (err) {
    logger.warn(`Redis unavailable (${err.message}) — using in-memory cache`);
    if (redis) {
      try {
        redis.disconnect();
      } catch (_) {
        /* ignore */
      }
    }
    redis = null;
  }
}

async function cacheGet(key) {
  if (redis) {
    return redis.get(key);
  }
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt && Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return entry.value;
}

async function cacheSet(key, value, ttlSeconds = 86400) {
  if (redis) {
    await redis.set(key, value, 'EX', ttlSeconds);
    return;
  }
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

async function cacheDel(key) {
  if (redis) {
    await redis.del(key);
    return;
  }
  memoryCache.delete(key);
}

function getRedis() {
  return redis;
}

module.exports = { initRedis, cacheGet, cacheSet, cacheDel, getRedis };
