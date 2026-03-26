// src/modules/notifications/jobs/fileProcessor.job.js
const fs = require("fs");
const path = require("path");
const { Worker } = require("bullmq");
const {
  redisConnection,
  QUEUE_NAMES,
} = require("../../../providers/bullmq.provider");
const filesRepository = require("../../files/files.repository");
const logger = require("../../../utils/logger");

// ─── Magic Bytes Map ──────────────────────────────────────────────────────────
// File ke pehle kuch bytes se real type pata karte hain
// Multer sirf extension trust karta hai — ye actual verification hai
const MAGIC_BYTES = {
  ffd8ff: "image/jpeg",
  "89504e47": "image/png",
  47494638: "image/gif",
  25504446: "application/pdf",
  "504b0304": "application/zip", // zip, docx, xlsx bhi zip hote hain
  52494646: "image/webp", // RIFF....WEBP
};

/**
 * File ke magic bytes read karo (pehle 8 bytes kaafi hain)
 * @param {string} filePath
 * @returns {string|null} detected mimeType or null
 */
const detectMimeFromMagicBytes = (filePath) => {
  try {
    const buffer = Buffer.alloc(8);
    const fd = fs.openSync(filePath, "r");
    fs.readSync(fd, buffer, 0, 8, 0);
    fs.closeSync(fd);

    const hex = buffer.toString("hex").toLowerCase();

    // Magic bytes map se match karo
    for (const [magic, mime] of Object.entries(MAGIC_BYTES)) {
      if (hex.startsWith(magic)) {
        return mime;
      }
    }

    return null; // unknown type
  } catch (err) {
    logger.error(`[FileProcessor] Magic bytes read failed: ${err.message}`);
    return null;
  }
};

/**
 * Multer ka mimeType aur actual magic bytes compare karo
 * @param {string} declaredMime - multer ne jo bataya
 * @param {string} actualMime   - magic bytes se jo mila
 * @returns {boolean}
 */
const isMimeSafe = (declaredMime, actualMime) => {
  // actualMime null hai → unknown type → allow karo (strict nahi karna sabke liye)
  if (!actualMime) return true;
  return declaredMime === actualMime;
};

// ─── Worker ───────────────────────────────────────────────────────────────────
const fileProcessorWorker = new Worker(
  QUEUE_NAMES.FILE_PROCESSING,
  async (job) => {
    const { fileId, filePath, mimeType, userId } = job.data;

    logger.info(`[FileProcessor] Processing started — fileId: ${fileId}`);

    // ── Step 1: File exist karti hai? ────────────────────────────────────────
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found on disk: ${filePath}`);
    }

    // ── Step 2: Magic Bytes Check ─────────────────────────────────────────────
    const detectedMime = detectMimeFromMagicBytes(filePath);
    const safe = isMimeSafe(mimeType, detectedMime);

    if (!safe) {
      // Dangerous file — disk se delete karo + DB mein flag karo
      logger.error(
        `[FileProcessor] MIME mismatch — declared: ${mimeType} | actual: ${detectedMime} | fileId: ${fileId}`,
      );

      fs.unlinkSync(filePath);

      await filesRepository.updateFile(fileId, {
        processingStatus: "rejected",
        processingNote: `MIME mismatch: declared ${mimeType}, actual ${detectedMime}`,
      });

      throw new Error(`MIME mismatch detected — file rejected: ${fileId}`);
    }

    // ── Step 3: Metadata Extract ──────────────────────────────────────────────
    const stats = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();

    const metadata = {
      detectedMimeType: detectedMime || mimeType, // actual ya declared
      extension: ext,
      sizeBytes: stats.size,
      lastModified: stats.mtime,
    };

    // ── Step 4: DB Update ─────────────────────────────────────────────────────
    await filesRepository.updateFile(fileId, {
      processingStatus: "completed",
      metadata,
    });

    logger.info(`[FileProcessor] Processing completed — fileId: ${fileId}`);

    // thumbnail.job.js ke liye data return karo
    // (BullMQ job chaining baad mein karenge — abhi return kaafi hai)
    return {
      fileId,
      filePath,
      mimeType: metadata.detectedMimeType,
      needsThumbnail: mimeType.startsWith("image/"),
    };
  },
  {
    connection: redisConnection,
    concurrency: 5, // ek saath 5 files process karo
  },
);

// ─── Worker Events ─────────────────────────────────────────────────────────────
fileProcessorWorker.on("completed", (job, result) => {
  logger.info(`[FileProcessor] Worker done — jobId: ${job.id}`);
});

fileProcessorWorker.on("failed", (job, err) => {
  logger.error(
    `[FileProcessor] Worker failed — jobId: ${job.id} | ${err.message}`,
  );
});

module.exports = fileProcessorWorker;
