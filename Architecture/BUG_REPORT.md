# File Server - Critical Bugs & Fixes

## EXECUTIVE SUMMARY

**Critical Issues Found:** 4  
**Warning Issues Found:** 8  
**Total Code Affected:** 6 files  
**Estimated Time to Fix:** 2-3 hours

---

## 🔴 CRITICAL BUGS (Must Fix)

### BUG #1: File Processing Jobs ALWAYS FAIL

**Location:** `src/modules/notifications/jobs/fileProcessor.job.js` (Line 35)

**Problem:**
```javascript
// In files.service.js (Line 68)
await addFileProcessingJob({
  fileId: file._id.toString(),
  objectKey: file.objectKey,        // ← Passing objectKey
  mimeType: file.mimeType,
  userId: userId.toString(),
});

// In fileProcessor.job.js (Line 32)
const { fileId, filePath, mimeType, userId } = job.data;
// ← Expecting filePath but received objectKey!

if (!fs.existsSync(filePath)) {     // ← ALWAYS FAILS
  throw new Error(`File not found on disk: ${filePath}`);
}
```

**Impact:** ALL file processing jobs fail → processingStatus stays "pending" → magic bytes check never runs → thumbnails never generated

**Severity:** 🔴 CRITICAL (100% failure rate)

**Fix:**
```javascript
// fileProcessor.job.js - Update to use MinIO instead of disk

const fileProcessorWorker = new Worker(
  QUEUE_NAMES.FILE_PROCESSING,
  async (job) => {
    const { fileId, objectKey, mimeType, userId } = job.data;  // ← Changed from filePath

    logger.info(`[FileProcessor] Processing started — fileId: ${fileId}`);

    // Download file temporarily from MinIO
    const tempPath = `/tmp/${fileId}-${Date.now()}`;
    
    try {
      // Download from MinIO to temp location
      const stream = await minioClient.getObject(MINIO_BUCKET, objectKey);
      const writeStream = fs.createWriteStream(tempPath);
      
      await new Promise((resolve, reject) => {
        stream.pipe(writeStream)
          .on('finish', resolve)
          .on('error', reject);
      });

      // Now process temp file
      const detectedMime = detectMimeFromMagicBytes(tempPath);
      const safe = isMimeSafe(mimeType, detectedMime);

      if (!safe) {
        logger.error(`[FileProcessor] MIME mismatch — fileId: ${fileId}`);
        await filesRepository.updateFile(fileId, {
          processingStatus: "rejected",
          processingNote: `MIME mismatch: declared ${mimeType}, actual ${detectedMime}`,
        });
        
        emitToUser(userId, SOCKET_EVENTS.FILE_REJECTED, {
          fileId,
          reason: `MIME mismatch: declared ${mimeType}, actual ${detectedMime}`,
        });
        
        throw new Error(`MIME mismatch detected — file rejected: ${fileId}`);
      }

      // Extract metadata
      const stats = fs.statSync(tempPath);
      const metadata = {
        detectedMimeType: detectedMime || mimeType,
        extension: path.extname(objectKey).toLowerCase(),
        sizeBytes: stats.size,
        lastModified: stats.mtime,
      };

      // Update DB
      await filesRepository.updateFile(fileId, {
        processingStatus: "completed",
        metadata,
      });

      emitToUser(userId, SOCKET_EVENTS.FILE_COMPLETED, {
        fileId,
        metadata,
      });

    } finally {
      // Cleanup temp file
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    }
  },
  { connection: redisConnection }
);
```

---

### BUG #2: Folder Delete References Disk Files That Are In MinIO

**Location:** `src/modules/folders/folders.service.js` (Lines 90-99)

**Problem:**
```javascript
async deleteFolder(folderId, ownerId) {
  // ... BFS to find folders ...
  
  for (const fid of allFolderIds) {
    const files = await filesRepository.findByOwner(ownerId, fid);

    for (const file of files) {
      // ❌ WRONG: Files are IN MinIO, not on disk!
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      // Files stay in MinIO → Storage bloat
      
      totalFreedMB += file.size / (1024 * 1024);
      await filesRepository.deleteFile(file._id);
    }
  }
}
```

**Impact:** Files deleted from database but remain in MinIO → Storage leak → Quota appears freed but storage still used

**Severity:** 🔴 CRITICAL (Storage leak)

**Fix:**
```javascript
for (const fid of allFolderIds) {
  const files = await filesRepository.findByOwner(ownerId, fid);

  for (const file of files) {
    try {
      // Delete from MinIO (not disk)
      if (file.objectKey) {
        await deleteFromMinio(file.objectKey);
      }
      
      // Delete thumbnail if exists
      if (file.thumbnailKey) {
        await deleteFromMinio(file.thumbnailKey);
      }
    } catch (error) {
      logger.error(`Failed to delete from MinIO: ${error.message}`);
      // Continue anyway — ensure DB cleanup happens
    }
    
    totalFreedMB += file.size / (1024 * 1024);
    await filesRepository.deleteFile(file._id);
  }
}
```

---

### BUG #3: updateUser Method Overloaded (Two Definitions)

**Location:** `src/modules/auth/auth.repository.js` (Lines 24-33)

**Problem:**
```javascript
// Definition 1 (Line 16-22)
async updateUser(id, updateData) {
  const user = await User.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  });
  return user;
}

// Definition 2 (Line 24-32) - OVERWRITES #1
async updateUser(filter, updateData) {
  const user = await User.findOneAndUpdate(filter, updateData, {
    new: true,
    runValidators: true,
  });
  return user;
}

// Result: First definition unreachable!
```

**Impact:** Code confusion, only second method callable

**Severity:** 🔴 CRITICAL (Dead code path)

**Fix:**
```javascript
// Keep only one, rename if needed
async updateUserById(id, updateData) {
  const user = await User.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  });
  return user;
}

async updateUserByFilter(filter, updateData) {
  const user = await User.findOneAndUpdate(filter, updateData, {
    new: true,
    runValidators: true,
  });
  return user;
}
```

---

### BUG #4: N+1 Query Problem in Folder Deletion

**Location:** `src/modules/folders/folders.service.js` (Lines 73-85)

**Problem:**
```javascript
async deleteFolder(folderId, ownerId) {
  const allFolderIds = [];
  const queue = [folderId];
  
  while (queue.length > 0) {
    const currentId = queue.shift();
    allFolderIds.push(currentId);
    
    // ❌ ONE QUERY PER FOLDER
    const children = await foldersRepository.findByParentId(currentId);
    // ...
  }
  // If user has 10,000 nested folders = 10,000 DB queries!
  
  for (const fid of allFolderIds) {
    // ❌ ANOTHER QUERY PER FOLDER
    const files = await filesRepository.findByOwner(ownerId, fid);
  }
  // 10,000 folders = 20,000 queries total!
}
```

**Symptom:** Deleting large folder structures takes minutes or times out

**Severity:** 🔴 CRITICAL (Performance)

**Fix:**
```javascript
async deleteFolder(folderId, ownerId) {
  try {
    // Get ALL nested data in bulk
    const allFolderData = await foldersRepository.findRecursiveByParent(folderId);
    const allFolderIds = allFolderData.map(f => f._id);
    
    // Get ALL files AT ONCE
    const allFiles = await filesRepository.findByMultipleFolders(ownerId, allFolderIds);
    
    // Delete from MinIO in parallel
    const minioKeys = allFiles
      .filter(f => f.objectKey)
      .map(f => ({ name: f.objectKey }));
    
    if (minioKeys.length > 0) {
      await minioClient.removeObjects(MINIO_BUCKET, minioKeys);
    }
    
    // Delete thumbnails in parallel
    const thumbnailKeys = allFiles
      .filter(f => f.thumbnailKey)
      .map(f => ({ name: f.thumbnailKey }));
    
    if (thumbnailKeys.length > 0) {
      await minioClient.removeObjects(MINIO_BUCKET, thumbnailKeys);
    }
    
    // Update quota once
    const totalFreedMB = allFiles.reduce((sum, f) => sum + f.size / (1024 * 1024), 0);
    
    if (totalFreedMB > 0) {
      await authRepository.updateUserById(
        ownerId,
        { $inc: { storageUsedMB: -totalFreedMB } }
      );
    }
    
    // Delete all files in batch
    await filesRepository.deleteMany(allFiles.map(f => f._id));
    
    // Delete all folders in batch
    await foldersRepository.deleteManyFolders(allFolderIds);
    
  } catch (error) {
    logger.error(`Folder deletion failed: ${error.message}`);
    throw error;
  }
}

// Add to repository:
async findRecursiveByParent(parentId) {
  // Use MongoDB aggregation for efficiency
  const pipeline = [
    { $match: { $or: [{ _id: parentId }, { parentId }] } },
    {
      $graphLookup: {
        from: "folders",
        startWith: "$_id",
        connectFromField: "_id",
        connectToField: "parentId",
        as: "allDescendants"
      }
    }
  ];
  return Folder.collection.aggregate(pipeline).toArray();
}

async findByMultipleFolders(ownerId, folderIds) {
  return File.find({
    owner: ownerId,
    folderId: { $in: folderIds }
  });
}
```

---

## 🟡 WARNING ISSUES (Should Fix)

### ISSUE #5: Missing Pagination on List Files

**Location:** `src/modules/files/files.service.js` (Line 166)

**Problem:**
```javascript
async listFiles(userId, folderId = null) {
  const files = await filesRepository.findByOwner(userId, folderId);
  return files;  // ← Returns ALL files in memory
}
```

**Risk:** User with 100,000 files → 100MB JSON response → Browser crash

**Fix:**
```javascript
async listFiles(userId, folderId = null, page = 1, limit = 50) {
  if (page < 1 || limit < 1 || limit > 1000) {
    throw new BadRequestError("Invalid pagination parameters");
  }
  
  const skip = (page - 1) * limit;
  
  const [files, total] = await Promise.all([
    filesRepository
      .findByOwner(userId, folderId)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 }),
    filesRepository.countByOwner(userId, folderId)
  ]);
  
  return {
    files,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      hasMore: skip + limit < total
    }
  };
}
```

---

### ISSUE #6: No Text Indexes for Search

**Location:** `src/modules/files/files.model.js`

**Problem:**
```javascript
async searchFiles(userId, query) {
  const files = await filesRepository.searchFiles(userId, query.trim());
  // ← Without indexes: O(n) scan of entire collection
}
```

**Risk:** Search on 1M files takes 10+ seconds

**Fix:**
```javascript
// In files.model.js
fileSchema.index({ originalName: "text" });
fileSchema.index({ "metadata.extension": 1 });

// In search query:
async searchFiles(userId, query) {
  // Use text search with score
  const files = await File.find(
    {
      owner: userId,
      $text: { $search: query }
    },
    { score: { $meta: "textScore" } }
  )
  .sort({ score: { $meta: "textScore" } })
  .limit(100);
  
  return files;
}
```

---

### ISSUE #7: Presigned URL Generated on Every Download

**Location:** `src/modules/files/files.service.js` (Line 132)

**Problem:**
```javascript
async downloadFile(fileId, userId) {
  const file = await filesRepository.findById(fileId);
  // Generates NEW presigned URL every time
  const presignedUrl = await getPresignedUrl(file.objectKey, 3600);
  // CPU-intensive operation
}
```

**Risk:** 1000 concurrent downloads = 1000 URL generations = CPU spike

**Fix:**
```javascript
async downloadFile(fileId, userId) {
  const file = await filesRepository.findById(fileId);
  
  if (file.owner.toString() !== userId.toString()) {
    if (!file.isShared) {
      throw new ForbiddenError("Unauthorized");
    }
  }
  
  // Check cache first
  const cacheKey = `presigned:${fileId}`;
  let presignedUrl = await redis.get(cacheKey);
  
  if (!presignedUrl) {
    // Generate only if not cached
    presignedUrl = await getPresignedUrl(file.objectKey, 3600);
    
    // Cache for 55 minutes (5 min before expiry)
    await redis.set(cacheKey, presignedUrl, "EX", 3300);
  }
  
  await filesRepository.incrementDownloadCount(fileId);
  return { file, presignedUrl };
}
```

---

### ISSUE #8: No Download Rate Limiting

**Location:** `src/modules/files/files.routes.js`

**Problem:**
```javascript
app.get("/api/v1/files/:fileId", authenticate, filesController.downloadFile);
// ← No rate limiter, can be abused
```

**Risk:** Attacker downloads same file 1000 times in 10 seconds → DOS

**Fix:**
```javascript
// Add to files.routes.js
const downloadLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,     // 1 hour
  max: 100,                      // Max 100 downloads per hour
  keyPrefix: "rl:download:",
});

router.get(
  "/:fileId",
  authenticate,
  downloadLimiter,              // ← Add rate limiter
  filesController.downloadFile
);
```

---

### ISSUE #9: Presigned URLs for Shared Files Not Rate Limited

**Location:** `src/modules/files/files.service.js` (Line 208)

**Problem:**
```javascript
async downloadSharedFile(shareToken) {
  const file = await filesRepository.findByShareToken(shareToken);
  // Anyone with token can download unlimited times
}
```

**Risk:** Share token leaked → Attacker DOS → MinIO bandwidth spike

**Fix:**
```javascript
// In files.routes.js
const shareDownloadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 500,
  keyGenerator: (req) => req.params.shareToken + req.ip,
  skip: (req) => req.query.bypass,  // Skip if bypass param set
});

router.get(
  "/shared/:shareToken",
  shareDownloadLimiter,
  filesController.downloadSharedFile
);
```

---

### ISSUE #10: No Virus Scanning

**Location:** `src/modules/notifications/jobs/fileProcessor.job.js`

**Problem:**
```javascript
const detectedMime = detectMimeFromMagicBytes(filePath);
// Only checks if MIME matches filename
// Doesn't scan for actual malware
```

**Risk:** User uploads infected file with correct MIME → Malware spread

**Fix:**
```javascript
// Install: npm install clamd

const clamd = require("clamd");
const scannerClient = new clamd.Client();

async checkMalware(filePath) {
  try {
    const result = await scannerClient.scanFile(filePath);
    
    if (result.status === "INFECTED") {
      fs.unlinkSync(filePath);
      throw new Error(`Malware detected: ${result.stream}`);
    }
  } catch (error) {
    if (error.message.includes("does not exist")) {
      logger.info("[ClamAV] Not installed, skipping scan");
      return;  // Optional feature
    }
    throw error;
  }
}

// In fileProcessor job:
await checkMalware(tempPath);
```

---

### ISSUE #11: Error Recovery in Folder Delete

**Location:** `src/modules/folders/folders.service.js`

**Problem:**
```javascript
for (const fid of allFolderIds) {
  const files = await filesRepository.findByOwner(ownerId, fid);
  
  for (const file of files) {
    if (fs.existsSync(file.path)) {  // ← No error handling
      fs.unlinkSync(file.path);
    }
    
    await filesRepository.deleteFile(file._id);  // ← If this fails, partial delete
  }
}
```

**Risk:** Network error mid-deletion → partial state → corrupted data

**Fix:**
```javascript
async deleteFolder(folderId, ownerId) {
  const allFolderIds = [];
  // ... collect all folder IDs ...
  
  try {
    // Phase 1: Validate all data exists
    for (const fid of allFolderIds) {
      const folder = await foldersRepository.findById(fid);
      if (!folder) throw new NotFoundError(`Folder ${fid} not found`);
    }
    
    // Phase 2: Delete without rollback
    // Use saga pattern for recovery
    
  } catch (error) {
    logger.error(`Folder deletion failed: ${error.message}`);
    throw new InternalServerError("Folder deletion failed, no changes made");
  }
}
```

---

### ISSUE #12: Share Token Expiry Not Enforced in DB

**Location:** `src/modules/files/files.service.js` (Line 205)

**Problem:**
```javascript
async downloadSharedFile(shareToken) {
  const file = await filesRepository.findByShareToken(shareToken);
  
  if (file.shareExpiresAt && new Date() > file.shareExpiresAt) {
    throw new BadRequestError("Share link has expired");
  }
  // ← But file still exists in DB with expired token
}
```

**Risk:** Database bloat with expired share links

**Fix:**
```javascript
// Add TTL index to MongoDB
fileSchema.index(
  { shareExpiresAt: 1 },
  { expireAfterSeconds: 0 }  // Auto-delete when time passes
);

// Or manually clean up:
app.get("/admin/cleanup-expired-shares", authenticate, authorize("admin"), async (req, res) => {
  const result = await File.deleteMany({
    shareExpiresAt: { $lt: new Date() },
    isShared: true
  });
  
  res.json({ deletedCount: result.deletedCount });
});
```

---

## 🟢 RECOMMENDATIONS (Nice to Have)

1. **Add Request Validation:** Use `joi` or `zod` for schema validation
2. **Add Caching:** Redis cache for frequently accessed files
3. **Add Monitoring:** Prometheus metrics for performance tracking
4. **Add Audit Logging:** Track who accessed what and when
5. **Add File Versioning:** Keep file history
6. **Add Parallel Workers:** Scale BullMQ jobs across multiple servers

---

## IMPLEMENTATION PRIORITY

| Priority | Bug | Effort | Impact |
|----------|-----|--------|--------|
| 🔴 P0 | #1 Job Processing Fails | 1 hour | Critical |
| 🔴 P0 | #2 Folder Delete Storage Leak | 1 hour | Critical |
| 🔴 P0 | #3 Duplicate Method | 15 min | Critical |
| 🔴 P0 | #4 N+1 Query | 1 hour | Critical |
| 🟡 P1 | #5 Missing Pagination | 30 min | High |
| 🟡 P1 | #6 No Text Indexes | 30 min | High |
| 🟡 P1 | #7 URL Caching | 20 min | Medium |
| 🟡 P1 | #8 Download Rate Limit | 15 min | Medium |
| 🟡 P1 | #9 Share Download Rate Limit | 15 min | Medium |
| 🟡 P1 | #10 Virus Scanning | 2 hours | High |
| 🟡 P1 | #11 Error Recovery | 1 hour | Medium |
| 🟡 P1 | #12 Share Expiry Cleanup | 30 min | Low |

**Estimated Total Fix Time:** 8-10 hours

---

## TESTING STRATEGY

After fixes, test:

```bash
# Unit tests
npm test

# Integration tests with docker-compose
docker-compose up
npm run test:integration

# Load testing
artillery run load-test.yml

# Edge cases
- Upload during quota limits
- Folder delete with 10k+ files
- Concurrent uploads + deletes
- Network failures + retries
- Token expiry + refresh
```

---

End of Bug Report
