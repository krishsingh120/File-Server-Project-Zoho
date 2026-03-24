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
  },
  {
    timestamps: true,
  },
);

// Index for faster queries
fileSchema.index({ owner: 1 });
fileSchema.index({ folderId: 1 });
fileSchema.index({ shareToken: 1 });

const File = mongoose.model("File", fileSchema);

module.exports = File;
