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
    path: {
      type: String,
      required: true, // disk pe actual path
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    folderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Folder",
      default: null, // null = root folder
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

    // ── BullMQ Processing Fields ─────────────────────────────────────────────
    processingStatus: {
      type: String,
      enum: ["pending", "completed", "rejected"],
      default: "pending",
    },
    processingNote: {
      type: String,
      default: null, // MIME mismatch hone pe reason yahan aayega
    },
    metadata: {
      detectedMimeType: { type: String, default: null }, // magic bytes se actual type
      extension: { type: String, default: null },
      sizeBytes: { type: Number, default: null },
      lastModified: { type: Date, default: null },
    },
    thumbnailPath: {
      type: String,
      default: null, // sirf images ke liye — 200x200 jpeg path
    },
  },
  {
    timestamps: true,
  },
);

// Index for faster queries
fileSchema.index({ owner: 1 });
fileSchema.index({ folderId: 1 });
fileSchema.index({ shareToken: 1 });
fileSchema.index({ processingStatus: 1 }); // ← pending files quickly fetch karne ke liye

const File = mongoose.model("File", fileSchema);

module.exports = File;
