const rateLimit = require("express-rate-limit");
const redis = require("../config/redisConfig");

const createLimiter = ({ windowMs, max, message, keyPrefix }) => {
  // Custom store — directly ioredis use karo
  const store = {
    async increment(key) {
      const redisKey = `${keyPrefix}${key}`;
      const current = await redis.incr(redisKey);
      if (current === 1) {
        await redis.pexpire(redisKey, windowMs);
      }
      const ttl = await redis.pttl(redisKey);
      return {
        totalHits: current,
        resetTime: new Date(Date.now() + ttl),
      };
    },
    async decrement(key) {
      const redisKey = `${keyPrefix}${key}`;
      await redis.decr(redisKey);
    },
    async resetKey(key) {
      const redisKey = `${keyPrefix}${key}`;
      await redis.del(redisKey);
    },
  };

  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message,
    },
    store,
  });
};

const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000, // 15min window
  max: 10,
  message: "Too many auth attempts, try after 15 minutes",
  keyPrefix: "rl:auth:",
});

const uploadLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 50,
  message: "Upload limit reached, try after 1 hour",
  keyPrefix: "rl:upload:",
});

const globalLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 100,
  message: "Too many requests, slow down!",
  keyPrefix: "rl:api:",
});

module.exports = { authLimiter, uploadLimiter, globalLimiter };
