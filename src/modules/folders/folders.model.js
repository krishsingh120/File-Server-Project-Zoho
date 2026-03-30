// src/modules/folders/folders.model.js
const mongoose = require("mongoose");

const folderSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Folder name is required"],
      trim: true,
      minlength: [1, "Folder name cannot be empty"],
      maxlength: [100, "Folder name cannot exceed 100 characters"],
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Folder",
      default: null, // null = root folder
    },
  },
  {
    timestamps: true,
  },
);

// Compound index — same user same parent mein duplicate name nahi
folderSchema.index({ owner: 1, parentId: 1, name: 1 }, { unique: true });
folderSchema.index({ owner: 1, parentId: 1 });

const Folder = mongoose.model("Folder", folderSchema);

module.exports = Folder;
