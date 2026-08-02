const Redis = require('ioredis');
const logger = require('../utils/logger');

/** @type {import('ioredis').Redis | null} */
let redis = null;
const memoryCache = new Map();

function isLocalRedisUrl(url) {
  return /127\.0\.0\.1|localhost/i.test(url || '');
}

/**
 * Redis is optional.
 * - Leave REDIS_URL empty → in-memory cache (OK for single Render instance)
 * - Set REDIS_URL to Upstash / Redis Cloud (`rediss://...`) for real Redis
 * - On Render, localhost Redis URLs are ignored (common misconfig)
 */
async function initRedis() {
  let url = (process.env.REDIS_URL || '').trim();
  const explicitlyDisabled =
    process.env.REDIS_ENABLED === 'false' || process.env.REDIS_ENABLED === '0';

  const onRender = !!(process.env.RENDER || process.env.RENDER_EXTERNAL_URL);
  if (onRender && isLocalRedisUrl(url)) {
    logger.warn('REDIS_URL points to localhost on Render — ignoring; using in-memory cache');
    url = '';
  }

  if (explicitlyDisabled || !url) {
    redis = null;
    logger.info('Redis skipped — using in-memory cache (set REDIS_URL to enable)');
    return;
  }

  let client = null;
  try {
    const isTls = url.startsWith('rediss://');
    client = new Redis(url, {
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      lazyConnect: true,
      connectTimeout: 8000,
      // Upstash / managed Redis often need TLS; rediss:// enables it
      tls: isTls ? { rejectUnauthorized: false } : undefined,
      family: 0, // dual-stack (helps some cloud Redis hosts)
      retryStrategy: (times) => {
        if (times > 3) return null;
        return Math.min(times * 200, 1000);
      },
    });

    // Attach before connect so ECONNREFUSED is not an "Unhandled error event"
    client.on('error', (err) => {
      logger.warn(`Redis error: ${err.message}`);
    });

    await client.connect();
    await client.ping();
    redis = client;
    logger.info(`Redis connected (${isTls ? 'TLS' : 'plain'})`);
  } catch (err) {
    logger.warn(`Redis unavailable (${err.message}) — using in-memory cache`);
    if (client) {
      try {
        client.removeAllListeners();
        client.disconnect(false);
      } catch (_) {
        /* ignore */
      }
    }
    redis = null;
  }
}

async function cacheGet(key) {
  if (redis) {
    try {
      return await redis.get(key);
    } catch (err) {
      logger.warn(`Redis GET failed: ${err.message}`);
    }
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
    try {
      await redis.set(key, value, 'EX', ttlSeconds);
      return;
    } catch (err) {
      logger.warn(`Redis SET failed: ${err.message}`);
    }
  }
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

async function cacheDel(key) {
  if (redis) {
    try {
      await redis.del(key);
      return;
    } catch (err) {
      logger.warn(`Redis DEL failed: ${err.message}`);
    }
  }
  memoryCache.delete(key);
}

function getRedis() {
  return redis;
}

module.exports = { initRedis, cacheGet, cacheSet, cacheDel, getRedis };
