// src/modules/files/files.repository.js
const File = require("./files.model");

class FilesRepository {
  async createFile(fileData) {
    const file = await File.create(fileData);
    return file;
  }

  async findById(fileId) {
    const file = await File.findById(fileId);
    return file;
  }

  async findByOwner(ownerId, folderId = null) {
    const file = await File.find({
      owner: ownerId,
      folderId: folderId,
    }).sort({ createdAt: -1 });
    return file;
  }

  async findByShareToken(shareToken) {
    const file = await File.findOne({ shareToken });
    return file;
  }

  async deleteFile(fileId) {
    const file = await File.findByIdAndDelete(fileId);
    return file;
  }

  async updateFile(fileId, updateData) {
    const file = await File.findByIdAndUpdate(fileId, updateData, {
      new: true,
      runValidators: true,
    });
    return file;
  }

  async incrementDownloadCount(fileId) {
    const file = await File.findByIdAndUpdate(
      fileId,
      { $inc: { downloadCount: 1 } },
      { new: true },
    );
    return file;
  }

  async searchFiles(ownerId, query) {
    const files = await File.find({
      owner: ownerId,
      originalName: { $regex: query, $options: "i" },
    }).sort({ createdAt: -1 });
    return files;
  }

  async getTotalSizeByOwner(ownerId) {
    const result = await File.aggregate([
      { $match: { owner: ownerId } },
      { $group: { _id: null, totalSize: { $sum: "$size" } } },
    ]);
    return result[0]?.totalSize || 0;
  }
}

module.exports = new FilesRepository();
