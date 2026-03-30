// src/modules/folders/folders.service.js
const fs = require("fs");
const foldersRepository = require("./folders.repository");
const filesRepository = require("../files/files.repository");
const authRepository = require("../auth/auth.repository");
const NotFoundError = require("../../errors/notFound.error");
const BadRequestError = require("../../errors/badRequest.error");
const ForbiddenError = require("../../errors/forbidden.error");

class FoldersService {
  // Create folder
  async createFolder(name, ownerId, parentId = null) {
    // parentId provided hai to check karo — exist karta hai + owner same hai
    if (parentId) {
      const parentFolder = await foldersRepository.findById(parentId);
      if (!parentFolder) throw new NotFoundError("Parent folder not found");
      if (parentFolder.owner.toString() !== ownerId.toString()) {
        throw new ForbiddenError("You do not own the parent folder");
      }
    }

    // Duplicate name check — same parent mein same naam nahi
    const isDuplicate = await foldersRepository.isDuplicateName(
      ownerId,
      parentId,
      name,
    );
    if (isDuplicate) {
      throw new BadRequestError(
        `Folder "${name}" already exists in this location`,
      );
    }

    const folder = await foldersRepository.createFolder({
      name,
      owner: ownerId,
      parentId,
    });

    return folder;
  }

  // List folders — root ya specific parent ke andar
  async listFolders(ownerId, parentId = null) {
    const folders = await foldersRepository.findByOwner(ownerId, parentId);
    return folders;
  }

  // Rename folder
  async renameFolder(folderId, newName, ownerId) {
    const folder = await foldersRepository.findById(folderId);
    if (!folder) throw new NotFoundError("Folder not found");

    if (folder.owner.toString() !== ownerId.toString()) {
      throw new ForbiddenError(
        "You do not have permission to rename this folder",
      );
    }

    // Duplicate check — same parent mein same naam nahi
    const isDuplicate = await foldersRepository.isDuplicateName(
      ownerId,
      folder.parentId,
      newName,
    );
    if (isDuplicate) {
      throw new BadRequestError(
        `Folder "${newName}" already exists in this location`,
      );
    }

    const updatedFolder = await foldersRepository.renameFolder(
      folderId,
      newName,
    );
    return updatedFolder;
  }

  // Delete folder — cascade (BFS)
  async deleteFolder(folderId, ownerId) {
    const folder = await foldersRepository.findById(folderId);
    if (!folder) throw new NotFoundError("Folder not found");

    if (folder.owner.toString() !== ownerId.toString()) {
      throw new ForbiddenError(
        "You do not have permission to delete this folder",
      );
    }

    // BFS — saare subfolders nikalo
    const allFolderIds = [];
    const queue = [folderId];

    while (queue.length > 0) {
      const currentId = queue.shift();
      allFolderIds.push(currentId);

      const children = await foldersRepository.findByParentId(currentId);
      for (const child of children) {
        queue.push(child._id);
      }
    }

    // Har folder ki files nikalo — disk + DB se delete karo
    let totalFreedMB = 0;

    for (const fid of allFolderIds) {
      const files = await filesRepository.findByOwner(ownerId, fid);

      for (const file of files) {
        // Disk se delete
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
        totalFreedMB += file.size / (1024 * 1024);

        // DB se delete
        await filesRepository.deleteFile(file._id);
      }
    }

    // Storage quota update karo
    if (totalFreedMB > 0) {
      await authRepository.updateUser(
        { _id: ownerId },
        { $inc: { storageUsedMB: -totalFreedMB } },
      );
    }

    // Saare folders delete karo
    await foldersRepository.deleteManyFolders(allFolderIds);

    return {
      message: "Folder and all its contents deleted successfully",
      deletedFolders: allFolderIds.length,
    };
  }

  // Move file to folder
  async moveFile(fileId, targetFolderId, ownerId) {
    const file = await filesRepository.findById(fileId);
    if (!file) throw new NotFoundError("File not found");

    if (file.owner.toString() !== ownerId.toString()) {
      throw new ForbiddenError("You do not have permission to move this file");
    }

    // targetFolderId null ho sakta hai — root mein move karo
    if (targetFolderId) {
      const targetFolder = await foldersRepository.findById(targetFolderId);
      if (!targetFolder) throw new NotFoundError("Target folder not found");

      if (targetFolder.owner.toString() !== ownerId.toString()) {
        throw new ForbiddenError("You do not own the target folder");
      }
    }

    const updatedFile = await filesRepository.updateFile(fileId, {
      folderId: targetFolderId || null,
    });

    return updatedFile;
  }

  // Get folder details + contents
  async getFolderContents(folderId, ownerId) {
    // folderId null = root
    if (folderId) {
      const folder = await foldersRepository.findById(folderId);
      if (!folder) throw new NotFoundError("Folder not found");

      if (folder.owner.toString() !== ownerId.toString()) {
        throw new ForbiddenError(
          "You do not have permission to access this folder",
        );
      }
    }

    const [folders, files] = await Promise.all([
      foldersRepository.findByOwner(ownerId, folderId || null),
      filesRepository.findByOwner(ownerId, folderId || null),
    ]);

    return { folders, files };
  }
}

module.exports = new FoldersService();
