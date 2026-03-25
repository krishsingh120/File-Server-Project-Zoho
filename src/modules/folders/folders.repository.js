// src/modules/folders/folders.repository.js
const Folder = require("./folders.model");

class FoldersRepository {
  async createFolder(folderData) {
    const folder = await Folder.create(folderData);
    return folder;
  }

  async findById(folderId) {
    const folder = await Folder.findById(folderId);
    return folder;
  }

  async findByOwner(ownerId, parentId = null) {
    const folders = await Folder.find({
      owner: ownerId,
      parentId: parentId,
    }).sort({ name: 1 });
    return folders;
  }

  async findByParentId(parentId) {
    const folders = await Folder.find({ parentId }).sort({ name: 1 });
    return folders;
  }

  async isDuplicateName(ownerId, parentId, name) {
    const folder = await Folder.findOne({
      owner: ownerId,
      parentId: parentId,
      name: name,
    });
    return !!folder;
  }

  async renameFolder(folderId, newName) {
    const folder = await Folder.findByIdAndUpdate(
      folderId,
      { name: newName },
      { new: true, runValidators: true },
    );
    return folder;
  }

  async deleteFolder(folderId) {
    const folder = await Folder.findByIdAndDelete(folderId);
    return folder;
  }

  async deleteManyFolders(folderIds) {
    await Folder.deleteMany({ _id: { $in: folderIds } });
  }
}

module.exports = new FoldersRepository();
