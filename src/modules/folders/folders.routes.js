// src/modules/folders/folders.routes.js
const express = require("express");
const router = express.Router();
const foldersController = require("./folders.controller");
const { authenticate } = require("../../middleware/auth.middleware");

// Sab routes private hain
router.use(authenticate);

// Folder CRUD
router.post("/", foldersController.createFolder.bind(foldersController));
router.get("/", foldersController.listFolders.bind(foldersController));
router.get(
  "/:folderId/contents",
  foldersController.getFolderContents.bind(foldersController),
);
router.patch(
  "/:folderId/rename",
  foldersController.renameFolder.bind(foldersController),
);
router.delete(
  "/:folderId",
  foldersController.deleteFolder.bind(foldersController),
);

// Move file
router.patch(
  "/move/:fileId",
  foldersController.moveFile.bind(foldersController),
);

module.exports = router;
