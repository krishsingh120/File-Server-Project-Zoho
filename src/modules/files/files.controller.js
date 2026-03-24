// src/modules/files/files.controller.js
const path = require("path");
const filesService = require("./files.service");

class FilesController {
  // Single file upload
  async uploadFile(req, res, next) {
    try {
      if (!req.file) {
        return res.status(400).json({
          status: "fail",
          message: "No file uploaded",
        });
      }

      const file = await filesService.uploadFile(req.file, req.user.id);

      res.status(201).json({
        status: "success",
        message: "File uploaded successfully",
        data: { file },
      });
    } catch (error) {
      next(error);
    }
  }

  // Multiple files upload
  async uploadMultipleFiles(req, res, next) {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          status: "fail",
          message: "No files uploaded",
        });
      }

      const folderId = req.body.folderId || null;
      const { uploadedFiles, failedFiles } =
        await filesService.uploadMultipleFiles(
          req.files,
          req.user.id,
          folderId,
        );

      res.status(201).json({
        status: "success",
        message: `${uploadedFiles.length} file(s) uploaded successfully`,
        data: { uploadedFiles, failedFiles },
      });
    } catch (error) {
      next(error);
    }
  }

  // Download file
  async downloadFile(req, res, next) {
    try {
      const { fileId } = req.params;
      const file = await filesService.downloadFile(fileId, req.user.id);

      res.download(file.path, file.originalName, (err) => {
        if (err) next(err);
      });
    } catch (error) {
      next(error);
    }
  }

  // Delete file
  async deleteFile(req, res, next) {
    try {
      const { fileId } = req.params;
      const result = await filesService.deleteFile(fileId, req.user.id);

      res.status(200).json({
        status: "success",
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }

  // List files
  async listFiles(req, res, next) {
    try {
      const folderId = req.query.folderId || null;
      const files = await filesService.listFiles(req.user.id, folderId);

      res.status(200).json({
        status: "success",
        results: files.length,
        data: { files },
      });
    } catch (error) {
      next(error);
    }
  }

  // Search files
  async searchFiles(req, res, next) {
    try {
      const { q } = req.query;
      const files = await filesService.searchFiles(req.user.id, q);

      res.status(200).json({
        status: "success",
        results: files.length,
        data: { files },
      });
    } catch (error) {
      next(error);
    }
  }

  // Share file — generate link
  async shareFile(req, res, next) {
    try {
      const { fileId } = req.params;
      const { expiresInHours } = req.body;

      const { shareToken, shareExpiresAt, file } = await filesService.shareFile(
        fileId,
        req.user.id,
        expiresInHours || 24,
      );

      const shareLink = `${req.protocol}://${req.get("host")}/api/v1/files/shared/${shareToken}`;

      res.status(200).json({
        status: "success",
        message: "Share link generated",
        data: { shareLink, shareToken, shareExpiresAt, file },
      });
    } catch (error) {
      next(error);
    }
  }

  // Download shared file — public route
  async downloadSharedFile(req, res, next) {
    try {
      const { shareToken } = req.params;
      const file = await filesService.downloadSharedFile(shareToken);

      res.download(file.path, file.originalName, (err) => {
        if (err) next(err);
      });
    } catch (error) {
      next(error);
    }
  }

  // Storage info
  async getStorageInfo(req, res, next) {
    try {
      const storageInfo = await filesService.getStorageInfo(req.user.id);

      res.status(200).json({
        status: "success",
        data: { storage: storageInfo },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new FilesController();
