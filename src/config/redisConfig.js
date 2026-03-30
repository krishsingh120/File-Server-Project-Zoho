// src/config/redisConfig.js
const Redis = require("ioredis");
const { REDIS_HOST, REDIS_PORT } = require("./serverConfig");


const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
});

redis.on("connect", () => {
  console.log("🚀 Redis Connected");
});

redis.on("error", (err) => {
  console.error("Redis Error:", err.message);
});

module.exports = redis;
