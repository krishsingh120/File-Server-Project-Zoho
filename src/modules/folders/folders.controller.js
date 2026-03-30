// src/modules/folders/folders.controller.js
const foldersService = require("./folders.service");

class FoldersController {
  // Create folder
  async createFolder(req, res, next) {
    try {
      const { name, parentId } = req.body;

      if (!name || name.trim() === "") {
        return res.status(400).json({
          status: "fail",
          message: "Folder name is required",
        });
      }

      const folder = await foldersService.createFolder(
        name.trim(),
        req.user.id,
        parentId || null,
      );

      res.status(201).json({
        status: "success",
        message: "Folder created successfully",
        data: { folder },
      });
    } catch (error) {
      next(error);
    }
  }

  // List folders
  async listFolders(req, res, next) {
    try {
      const parentId = req.query.parentId || null;
      const folders = await foldersService.listFolders(req.user.id, parentId);

      res.status(200).json({
        status: "success",
        results: folders.length,
        data: { folders },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get folder contents — folders + files dono
  async getFolderContents(req, res, next) {
    try {
      const folderId =
        req.params.folderId === "root" ? null : req.params.folderId;

      const { folders, files } = await foldersService.getFolderContents(
        folderId,
        req.user.id,
      );

      res.status(200).json({
        status: "success",
        data: { folders, files },
      });
    } catch (error) {
      next(error);
    }
  }

  // Rename folder
  async renameFolder(req, res, next) {
    try {
      const { folderId } = req.params;
      const { name } = req.body;

      if (!name || name.trim() === "") {
        return res.status(400).json({
          status: "fail",
          message: "New folder name is required",
        });
      }

      const folder = await foldersService.renameFolder(
        folderId,
        name.trim(),
        req.user.id,
      );

      res.status(200).json({
        status: "success",
        message: "Folder renamed successfully",
        data: { folder },
      });
    } catch (error) {
      next(error);
    }
  }

  // Delete folder
  async deleteFolder(req, res, next) {
    try {
      const { folderId } = req.params;
      const result = await foldersService.deleteFolder(folderId, req.user.id);

      res.status(200).json({
        status: "success",
        message: result.message,
        data: {
          deletedFolders: result.deletedFolders,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Move file to folder
  async moveFile(req, res, next) {
    try {
      const { fileId } = req.params;
      const { targetFolderId } = req.body;

      const file = await foldersService.moveFile(
        fileId,
        targetFolderId || null,
        req.user.id,
      );

      res.status(200).json({
        status: "success",
        message: "File moved successfully",
        data: { file },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new FoldersController();
