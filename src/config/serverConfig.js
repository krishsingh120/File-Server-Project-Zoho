// src/config/serverConfig.js
const dotenv = require("dotenv");
dotenv.config();

module.exports = {
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || "development",

  // ── Mongodb ────────────────────────────────────────────────────────────────
  MONGO_URI: process.env.MONGO_URI,
  LOG_DB_URL: process.env.LOG_DB_URL,

  // ── JWT ────────────────────────────────────────────────────────────────
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
  JWT_ACCESS_EXPIRES: process.env.JWT_ACCESS_EXPIRES || "15m",
  JWT_REFRESH_EXPIRES: process.env.JWT_REFRESH_EXPIRES || "7d",

  // ── Redis ────────────────────────────────────────────────────────────────
  REDIS_HOST: process.env.REDIS_HOST || "localhost",
  REDIS_PORT: process.env.REDIS_PORT || 6379,

  // ── MinIO ────────────────────────────────────────────────────────────────
  MINIO_ENDPOINT: process.env.MINIO_ENDPOINT || "localhost",
  MINIO_PORT: parseInt(process.env.MINIO_PORT) || 9000,
  MINIO_ACCESS_KEY: process.env.MINIO_ACCESS_KEY || "minioadmin",
  MINIO_SECRET_KEY: process.env.MINIO_SECRET_KEY || "minioadmin123",
  MINIO_BUCKET: process.env.MINIO_BUCKET_NAME || "file-server",
  MINIO_USE_SSL: process.env.MINIO_USE_SSL === "true",
};
