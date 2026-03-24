// src/modules/files/files.routes.js
const express = require("express");
const router = express.Router();
const filesController = require("./files.controller");
const { authenticate } = require("../../middleware/auth.middleware");
const upload = require("../../middleware/upload.middleware");

// Public route — shared file download (auth nahi chahiye)
router.get(
  "/shared/:shareToken",
  filesController.downloadSharedFile.bind(filesController),
);

// Private routes — authenticate middleware lagega
router.use(authenticate);

// Storage info
router.get("/storage", filesController.getStorageInfo.bind(filesController));

// List + Search files
router.get("/", filesController.listFiles.bind(filesController));
router.get("/search", filesController.searchFiles.bind(filesController));

// Upload
router.post(
  "/upload",
  upload.single("file"),
  filesController.uploadFile.bind(filesController),
);
router.post(
  "/upload-multiple",
  upload.array("files", 10),
  filesController.uploadMultipleFiles.bind(filesController),
);

// Download, Delete, Share — specific file
router.get(
  "/download/:fileId",
  filesController.downloadFile.bind(filesController),
);
router.delete("/:fileId", filesController.deleteFile.bind(filesController));
router.post("/share/:fileId", filesController.shareFile.bind(filesController));

module.exports = router;
