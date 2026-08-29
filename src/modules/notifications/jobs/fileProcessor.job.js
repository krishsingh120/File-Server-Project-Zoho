// src/modules/notifications/jobs/fileProcessor.job.js

const fs = require("fs");
const path = require("path");
const { Worker } = require("bullmq");
const {
  redisConnection,
  QUEUE_NAMES,
} = require("../../../providers/bullmq.provider");
const filesRepository = require("../../files/files.repository");
const { emitToUser, SOCKET_EVENTS } = require("../notifications.gateway");
const logger = require("../../../utils/logger");

// ─── Magic Bytes Lookup Table ─────────────────────────────────────────────────
// Concept: Har file type ke pehle kuch bytes FIXED hote hain
// Ye uski real identity hai — extension jhooth bol sakti hai, magic bytes nahi
//
// Example:
//   virus.exe → rename → virus.pdf
//   Extension: .pdf ✅ (fake)
//   Magic Bytes: 4D5A (MZ) ← EXE ka signature ❌ → REJECT
//
// Key   = file ka hex signature (pehle 4-8 bytes)
// Value = actual MIME type

const MAGIC_BYTES = {
  ffd8ff: "image/jpeg", // JPEG: FF D8 FF
  "89504e47": "image/png", // PNG:  89 50 4E 47
  47494638: "image/gif", // GIF:  47 49 46 38 → ASCII: GIF8
  25504446: "application/pdf", // PDF:  25 50 44 46 → ASCII: %PDF
  "504b0304": "application/zip", // ZIP:  50 4B 03 04 → ASCII: PK
  52494646: "image/webp", // WEBP: 52 49 46 46 → ASCII: RIFF
};

// ─── Magic Bytes Detection Function ──────────────────────────────────────────
// Algorithm: Pattern Matching / Lookup Table
//
// Flow:
//   filePath = /tmp/abc123-file.pdf
//       ↓
//   Buffer: [25, 50, 44, 46, xx, xx, xx, xx]  ← pehle 8 bytes
//       ↓
//   Hex: "2550444600000000"
//       ↓
//   Loop MAGIC_BYTES:
//     "ffd8ff"   → startsWith? No
//     "89504e47" → startsWith? No
//     "25504446" → startsWith? YES ✅
//       ↓
//   return "application/pdf"

const detectMimeFromMagicBytes = (filePath) => {
  try {
    const buffer = Buffer.alloc(8); // 8 bytes ka empty buffer allocate karo
    const fd = fs.openSync(filePath, "r"); // file descriptor open karo — read mode
    fs.readSync(fd, buffer, 0, 8, 0); // pehle 8 bytes padhte hain position 0 se
    fs.closeSync(fd); // file descriptor close karo — memory leak avoid

    const hex = buffer.toString("hex").toLowerCase(); // binary → hex string
    // Example: [0x25, 0x50, 0x44, 0x46] → "25504446"

    // Har known signature se compare karo — O(n) where n = MAGIC_BYTES entries
    for (const [magic, mime] of Object.entries(MAGIC_BYTES)) {
      if (hex.startsWith(magic)) return mime; // match mila → MIME return karo
    }

    return null; // unknown file type — MAGIC_BYTES map mein nahi hai
  } catch (err) {
    // File read fail hua — corrupt file ya permission issue
    logger.error(`[FileProcessor] Magic bytes read failed: ${err.message}`);
    return null;
  }
};

// ─── MIME Safety Check ────────────────────────────────────────────────────────
// Declared MIME (jo user ne upload karte waqt bheja)
// vs
// Actual MIME (jo magic bytes ne detect kiya)
//
// Example Attack:
//   User uploads: malware.exe renamed to photo.jpg
//   declaredMime = "image/jpeg" (fake)
//   actualMime   = "application/exe" (real) → MISMATCH → REJECT ❌
//
// Note: agar actualMime null hai (unknown type) → allow karte hain
// Production mein ye stricter hona chahiye

const isMimeSafe = (declaredMime, actualMime) => {
  if (!actualMime) return true; // unknown type → benefit of doubt
  return declaredMime === actualMime; // exact match hona chahiye
};

// ─── MinIO se Temp File Download ──────────────────────────────────────────────
// Kyun zarurat hai:
//   File physically disk pe nahi hai — MinIO (object storage) mein hai
//   Magic bytes check karne ke liye file disk pe chahiye
//   Solution: MinIO → temp location download → check → delete
//
// Flow:
//   objectKey (MinIO) → /tmp/{fileId}-{timestamp} → magic bytes check → delete

const downloadFromMinIO = (minioClient, bucket, objectKey, tempPath) => {
  return new Promise(async (resolve, reject) => {
    try {
      // MinIO se readable stream lo
      const stream = await minioClient.getObject(bucket, objectKey);

      // Stream ko temp file mein write karo
      const writeStream = fs.createWriteStream(tempPath);

      stream
        .pipe(writeStream) // MinIO stream → disk file
        .on("finish", resolve) // write complete → resolve
        .on("error", reject); // write fail → reject
    } catch (err) {
      reject(err);
    }
  });
};

// ─── BullMQ Worker ────────────────────────────────────────────────────────────
// Worker kya karta hai:
//   1. Queue se job uthata hai
//   2. MinIO se file temp mein download karta hai
//   3. Magic bytes se real MIME detect karta hai
//   4. Declared vs Actual MIME compare karta hai
//   5. Safe hai toh MongoDB update → completed
//   6. Unsafe hai toh MongoDB update → rejected + MinIO se delete
//   7. Socket.io se client ko real-time notify karta hai
//   8. Temp file cleanup karta hai
//
// concurrency: 5 → ek saath maximum 5 jobs process hongi
//   → server overload nahi hoga
//   → memory controlled rahegi

const fileProcessorWorker = new Worker(
  QUEUE_NAMES.FILE_PROCESSING, // queue name — bullmq.provider.js mein defined
  async (job) => {
    // ── Job Data Extract ──
    // FIX: pehle filePath tha — WRONG (file disk pe nahi hai, MinIO mein hai)
    // CORRECT: objectKey use karo — MinIO ka unique identifier
    const { fileId, objectKey, mimeType, userId } = job.data;

    logger.info(`[FileProcessor] Processing started — fileId: ${fileId}`);

    // Temp file path — processing ke liye temporary location
    // /tmp/{fileId}-{timestamp} — unique naam taaki concurrent jobs clash na karein
    const tempPath = path.join(
      process.env.TEMP_DIR || "/tmp",
      `${fileId}-${Date.now()}`,
    );

    // MinIO client import
    const minioClient = require("../../../providers/minio.provider");
    const MINIO_BUCKET = process.env.MINIO_BUCKET_NAME || "file-server";

    try {
      // ── Step 1: Socket Emit — Processing Started ──
      // Client ko batao ki processing shuru ho gayi
      emitToUser(userId, SOCKET_EVENTS.FILE_PROCESSING, {
        fileId,
        status: "pending",
        message: "File processing started",
      });

      // ── Step 2: MinIO se Temp Download ──
      // Kyun: Magic bytes check ke liye file disk pe chahiye
      // objectKey → MinIO bucket → tempPath pe save
      logger.info(
        `[FileProcessor] Downloading from MinIO — objectKey: ${objectKey}`,
      );

      await downloadFromMinIO(minioClient, MINIO_BUCKET, objectKey, tempPath);

      logger.info(`[FileProcessor] Downloaded to temp — tempPath: ${tempPath}`);

      // ── Step 3: Magic Bytes Check ──
      // Algorithm: Pattern Matching
      //   tempPath ki file ke pehle 8 bytes padhte hain
      //   Hex mein convert karo
      //   MAGIC_BYTES lookup table se match karo
      //   → actual MIME type milti hai
      const detectedMime = detectMimeFromMagicBytes(tempPath);

      logger.info(
        `[FileProcessor] MIME — declared: ${mimeType} | detected: ${detectedMime}`,
      );

      // ── Step 4: MIME Safety Validation ──
      // declaredMime vs actualMime compare karo
      const safe = isMimeSafe(mimeType, detectedMime);

      if (!safe) {
        // MISMATCH — file reject karo
        logger.error(
          `[FileProcessor] MIME mismatch — declared: ${mimeType} | actual: ${detectedMime} | fileId: ${fileId}`,
        );

        // MongoDB: processingStatus → rejected
        await filesRepository.updateFile(fileId, {
          processingStatus: "rejected",
          processingNote: `MIME mismatch: declared ${mimeType}, actual ${detectedMime}`,
        });

        // MinIO se bhi delete karo — storage leak avoid
        try {
          await minioClient.removeObject(MINIO_BUCKET, objectKey);
          logger.info(
            `[FileProcessor] Rejected file deleted from MinIO — objectKey: ${objectKey}`,
          );
        } catch (minioErr) {
          // MinIO delete fail hua — log karo but continue
          logger.error(
            `[FileProcessor] MinIO delete failed: ${minioErr.message}`,
          );
        }

        // Socket.io: client ko batao file reject hua
        emitToUser(userId, SOCKET_EVENTS.FILE_REJECTED, {
          fileId,
          status: "rejected",
          reason: `MIME mismatch: declared ${mimeType}, actual ${detectedMime}`,
        });

        // Job fail karo — BullMQ failed queue mein jayega
        throw new Error(`MIME mismatch detected — file rejected: ${fileId}`);
      }

      // ── Step 5: Metadata Extract ──
      // File ki basic info nikalo
      const stats = fs.statSync(tempPath); // file stats from temp

      const metadata = {
        detectedMimeType: detectedMime || mimeType, // actual detected type
        extension: path.extname(objectKey).toLowerCase(), // .pdf, .jpg etc
        // FIX: objectKey use karo filePath nahi
        // objectKey = "uploads/userId/uuid-filename.pdf"
        sizeBytes: stats.size, // bytes mein size
        lastModified: stats.mtime, // last modified timestamp
      };

      // ── Step 6: MongoDB Update — Completed ──
      // processingStatus: pending → completed
      await filesRepository.updateFile(fileId, {
        processingStatus: "completed",
        metadata,
      });

      // ── Step 7: Socket.io Emit — Completed ──
      // Client ko real-time batao ki file ready hai
      // Client: progress bar complete, file list refresh
      emitToUser(userId, SOCKET_EVENTS.FILE_COMPLETED, {
        fileId,
        status: "completed",
        metadata,
      });

      logger.info(`[FileProcessor] Processing completed — fileId: ${fileId}`);

      // Job ka return value — Bull Dashboard mein dikh ta hai
      return {
        fileId,
        objectKey,
        mimeType: metadata.detectedMimeType,
      };
    } finally {
      // ── Step 8: Temp File Cleanup ──
      // Finally block — error ho ya na ho, cleanup hoga
      // Disk space free karo
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
        logger.info(
          `[FileProcessor] Temp file cleaned up — tempPath: ${tempPath}`,
        );
      }
    }
  },
  {
    connection: redisConnection, // Redis connection — BullMQ backend
    concurrency: 5, // ek saath max 5 jobs
    // Kyun 5?
    // Kam rakho → server safe, memory controlled
    // Zyada rakho → server overload risk
  },
);

// ─── Worker Event Listeners ───────────────────────────────────────────────────
// Ye sirf logging ke liye hain — monitoring aur debugging

fileProcessorWorker.on("completed", (job) => {
  // Job successfully complete hua
  logger.info(`[FileProcessor] Worker done — jobId: ${job.id}`);
});

fileProcessorWorker.on("failed", (job, err) => {
  // Job fail hua — reason log karo
  // Bull Dashboard mein bhi dikh ta hai
  logger.error(
    `[FileProcessor] Worker failed — jobId: ${job.id} | ${err.message}`,
  );
});

module.exports = fileProcessorWorker;

// const fs = require("fs");
// const path = require("path");
// const { Worker } = require("bullmq");
// const { redisConnection, QUEUE_NAMES } = require("../../../providers/bullmq.provider");
// const filesRepository = require("../../files/files.repository");
// const { emitToUser, SOCKET_EVENTS } = require("../notifications.gateway");
// const logger = require("../../../utils/logger");

// // ─── Magic Bytes Map ──────────────────────────────────────────────────────────
// const MAGIC_BYTES = {
//   "ffd8ff":   "image/jpeg",
//   "89504e47": "image/png",
//   "47494638": "image/gif",
//   "25504446": "application/pdf",
//   "504b0304": "application/zip",
//   "52494646": "image/webp",
// };

// const detectMimeFromMagicBytes = (filePath) => {
//   try {
//     const buffer = Buffer.alloc(8);
//     const fd = fs.openSync(filePath, "r");
//     fs.readSync(fd, buffer, 0, 8, 0);
//     fs.closeSync(fd);
//     const hex = buffer.toString("hex").toLowerCase();
//     for (const [magic, mime] of Object.entries(MAGIC_BYTES)) {
//       if (hex.startsWith(magic)) return mime;
//     }
//     return null;
//   } catch (err) {
//     logger.error(`[FileProcessor] Magic bytes read failed: ${err.message}`);
//     return null;
//   }
// };

// const isMimeSafe = (declaredMime, actualMime) => {
//   if (!actualMime) return true;
//   return declaredMime === actualMime;
// };

// // ─── Worker ───────────────────────────────────────────────────────────────────
// const fileProcessorWorker = new Worker(
//   QUEUE_NAMES.FILE_PROCESSING,
//   async (job) => {
//     const { fileId, filePath, mimeType, userId } = job.data;

//     logger.info(`[FileProcessor] Processing started — fileId: ${fileId}`);

//     // Emit: processing started
//     emitToUser(userId, SOCKET_EVENTS.FILE_PROCESSING, {
//       fileId,
//       status: "pending",
//       message: "File processing started",
//     });

//     // Step 1: File exist?
//     if (!fs.existsSync(filePath)) {
//       throw new Error(`File not found on disk: ${filePath}`);
//     }

//     // Step 2: Magic Bytes Check
//     const detectedMime = detectMimeFromMagicBytes(filePath);
//     const safe = isMimeSafe(mimeType, detectedMime);

//     if (!safe) {
//       logger.error(
//         `[FileProcessor] MIME mismatch — declared: ${mimeType} | actual: ${detectedMime} | fileId: ${fileId}`
//       );

//       fs.unlinkSync(filePath);

//       await filesRepository.updateFile(fileId, {
//         processingStatus: "rejected",
//         processingNote: `MIME mismatch: declared ${mimeType}, actual ${detectedMime}`,
//       });

//       // Emit: rejected
//       emitToUser(userId, SOCKET_EVENTS.FILE_REJECTED, {
//         fileId,
//         status: "rejected",
//         reason: `MIME mismatch: declared ${mimeType}, actual ${detectedMime}`,
//       });

//       throw new Error(`MIME mismatch detected — file rejected: ${fileId}`);
//     }

//     // Step 3: Metadata Extract
//     const stats = fs.statSync(filePath);
//     const metadata = {
//       detectedMimeType: detectedMime || mimeType,
//       extension: path.extname(filePath).toLowerCase(),
//       sizeBytes: stats.size,
//       lastModified: stats.mtime,
//     };

//     // Step 4: DB Update
//     await filesRepository.updateFile(fileId, {
//       processingStatus: "completed",
//       metadata,
//     });

//     // Emit: completed
//     emitToUser(userId, SOCKET_EVENTS.FILE_COMPLETED, {
//       fileId,
//       status: "completed",
//       metadata,
//     });

//     logger.info(`[FileProcessor] Processing completed — fileId: ${fileId}`);

//     return { fileId, filePath, mimeType: metadata.detectedMimeType };
//   },
//   { connection: redisConnection, concurrency: 5 }
// );

// fileProcessorWorker.on("completed", (job) => {
//   logger.info(`[FileProcessor] Worker done — jobId: ${job.id}`);
// });

// fileProcessorWorker.on("failed", (job, err) => {
//   logger.error(`[FileProcessor] Worker failed — jobId: ${job.id} | ${err.message}`);
// });

// module.exports = fileProcessorWorker;
