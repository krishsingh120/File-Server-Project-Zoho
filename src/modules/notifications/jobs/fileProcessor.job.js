// src/modules/notifications/jobs/fileProcessor.job.js
const fs = require("fs");
const path = require("path");
const { Worker } = require("bullmq");
const { redisConnection, QUEUE_NAMES } = require("../../../providers/bullmq.provider");
const filesRepository = require("../../files/files.repository");
const { emitToUser, SOCKET_EVENTS } = require("../notifications.gateway");
const logger = require("../../../utils/logger");

// ─── Magic Bytes Map ──────────────────────────────────────────────────────────
const MAGIC_BYTES = {
  "ffd8ff":   "image/jpeg",
  "89504e47": "image/png",
  "47494638": "image/gif",
  "25504446": "application/pdf",
  "504b0304": "application/zip",
  "52494646": "image/webp",
};

const detectMimeFromMagicBytes = (filePath) => {
  try {
    const buffer = Buffer.alloc(8);
    const fd = fs.openSync(filePath, "r");
    fs.readSync(fd, buffer, 0, 8, 0);
    fs.closeSync(fd);
    const hex = buffer.toString("hex").toLowerCase();
    for (const [magic, mime] of Object.entries(MAGIC_BYTES)) {
      if (hex.startsWith(magic)) return mime;
    }
    return null;
  } catch (err) {
    logger.error(`[FileProcessor] Magic bytes read failed: ${err.message}`);
    return null;
  }
};

const isMimeSafe = (declaredMime, actualMime) => {
  if (!actualMime) return true;
  return declaredMime === actualMime;
};

// ─── Worker ───────────────────────────────────────────────────────────────────
const fileProcessorWorker = new Worker(
  QUEUE_NAMES.FILE_PROCESSING,
  async (job) => {
    const { fileId, filePath, mimeType, userId } = job.data;

    logger.info(`[FileProcessor] Processing started — fileId: ${fileId}`);

    // Emit: processing started
    emitToUser(userId, SOCKET_EVENTS.FILE_PROCESSING, {
      fileId,
      status: "pending",
      message: "File processing started",
    });

    // Step 1: File exist?
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found on disk: ${filePath}`);
    }

    // Step 2: Magic Bytes Check
    const detectedMime = detectMimeFromMagicBytes(filePath);
    const safe = isMimeSafe(mimeType, detectedMime);

    if (!safe) {
      logger.error(
        `[FileProcessor] MIME mismatch — declared: ${mimeType} | actual: ${detectedMime} | fileId: ${fileId}`
      );

      fs.unlinkSync(filePath);

      await filesRepository.updateFile(fileId, {
        processingStatus: "rejected",
        processingNote: `MIME mismatch: declared ${mimeType}, actual ${detectedMime}`,
      });

      // Emit: rejected
      emitToUser(userId, SOCKET_EVENTS.FILE_REJECTED, {
        fileId,
        status: "rejected",
        reason: `MIME mismatch: declared ${mimeType}, actual ${detectedMime}`,
      });

      throw new Error(`MIME mismatch detected — file rejected: ${fileId}`);
    }

    // Step 3: Metadata Extract
    const stats = fs.statSync(filePath);
    const metadata = {
      detectedMimeType: detectedMime || mimeType,
      extension: path.extname(filePath).toLowerCase(),
      sizeBytes: stats.size,
      lastModified: stats.mtime,
    };

    // Step 4: DB Update
    await filesRepository.updateFile(fileId, {
      processingStatus: "completed",
      metadata,
    });

    // Emit: completed
    emitToUser(userId, SOCKET_EVENTS.FILE_COMPLETED, {
      fileId,
      status: "completed",
      metadata,
    });

    logger.info(`[FileProcessor] Processing completed — fileId: ${fileId}`);

    return { fileId, filePath, mimeType: metadata.detectedMimeType };
  },
  { connection: redisConnection, concurrency: 5 }
);

fileProcessorWorker.on("completed", (job) => {
  logger.info(`[FileProcessor] Worker done — jobId: ${job.id}`);
});

fileProcessorWorker.on("failed", (job, err) => {
  logger.error(`[FileProcessor] Worker failed — jobId: ${job.id} | ${err.message}`);
});

module.exports = fileProcessorWorker;