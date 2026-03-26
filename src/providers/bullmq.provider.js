// src/providers/bullmq.provider.js
const { Queue, Worker, QueueEvents } = require("bullmq");
const { REDIS_HOST, REDIS_PORT } = require("../config/serverConfig");
const logger = require("../utils/logger");

// BullMQ ke liye alag connection config — ioredis instance share nahi karte
// BullMQ internally apna connection manage karta hai
const redisConnection = {
  host: REDIS_HOST,
  port: REDIS_PORT,
};

// ─── Queue Names ─────────────────────────────────────────────────────────────
const QUEUE_NAMES = {
  FILE_PROCESSING: "file-processing",
};

// ─── File Processing Queue ────────────────────────────────────────────────────
const fileProcessingQueue = new Queue(QUEUE_NAMES.FILE_PROCESSING, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3, // fail hone pe 3 baar retry
    backoff: {
      type: "exponential", // 1s → 2s → 4s
      delay: 1000,
    },
    removeOnComplete: 50, // sirf last 50 completed jobs rakho
    removeOnFail: 20, // sirf last 20 failed jobs rakho
  },
});

// ─── Queue Events (logging) ───────────────────────────────────────────────────
const fileProcessingQueueEvents = new QueueEvents(QUEUE_NAMES.FILE_PROCESSING, {
  connection: redisConnection,
});

fileProcessingQueueEvents.on("completed", ({ jobId }) => {
  logger.info(`[BullMQ] Job completed — jobId: ${jobId}`);
});

fileProcessingQueueEvents.on("failed", ({ jobId, failedReason }) => {
  logger.error(
    `[BullMQ] Job failed — jobId: ${jobId} | reason: ${failedReason}`,
  );
});

// ─── Add Job Helper ───────────────────────────────────────────────────────────
/**
 * File processing job queue mein daalo
 * @param {Object} payload - { fileId, filePath, mimeType, userId }
 */
const addFileProcessingJob = async (payload) => {
  const job = await fileProcessingQueue.add("process-file", payload, {
    jobId: `file-${payload.fileId}`, // unique jobId — duplicate jobs nahi jayenge
  });
  logger.info(
    `[BullMQ] Job added — jobId: ${job.id} | fileId: ${payload.fileId}`,
  );
  return job;
};

module.exports = {
  fileProcessingQueue,
  addFileProcessingJob,
  QUEUE_NAMES,
  redisConnection, // worker files mein reuse karenge
};
