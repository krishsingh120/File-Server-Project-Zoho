// src/providers/minio.provider.js
const Minio = require("minio");
const fs = require("fs");
const {
  MINIO_ENDPOINT,
  MINIO_PORT,
  MINIO_ACCESS_KEY,
  MINIO_SECRET_KEY,
  MINIO_BUCKET,
  MINIO_USE_SSL,
} = require("../config/serverConfig");
const logger = require("../utils/logger");

// ─── MinIO Client ─────────────────────────────────────────────────────────────
const minioClient = new Minio.Client({
  endPoint: MINIO_ENDPOINT,
  port: MINIO_PORT,
  useSSL: MINIO_USE_SSL,
  accessKey: MINIO_ACCESS_KEY,
  secretKey: MINIO_SECRET_KEY,
});

// ─── Bucket Initialize ────────────────────────────────────────────────────────
// Server start hote hi bucket exist karta hai ya nahi check karo — nahi hai toh banao
const initMinio = async () => {
  try {
    const exists = await minioClient.bucketExists(MINIO_BUCKET);
    if (!exists) {
      await minioClient.makeBucket(MINIO_BUCKET, "us-east-1");
      logger.info(`[MinIO] Bucket created — ${MINIO_BUCKET}`);
    } else {
      logger.info(`[MinIO] Bucket ready — ${MINIO_BUCKET}`);
    }
  } catch (err) {
    logger.error(`[MinIO] Init failed: ${err.message}`);
    throw err;
  }
};

// ─── Upload File ──────────────────────────────────────────────────────────────
/**
 * Local disk se MinIO pe upload karo
 * @param {string} localFilePath  - multer ka temp path
 * @param {string} objectKey      - MinIO mein store hoga — "userId/filename.jpg"
 * @param {string} mimeType       - file ka MIME type
 * @returns {string} objectKey
 */
const uploadToMinio = async (localFilePath, objectKey, mimeType) => {
  const fileStream = fs.createReadStream(localFilePath);
  const fileStat = fs.statSync(localFilePath);

  await minioClient.putObject(
    MINIO_BUCKET,
    objectKey,
    fileStream,
    fileStat.size,
    { "Content-Type": mimeType },
  );

  logger.info(`[MinIO] Uploaded — objectKey: ${objectKey}`);
  return objectKey;
};

// ─── Get Presigned URL ────────────────────────────────────────────────────────
/**
 * Download ke liye temporary URL banao
 * @param {string} objectKey
 * @param {number} expirySeconds - default 1 hour
 * @returns {string} presigned URL
 */
const getPresignedUrl = async (objectKey, expirySeconds = 3600) => {
  const url = await minioClient.presignedGetObject(
    MINIO_BUCKET,
    objectKey,
    expirySeconds,
  );
  return url;
};

// ─── Delete Object ────────────────────────────────────────────────────────────
/**
 * MinIO se file delete karo
 * @param {string} objectKey
 */
const deleteFromMinio = async (objectKey) => {
  await minioClient.removeObject(MINIO_BUCKET, objectKey);
  logger.info(`[MinIO] Deleted — objectKey: ${objectKey}`);
};

module.exports = {
  minioClient,
  initMinio,
  uploadToMinio,
  getPresignedUrl,
  deleteFromMinio,
  MINIO_BUCKET,
};
