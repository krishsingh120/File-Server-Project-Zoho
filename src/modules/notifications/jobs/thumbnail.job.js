// src/modules/notifications/jobs/thumbnail.job.js
const fs = require("fs");
const path = require("path");
const { Worker } = require("bullmq");
const {
  redisConnection,
  QUEUE_NAMES,
} = require("../../../providers/bullmq.provider");
const filesRepository = require("../../files/files.repository");
const logger = require("../../../utils/logger");

// Sharp — fast image processing library
// Install: npm install sharp
let sharp;
try {
  sharp = require("sharp");
} catch {
  logger.error("[Thumbnail] sharp not installed — run: npm install sharp");
  sharp = null;
}

// ─── Thumbnail Config ─────────────────────────────────────────────────────────
const THUMBNAIL_CONFIG = {
  width: 200,
  height: 200,
  fit: "cover", // crop to fill — center se
  quality: 80, // JPEG quality
};

const THUMBNAIL_DIR = "uploads/thumbnails"; // thumbnails yahan save honge

/**
 * Thumbnail directory exist nahi karti toh banao
 */
const ensureThumbnailDir = () => {
  if (!fs.existsSync(THUMBNAIL_DIR)) {
    fs.mkdirSync(THUMBNAIL_DIR, { recursive: true });
  }
};

/**
 * Image ka thumbnail banao
 * @param {string} filePath - original image path
 * @param {string} fileId   - MongoDB fileId (thumbnail naam ke liye)
 * @returns {string} thumbnailPath
 */
const generateThumbnail = async (filePath, fileId) => {
  ensureThumbnailDir();

  const thumbnailPath = path.join(THUMBNAIL_DIR, `thumb_${fileId}.jpg`);

  await sharp(filePath)
    .resize(THUMBNAIL_CONFIG.width, THUMBNAIL_CONFIG.height, {
      fit: THUMBNAIL_CONFIG.fit,
    })
    .jpeg({ quality: THUMBNAIL_CONFIG.quality })
    .toFile(thumbnailPath);

  return thumbnailPath;
};

// ─── Worker ───────────────────────────────────────────────────────────────────
// NOTE: Ye same "file-processing" queue listen karta hai
// fileProcessor.job.js ke baad same job ka result yahan nahi aata —
// thumbnail ke liye alag addThumbnailJob() call karenge files.service.js se
// (ya baad mein BullMQ job chaining se)

const THUMBNAIL_QUEUE_NAME = "thumbnail-processing";

// Thumbnail ke liye alag queue — import karke use karo
const { Queue } = require("bullmq");
const thumbnailQueue = new Queue(THUMBNAIL_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "fixed", delay: 2000 },
    removeOnComplete: 30,
    removeOnFail: 10,
  },
});

/**
 * Thumbnail job queue mein daalo
 * @param {Object} payload - { fileId, filePath, mimeType }
 */
const addThumbnailJob = async (payload) => {
  // Sirf images ke liye
  if (!payload.mimeType.startsWith("image/")) return null;

  const job = await thumbnailQueue.add("generate-thumbnail", payload, {
    jobId: `thumb-${payload.fileId}`,
  });

  logger.info(
    `[Thumbnail] Job added — jobId: ${job.id} | fileId: ${payload.fileId}`,
  );
  return job;
};

// ─── Thumbnail Worker ─────────────────────────────────────────────────────────
const thumbnailWorker = new Worker(
  THUMBNAIL_QUEUE_NAME,
  async (job) => {
    const { fileId, filePath, mimeType } = job.data;

    logger.info(`[Thumbnail] Generation started — fileId: ${fileId}`);

    // Sharp available nahi → skip
    if (!sharp) {
      logger.error("[Thumbnail] sharp missing — thumbnail skipped");
      return { skipped: true };
    }

    // Image nahi hai → skip
    if (!mimeType.startsWith("image/")) {
      logger.info(`[Thumbnail] Not an image — skipped | fileId: ${fileId}`);
      return { skipped: true };
    }

    // File exist karti hai?
    if (!fs.existsSync(filePath)) {
      throw new Error(`Original file not found: ${filePath}`);
    }

    const thumbnailPath = await generateThumbnail(filePath, fileId);

    // DB mein thumbnail path save karo
    await filesRepository.updateFile(fileId, {
      thumbnailPath,
    });

    logger.info(
      `[Thumbnail] Generated — fileId: ${fileId} | path: ${thumbnailPath}`,
    );
    return { thumbnailPath };
  },
  {
    connection: redisConnection,
    concurrency: 3, // thumbnails heavy hote hain — 3 kaafi hai
  },
);

// ─── Worker Events ─────────────────────────────────────────────────────────────
thumbnailWorker.on("completed", (job) => {
  logger.info(`[Thumbnail] Worker done — jobId: ${job.id}`);
});

thumbnailWorker.on("failed", (job, err) => {
  logger.error(`[Thumbnail] Worker failed — jobId: ${job.id} | ${err.message}`);
});

module.exports = { thumbnailWorker, addThumbnailJob, thumbnailQueue };
