// src/modules/files/files.model.js
const mongoose = require("mongoose");

const fileSchema = new mongoose.Schema(
  {
    originalName: {
      type: String,
      required: [true, "Original file name is required"],
      trim: true,
    },
    storedName: {
      type: String,
      required: true, // uuid + timestamp + originalName
    },
    mimeType: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      required: true, // bytes mein
    },

    // ── Storage ──────────────────────────────────────────────────────────────
    // path: remove — ab MinIO use karte hain local disk nahi
    objectKey: {
      type: String,
      required: true, // MinIO mein path — "userId/uuid-filename.jpg"
    },
    bucketName: {
      type: String,
      required: true, // "file-server"
    },

    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    folderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Folder",
      default: null,
    },
    isShared: {
      type: Boolean,
      default: false,
    },
    shareToken: {
      type: String,
      default: null,
    },
    shareExpiresAt: {
      type: Date,
      default: null,
    },
    downloadCount: {
      type: Number,
      default: 0,
    },

    // ── BullMQ Processing Fields ──────────────────────────────────────────────
    processingStatus: {
      type: String,
      enum: ["pending", "completed", "rejected"],
      default: "pending",
    },
    processingNote: {
      type: String,
      default: null,
    },
    metadata: {
      detectedMimeType: { type: String, default: null },
      extension: { type: String, default: null },
      sizeBytes: { type: Number, default: null },
      lastModified: { type: Date, default: null },
    },
    thumbnailKey: {
      type: String,
      default: null, // MinIO mein thumbnail ka objectKey
    },
  },
  { timestamps: true },
);

// Indexes
fileSchema.index({ owner: 1 });
fileSchema.index({ folderId: 1 });
fileSchema.index({ shareToken: 1 });
fileSchema.index({ processingStatus: 1 });

const File = mongoose.model("File", fileSchema);
module.exports = File;
