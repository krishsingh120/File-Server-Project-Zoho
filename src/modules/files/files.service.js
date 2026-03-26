// src/modules/files/files.service.js
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const filesRepository = require("./files.repository");
const authRepository = require("../auth/auth.repository");
const NotFoundError = require("../../errors/notFound.error");
const BadRequestError = require("../../errors/badRequest.error");
const ForbiddenError = require("../../errors/forbidden.error");
const { addFileProcessingJob } = require("../../providers/bullmq.provider");
const { addThumbnailJob } = require("../notifications/jobs/thumbnail.job");
const {
  uploadToMinio,
  getPresignedUrl,
  deleteFromMinio,
  MINIO_BUCKET,
} = require("../../providers/minio.provider");
const logger = require("../../utils/logger");

class FilesService {
  // ─── Upload Single File ─────────────────────────────────────────────────────
  async uploadFile(fileData, userId) {
    const user = await authRepository.findById(userId);
    if (!user) throw new NotFoundError("User not found");

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
      fs.unlinkSync(fileData.path); // temp file delete
      throw new BadRequestError("Storage quota exceeded");
    }

    // MinIO object key — userId/uuid-filename.ext
    const ext = path.extname(fileData.originalname).toLowerCase();
    const objectKey = `${userId}/${uuidv4()}-${Date.now()}${ext}`;

    // Local disk → MinIO upload
    await uploadToMinio(fileData.path, objectKey, fileData.mimetype);

    // Temp file delete — MinIO pe upload ho gaya
    fs.unlinkSync(fileData.path);

    // DB mein save
    const file = await filesRepository.createFile({
      originalName: fileData.originalname,
      storedName: path.basename(objectKey),
      mimeType: fileData.mimetype,
      size: fileData.size,
      objectKey, // ← MinIO path
      bucketName: MINIO_BUCKET, // ← MinIO bucket
      owner: userId,
      folderId: fileData.folderId || null,
      processingStatus: "pending",
    });

    // BullMQ jobs — objectKey pass karo (filePath ki jagah)
    try {
      await addFileProcessingJob({
        fileId: file._id.toString(),
        objectKey: file.objectKey, // ← path nahi, objectKey
        mimeType: file.mimeType,
        userId: userId.toString(),
      });

      if (file.mimeType.startsWith("image/")) {
        await addThumbnailJob({
          fileId: file._id.toString(),
          objectKey: file.objectKey,
          mimeType: file.mimeType,
          userId: userId.toString(),
        });
      }
    } catch (jobError) {
      logger.error(
        `[FilesService] BullMQ job add failed — fileId: ${file._id} | ${jobError.message}`,
      );
    }

    return file;
  }

  // ─── Upload Multiple Files ──────────────────────────────────────────────────
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

  // ─── Download File — Presigned URL ─────────────────────────────────────────
  async downloadFile(fileId, userId) {
    const file = await filesRepository.findById(fileId);
    if (!file) throw new NotFoundError("File not found");

    if (file.owner.toString() !== userId.toString()) {
      if (!file.isShared) {
        throw new ForbiddenError(
          "You do not have permission to download this file",
        );
      }
    }

    // MinIO se presigned URL banao — 1 hour valid
    const presignedUrl = await getPresignedUrl(file.objectKey, 3600);

    await filesRepository.incrementDownloadCount(fileId);

    return { file, presignedUrl }; // ← controller presignedUrl redirect karega
  }

  // ─── Delete File ────────────────────────────────────────────────────────────
  async deleteFile(fileId, userId) {
    const file = await filesRepository.findById(fileId);
    if (!file) throw new NotFoundError("File not found");

    if (file.owner.toString() !== userId.toString()) {
      throw new ForbiddenError(
        "You do not have permission to delete this file",
      );
    }

    // MinIO se delete karo
    await deleteFromMinio(file.objectKey);

    // Thumbnail bhi delete karo agar hai
    if (file.thumbnailKey) {
      await deleteFromMinio(file.thumbnailKey);
    }

    // Storage quota update
    const fileSizeMB = file.size / (1024 * 1024);
    await authRepository.updateUser(
      { _id: userId },
      { $inc: { storageUsedMB: -fileSizeMB } },
    );

    await filesRepository.deleteFile(fileId);

    return { message: "File deleted successfully" };
  }

  // ─── List Files ─────────────────────────────────────────────────────────────
  async listFiles(userId, folderId = null) {
    const files = await filesRepository.findByOwner(userId, folderId);
    return files;
  }

  // ─── Search Files ────────────────────────────────────────────────────────────
  async searchFiles(userId, query) {
    if (!query || query.trim() === "") {
      throw new BadRequestError("Search query is required");
    }
    const files = await filesRepository.searchFiles(userId, query.trim());
    return files;
  }

  // ─── Share File ──────────────────────────────────────────────────────────────
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

  // ─── Download via Share Token ────────────────────────────────────────────────
  async downloadSharedFile(shareToken) {
    const file = await filesRepository.findByShareToken(shareToken);
    if (!file) throw new NotFoundError("Shared file not found");

    if (file.shareExpiresAt && new Date() > file.shareExpiresAt) {
      throw new BadRequestError("Share link has expired");
    }

    const presignedUrl = await getPresignedUrl(file.objectKey, 3600);

    await filesRepository.incrementDownloadCount(file._id);

    return { file, presignedUrl };
  }

  // ─── Storage Info ────────────────────────────────────────────────────────────
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
