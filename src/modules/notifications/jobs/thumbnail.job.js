// src/modules/notifications/jobs/thumbnail.job.js
const fs = require("fs");
const path = require("path");
const { Queue, Worker } = require("bullmq");
const { redisConnection } = require("../../../providers/bullmq.provider");
const filesRepository = require("../../files/files.repository");
const { emitToUser, SOCKET_EVENTS } = require("../notifications.gateway");
const logger = require("../../../utils/logger");

// Sharp — install: npm install sharp
let sharp;
try {
  sharp = require("sharp");
} catch {
  logger.error("[Thumbnail] sharp not installed — run: npm install sharp");
  sharp = null;
}

const THUMBNAIL_DIR = "uploads/thumbnails";
const THUMBNAIL_QUEUE_NAME = "thumbnail-processing";

const ensureThumbnailDir = () => {
  if (!fs.existsSync(THUMBNAIL_DIR)) {
    fs.mkdirSync(THUMBNAIL_DIR, { recursive: true });
  }
};

const generateThumbnail = async (filePath, fileId) => {
  ensureThumbnailDir();
  const thumbnailPath = path.join(THUMBNAIL_DIR, `thumb_${fileId}.jpg`);
  await sharp(filePath)
    .resize(200, 200, { fit: "cover" })
    .jpeg({ quality: 80 })
    .toFile(thumbnailPath);
  return thumbnailPath;
};

// ─── Thumbnail Queue ──────────────────────────────────────────────────────────
const thumbnailQueue = new Queue(THUMBNAIL_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "fixed", delay: 2000 },
    removeOnComplete: 30,
    removeOnFail: 10,
  },
});

const addThumbnailJob = async (payload) => {
  if (!payload.mimeType.startsWith("image/")) return null;
  const job = await thumbnailQueue.add("generate-thumbnail", payload, {
    jobId: `thumb-${payload.fileId}`,
  });
  logger.info(`[Thumbnail] Job added — jobId: ${job.id} | fileId: ${payload.fileId}`);
  return job;
};

// ─── Thumbnail Worker ─────────────────────────────────────────────────────────
const thumbnailWorker = new Worker(
  THUMBNAIL_QUEUE_NAME,
  async (job) => {
    const { fileId, filePath, mimeType, userId } = job.data;

    logger.info(`[Thumbnail] Generation started — fileId: ${fileId}`);

    if (!sharp) {
      logger.error("[Thumbnail] sharp missing — thumbnail skipped");
      return { skipped: true };
    }

    if (!mimeType.startsWith("image/")) {
      return { skipped: true };
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`Original file not found: ${filePath}`);
    }

    const thumbnailPath = await generateThumbnail(filePath, fileId);

    await filesRepository.updateFile(fileId, { thumbnailPath });

    // Emit: thumbnail ready
    emitToUser(userId, SOCKET_EVENTS.FILE_THUMBNAIL, {
      fileId,
      thumbnailPath,
    });

    logger.info(`[Thumbnail] Generated — fileId: ${fileId} | path: ${thumbnailPath}`);
    return { thumbnailPath };
  },
  { connection: redisConnection, concurrency: 3 }
);

thumbnailWorker.on("completed", (job) => {
  logger.info(`[Thumbnail] Worker done — jobId: ${job.id}`);
});

thumbnailWorker.on("failed", (job, err) => {
  logger.error(`[Thumbnail] Worker failed — jobId: ${job.id} | ${err.message}`);
});

module.exports = { thumbnailWorker, addThumbnailJob, thumbnailQueue };