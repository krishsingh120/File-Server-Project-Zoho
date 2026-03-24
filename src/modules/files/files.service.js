// src/modules/files/files.service.js
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const filesRepository = require("./files.repository");
const authRepository = require("../auth/auth.repository");
const NotFoundError = require("../../errors/notFound.error");
const BadRequestError = require("../../errors/badRequest.error");
const ForbiddenError = require("../../errors/forbidden.error");

class FilesService {
  // Upload single file
  async uploadFile(fileData, userId) {
    const user = await authRepository.findById(userId);
    if (!user) throw new NotFoundError("User not found");

    // Size bytes to MB convert karo
    const fileSizeMB = fileData.size / (1024 * 1024);

    // Quota check — atomic update
    const updatedUser = await authRepository.updateUser(
      {
        _id: userId,
        $expr: {
          $lte: [{ $add: ["$storageUsedMB", fileSizeMB] }, "$storageQuotaMB"],
        },
      },
      { $inc: { storageUsedMB: fileSizeMB } },
    );

    if (!updatedUser) {
      // Quota exceed — uploaded file delete karo
      fs.unlinkSync(fileData.path);
      throw new BadRequestError("Storage quota exceeded");
    }

    const file = await filesRepository.createFile({
      originalName: fileData.originalname,
      storedName: path.basename(fileData.path),
      mimeType: fileData.mimetype,
      size: fileData.size,
      path: fileData.path,
      owner: userId,
      folderId: fileData.folderId || null,
    });

    return file;
  }

  // Upload multiple files
  async uploadMultipleFiles(files, userId, folderId = null) {
    const uploadedFiles = [];
    const failedFiles = [];

    for (const file of files) {
      try {
        const uploaded = await this.uploadFile({ ...file, folderId }, userId);
        uploadedFiles.push(uploaded);
      } catch (error) {
        failedFiles.push({ name: file.originalname, error: error.message });
      }
    }

    return { uploadedFiles, failedFiles };
  }

  // Download file
  async downloadFile(fileId, userId) {
    const file = await filesRepository.findById(fileId);
    if (!file) throw new NotFoundError("File not found");

    // Owner check — sirf apni file download kar sakte ho
    if (file.owner.toString() !== userId.toString()) {
      // Shared file check
      if (!file.isShared) {
        throw new ForbiddenError(
          "You do not have permission to download this file",
        );
      }
    }

    // File disk pe exist karti hai?
    if (!fs.existsSync(file.path)) {
      throw new NotFoundError("File not found on disk");
    }

    await filesRepository.incrementDownloadCount(fileId);

    return file;
  }

  // Delete file
  async deleteFile(fileId, userId) {
    const file = await filesRepository.findById(fileId);
    if (!file) throw new NotFoundError("File not found");

    // Sirf owner delete kar sakta hai
    if (file.owner.toString() !== userId.toString()) {
      throw new ForbiddenError(
        "You do not have permission to delete this file",
      );
    }

    // Disk se delete karo
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }

    // Storage quota update karo
    const fileSizeMB = file.size / (1024 * 1024);
    await authRepository.updateUser(
      { _id: userId },
      { $inc: { storageUsedMB: -fileSizeMB } },
    );

    // MongoDB se delete karo
    await filesRepository.deleteFile(fileId);

    return { message: "File deleted successfully" };
  }

  // List files
  async listFiles(userId, folderId = null) {
    const files = await filesRepository.findByOwner(userId, folderId);
    return files;
  }

  // Search files
  async searchFiles(userId, query) {
    if (!query || query.trim() === "") {
      throw new BadRequestError("Search query is required");
    }
    const files = await filesRepository.searchFiles(userId, query.trim());
    return files;
  }

  // Generate share link
  async shareFile(fileId, userId, expiresInHours = 24) {
    const file = await filesRepository.findById(fileId);
    if (!file) throw new NotFoundError("File not found");

    if (file.owner.toString() !== userId.toString()) {
      throw new ForbiddenError("You do not have permission to share this file");
    }

    const shareToken = uuidv4();
    const shareExpiresAt = new Date(
      Date.now() + expiresInHours * 60 * 60 * 1000,
    );

    const updatedFile = await filesRepository.updateFile(fileId, {
      isShared: true,
      shareToken,
      shareExpiresAt,
    });

    return { shareToken, shareExpiresAt, file: updatedFile };
  }

  // Download via share token
  async downloadSharedFile(shareToken) {
    const file = await filesRepository.findByShareToken(shareToken);
    if (!file) throw new NotFoundError("Shared file not found");

    // Expiry check
    if (file.shareExpiresAt && new Date() > file.shareExpiresAt) {
      throw new BadRequestError("Share link has expired");
    }

    if (!fs.existsSync(file.path)) {
      throw new NotFoundError("File not found on disk");
    }

    await filesRepository.incrementDownloadCount(file._id);

    return file;
  }

  // Storage info
  async getStorageInfo(userId) {
    const user = await authRepository.findById(userId);
    if (!user) throw new NotFoundError("User not found");

    return {
      usedMB: user.storageUsedMB.toFixed(2),
      quotaMB: user.storageQuotaMB,
      availableMB: (user.storageQuotaMB - user.storageUsedMB).toFixed(2),
      usedPercent: ((user.storageUsedMB / user.storageQuotaMB) * 100).toFixed(
        1,
      ),
    };
  }
}

module.exports = new FilesService();
