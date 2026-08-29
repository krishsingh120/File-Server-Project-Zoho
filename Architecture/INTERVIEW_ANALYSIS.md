# Cross-Platform File Server - Production-Level System Analysis
## Interview Revision Guide

---

## STEP 1: PROBLEM UNDERSTANDING

### What Problem Are We Solving?

Building a **network-based file storage system** that allows multiple users to:
- Upload/download files securely
- Organize files in hierarchical folders
- Share files with expiring links
- Get real-time notifications about file operations
- Manage storage quotas

### Why This Problem Exists

Real-world enterprise systems need:
- **SMB/NFS equivalent for web**: Like Google Drive, OneDrive, Dropbox
- **Multi-user access**: Different users have different permissions
- **Scalability**: Handle 10k+ concurrent users
- **Reliability**: Files never lost, always consistent
- **Security**: Authentication, authorization, data protection

### Real-World Analogy

Think of it like a **Physical Post Office with Security**:
- **Users** = Different customers
- **Files** = Packages/letters
- **Folders** = Mailboxes
- **Quota** = Max storage space per customer
- **Sharing** = Temporary access passes with expiry
- **Async jobs** = Backend workers processing packages
- **Socket.io** = Real-time status updates to customers

---

## STEP 2: SYSTEM ARCHITECTURE FLOW

### Full Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT (Browser/App)                 │
│              HTTP REST API + WebSocket                   │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│              Express.js Server (API Gateway)             │
│  - Routes: /auth, /files, /folders                       │
│  - Middleware: Auth, RateLimiter, Security, Error        │
│  - Socket.io: Real-time notifications                    │
└─────────────────────────────────────────────────────────┘
         ↓           ↓          ↓           ↓
    ┌────────────────────────────────────────┐
    │  Authentication & Authorization         │
    │  - JWT Tokens + Refresh Rotation        │
    │  - Token Blacklist (Redis)              │
    │  - Role-based Access Control            │
    └────────────────────────────────────────┘
         ↓           ↓          ↓           ↓
    ┌────────────────────────────────────────┐
    │    Data Layer (Business Logic)          │
    │  - FilesService                         │
    │  - FoldersService                       │
    │  - AuthService                          │
    │  - Quota Management                     │
    └────────────────────────────────────────┘
         ↓           ↓          ↓           ↓
    ┌────────────────────────────┐  ┌──────────────────┐
    │     MongoDB                 │  │   Redis (Cache)  │
    │  - User metadata            │  │  - Auth tokens   │
    │  - File metadata            │  │  - Rate limits   │
    │  - Folder structure         │  │  - Sessions      │
    │  - Permissions              │  └──────────────────┘
    └────────────────────────────┘
         ↓
    ┌────────────────────────────┐  ┌──────────────────┐
    │     MinIO (S3-like)         │  │   BullMQ         │
    │  - File blob storage        │  │  - Async jobs    │
    │  - Presigned URLs           │  │  - Retry logic   │
    │  - Object lifecycle         │  │  - Timeout mgmt  │
    └────────────────────────────┘  └──────────────────┘
         ↓
    ┌────────────────────────────┐
    │    Background Workers       │
    │  - File processing job      │
    │  - Thumbnail generation     │
    │  - Metadata extraction      │
    │  - Notifications            │
    └────────────────────────────┘
```

### Data Flow: File Upload

```
1. Client: File → Multipart Upload
   ↓
2. Server: Multer Middleware (tmp storage)
   ↓
3. Auth Check: JWT verification, user ownership
   ↓
4. Quota Check: Atomic MongoDB update ($expr + $inc)
   ↓
5. MinIO Upload: Stream from disk → S3-like storage
   ↓
6. Temp Cleanup: Delete local file
   ↓
7. DB Save: File metadata in MongoDB
   ↓
8. Job Queue: Add BullMQ job for processing
   ↓
9. Worker: Magic bytes detection, MIME validation
   ↓
10. Socket.io: Real-time notification to client
```

### Data Flow: File Download

```
1. Client: GET /api/v1/files/{fileId}
   ↓
2. Auth: JWT verification
   ↓
3. Permission Check: Owner or valid share token
   ↓
4. DB Query: Get file metadata + objectKey
   ↓
5. Presigned URL: Generate 1-hour temporary URL from MinIO
   ↓
6. Redirect: Browser redirected to MinIO presigned URL
   ↓
7. Download Count: Increment in DB
   ↓
8. Browser: Direct download from MinIO (no server bandwidth)
```

### Major Components

| Component         | Technology    | Purpose                                    |
|------------------|---------------|--------------------------------------------|
| **API Server**   | Express.js    | Request handling, routing, middleware      |
| **Database**     | MongoDB       | User, file, folder metadata storage        |
| **Object Store** | MinIO (S3)    | File blob storage, presigned URLs          |
| **Cache/Session**| Redis         | Token blacklist, rate limiting, sessions   |
| **Job Queue**    | BullMQ        | Async file processing, retries              |
| **Real-time**    | Socket.io     | WebSocket notifications to clients          |
| **Workers**      | Node.js       | Background job processing                   |

### Component Interactions

```
Auth Flow:
User → Register/Login → JWT Token + Refresh Token → Store in Redis

File Upload Flow:
User Request → Auth Check → Quota Validation → Multer → MinIO → DB → BullMQ Job

File Download Flow:
User Request → Auth Check → Permission Check → Presigned URL → Browser Direct Access

Folder Structure:
Create/Delete/Rename → Hierarchy Validation → Permission Check → DB Update

Real-time Updates:
BullMQ Job → Socket.io Event → Connected User's Browser
```

---

## STEP 3: SOLUTION EXPLANATION

### How the System Works (Step-by-Step)

#### 1. **User Registration & Authentication**
```javascript
// User registers with email + password
POST /api/v1/auth/register
{
  name: "John Doe",
  email: "john@example.com",
  password: "SecurePassword123"
}
```

**Process:**
- Check email uniqueness
- Hash password with bcrypt (12 rounds)
- Create user in MongoDB
- Generate JWT access token (15 min)
- Generate refresh token (7 days)
- Store refresh token in Redis
- Return tokens in response + httpOnly cookie

**Key Decision:** Refresh tokens in Redis allow instant revocation (logout)

---

#### 2. **File Upload with Quota Management**
```javascript
// Upload file
POST /api/v1/files/upload
Headers: Authorization: Bearer <accessToken>
Body: FormData { file: <binary> }
```

**Process:**

```javascript
// Step 1: Atomic quota validation
const updatedUser = await User.findOneAndUpdate(
  {
    _id: userId,
    $expr: {
      $lte: [{ $add: ["$storageUsedMB", fileSizeMB] }, "$storageQuotaMB"]
      // Checks: currentUsed + newFile <= quota
    }
  },
  { $inc: { storageUsedMB: fileSizeMB } },  // Increment if valid
  { new: true }
);

if (!updatedUser) {
  throw new BadRequestError("Storage quota exceeded");
  // Entire operation atomic — no partial data
}
```

**Why atomic?** Prevents race condition:
- User A has 100MB quota, used 90MB
- User A starts uploading two 10MB files simultaneously
- Without atomic: Both might succeed (90+10+10 = 110MB > 100MB ❌)
- With atomic: One succeeds, one fails ✅

---

#### 3. **MinIO Storage Strategy**

**Object Key Structure:**
```
userId/uuid-timestamp.extension
Example: 507f1f77bcf86cd799439011/a1b2c3d4-1234567890.pdf
```

**Why this structure?**
- **userId prefix**: Easy to segregate user data (delete all user files quickly)
- **uuid**: Prevents filename collisions
- **timestamp**: Helps with sorting, debugging
- **extension**: For MIME type inference fallback

**Presigned URLs for Downloads:**
```javascript
// Generate 1-hour temporary URL
const presignedUrl = await minioClient.presignedGetObject(
  "file-server",
  "userId/uuid.pdf",
  3600  // expires in 1 hour
);
// Client redirected to MinIO, server bandwidth saved ✅
```

---

#### 4. **File Processing Pipeline**

**Problem:** How to validate files safely and extract metadata?

**Solution:** Async job queue with Magic Bytes detection

```javascript
// Step 1: Upload → Queue job
await addFileProcessingJob({
  fileId: file._id,
  objectKey: file.objectKey,
  mimeType: file.mimeType  // from multer
});

// Step 2: Worker process
const magic = detectMimeFromMagicBytes(filePath);
// Magic bytes = first few hexadecimal bytes identifying file type
// JPEG: FFD8FF
// PNG:  89504E47
// PDF:  25504446
// Prevents disguised malicious files (e.g., .exe disguised as .jpg)

// Step 3: MIME Safety Check
if (declaredMime !== detectedMime) {
  // Reject file — potential security threat
  fs.unlinkSync(filePath);
  updateFile(fileId, { status: "rejected" });
}

// Step 4: Metadata Extraction
metadata = {
  detectedMimeType: "image/jpeg",
  extension: ".jpg",
  sizeBytes: 1024000,
  lastModified: "2024-01-15T10:30:00Z"
};
updateFile(fileId, { metadata, status: "completed" });

// Step 5: Emit real-time notification
emitToUser(userId, SOCKET_EVENTS.FILE_COMPLETED, { fileId });
```

**Retry Logic:**
```javascript
defaultJobOptions: {
  attempts: 3,           // Retry 3 times if fails
  backoff: {
    type: "exponential",
    delay: 1000          // 1s → 2s → 4s retry delays
  }
}
```

**Why BullMQ?**
- Long operations don't block API server
- Automatic retries with exponential backoff
- Persistence in Redis (recovers from server crash)
- Real-time job progress tracking via Socket.io

---

#### 5. **Folder Hierarchy & Cascade Delete**

**Problem:** Users organize files in folders. Deleting a folder should delete all subfolders and files (cascade). But this is complex.

**Solution:** BFS (Breadth-First Search) for safe deletion

```javascript
async deleteFolder(folderId, userId) {
  // Step 1: BFS to find all nested folders
  const allFolderIds = [];
  const queue = [folderId];
  
  while (queue.length > 0) {
    const currentId = queue.shift();
    allFolderIds.push(currentId);
    
    const children = await foldersRepository.findByParentId(currentId);
    for (const child of children) {
      queue.push(child._id);  // Add to queue for processing
    }
  }
  
  // Result: Complete tree of all folders to delete
  
  // Step 2: For each folder, delete all files
  let totalFreedMB = 0;
  
  for (const fid of allFolderIds) {
    const files = await filesRepository.findByOwner(userId, fid);
    
    for (const file of files) {
      // Delete from MinIO
      await deleteFromMinio(file.objectKey);
      
      // Delete from DB
      await filesRepository.deleteFile(file._id);
      
      // Track freed space
      totalFreedMB += file.size / (1024 * 1024);
    }
  }
  
  // Step 3: Update quota
  if (totalFreedMB > 0) {
    await authRepository.updateUser(
      { _id: userId },
      { $inc: { storageUsedMB: -totalFreedMB } }
    );
  }
  
  // Step 4: Delete all folders
  await foldersRepository.deleteManyFolders(allFolderIds);
}
```

**Why BFS over DFS?**
- BFS safer for concurrent access (processes level by level)
- DFS risks deep recursion stack overflow
- BFS easier to resume if job fails mid-way

---

#### 6. **File Sharing with Expiring Links**

**Problem:** Share file with external users, but only for limited time

**Solution:** Stateless tokens + timestamp validation

```javascript
async shareFile(fileId, userId, expiresInHours = 24) {
  const shareToken = uuidv4();  // Cryptographically secure random token
  const shareExpiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
  
  const updatedFile = await filesRepository.updateFile(fileId, {
    isShared: true,
    shareToken,
    shareExpiresAt
  });
  
  return {
    shareLink: `https://example.com/api/v1/files/shared/${shareToken}`,
    shareExpiresAt
  };
}

// When someone downloads via shared link:
async downloadSharedFile(shareToken) {
  const file = await filesRepository.findByShareToken(shareToken);
  
  // Check expiry
  if (file.shareExpiresAt && new Date() > file.shareExpiresAt) {
    throw new BadRequestError("Share link has expired");
  }
  
  // Generate presigned URL even for shared files
  const presignedUrl = await getPresignedUrl(file.objectKey, 3600);
  return { presignedUrl };
}
```

**Advantages:**
- ✅ No database lookups for every download (tokens are self-contained)
- ✅ Stateless (can scale horizontally)
- ✅ User can always revoke by deleting token
- ✅ Automatic expiry without cleanup jobs

---

### Time & Space Complexity Analysis

| Operation          | Time Complexity | Space Complexity | Notes |
|--------------------|-----------------|------------------|-------|
| File Upload        | O(n)            | O(n)             | n = file size (streaming) |
| File Download      | O(1)            | O(1)             | Just URL generation |
| List Files         | O(k)            | O(k)             | k = files in folder |
| Search Files       | O(k)            | O(k)             | MongoDB text search |
| Folder Delete      | O(f+s)          | O(f)             | f = files, s = subfolders |
| Quota Check        | O(1)            | O(1)             | Atomic MongoDB operation |
| Magic Bytes Check  | O(1)            | O(1)             | First 8 bytes only |

---

## STEP 4: WHY THIS SOLUTION WORKS

### Key Design Decisions & Rationale

#### 1. **Why MinIO for File Storage?**

**Problem:** Storing files on disk doesn't scale
- Single server disk fills up
- No redundancy
- Hard to migrate data
- Expensive to scale horizontally

**Solution:** Use S3-like object storage (MinIO)
```
┌─────────────────────┐
│   Node.js Server    │
│   (Stateless)       │
│   Can scale to 100s │
└─────────────────────┘
           ↓
┌─────────────────────┐
│   MinIO Cluster     │
│   (Replicated)      │
│   Automatic backup  │
└─────────────────────┘
```

**Benefits:**
- ✅ Server is stateless (can crash and restart)
- ✅ Files survive server failure
- ✅ Easy horizontal scaling
- ✅ Presigned URLs reduce server load
- ✅ Lifecycle policies (auto-delete old files)

---

#### 2. **Why BullMQ for Async Jobs?**

**Problem:** File processing blocks request
```javascript
// ❌ BLOCKING (Bad)
POST /upload → Process → Respond (5 seconds) ❌ User waits
```

**Solution:** Queue + Background Worker
```javascript
// ✅ ASYNC (Good)
POST /upload → Queue job → Respond immediately (100ms) ✅ User happy
Background → Process → Notify via WebSocket
```

**Specific Advantages:**
- Long-running tasks don't block API
- Automatic retry with exponential backoff
- Dead letter queue for failed jobs
- Redis persistence (survives restarts)
- Scalable: Add more workers

---

#### 3. **Why JWT with Refresh Tokens?**

**Problem:** Token expiry doesn't match use case
- Short token (15 min): Frequent refreshes = bad UX
- Long token (7 days): Security risk if token leaked

**Solution:** Two-token strategy
```
┌──────────────────────────────────────────┐
│ Access Token (15 min)                    │
│ - Used for every API request             │
│ - Short-lived reduces damage if stolen   │
│ - Stored in memory (not localStorage)    │
└──────────────────────────────────────────┘
        ↓ Expires
┌──────────────────────────────────────────┐
│ Refresh Token (7 days)                   │
│ - Stored in httpOnly cookie              │
│ - Can't be stolen by XSS                 │
│ - Used to get new access token           │
│ - Server validates before issuing        │
└──────────────────────────────────────────┘
```

**Refresh Token Rotation:** Each refresh generates new refresh token
```javascript
POST /refresh → Verify old token → Check Redis → Generate new tokens
```

**Advantages:**
- ✅ Balances security and UX
- ✅ Can revoke all sessions instantly (delete from Redis)
- ✅ Protects against XSS (httpOnly)
- ✅ Prevents CSRF (sameSite: "strict")

---

#### 4. **Why Atomic Quota Checking?**

**Race Condition Without Atomic:**
```
Timeline:
T1: User A uploads 10MB
    Read: used=90MB, quota=100MB ✅
    Calculate: 90+10=100 (OK)
T2: User A uploads another 10MB (simultaneously)
    Read: used=90MB, quota=100MB ✅ (before T1 updates)
    Calculate: 90+10=100 (OK)
T3: User A uploads third 10MB
    Read: used=90MB, quota=100MB ✅ (before T1, T2 update)

Result: All three succeed = 90+10+10+10 = 120MB (OVER QUOTA) ❌
```

**Solution: Atomic MongoDB Operation:**
```javascript
await User.findOneAndUpdate(
  {
    _id: userId,
    $expr: {
      $lte: [{ $add: ["$storageUsedMB", 10] }, "$storageQuotaMB"]
    }
  },
  { $inc: { storageUsedMB: 10 } }
);
// MongoDB guarantees: Read + Write happen atomically
// => Only ONE succeeds, others fail with "no document matched"
```

**Database Guarantees:**
- Read condition checked
- Write happens instantly
- No race condition possible

---

#### 5. **Why Socket.io for Real-time Notifications?**

**Problem:** How does client know file finished processing?

**Options:**
```
A) Polling: Client asks every 1 second "Done yet?" ❌ Wastes bandwidth
B) Long-polling: Client waits, server holds connection ⚠️ Resource intensive
C) WebSocket: Server pushes when done ✅ Efficient, real-time
```

**Implementation:**
```javascript
// BullMQ Job completes
completeJob(fileId, metadata) {
  // Emit to connected user
  io.to(socketId).emit('FILE_COMPLETED', {
    fileId,
    metadata,
    timestamp: Date.now()
  });
}

// Client receives instantly
socket.on('FILE_COMPLETED', (data) => {
  updateUI(data);  // Update without refreshing page
});
```

**Benefits:**
- ✅ Instant notifications (WebSocket latency ~50ms)
- ✅ Bidirectional (server ↔ client)
- ✅ Low overhead (persistent connection)
- ✅ Natural for file upload progress

---

#### 6. **Why Magic Bytes + MIME Validation?**

**Security Problem:** What if attacker uploads .exe as .jpg?
```javascript
// ❌ Trusting client MIME type
const mimeType = req.file.mimetype;  // Could be anything

// Client sends:
file.jpg (but actually contains: MZ...EXE header)
```

**Solution: Verify file contents**
```javascript
const magic = detectMimeFromMagicBytes(filePath);
// Read first 8 bytes
// JPEG: FFD8FF
// PNG:  89504E47
// ZIP:  504B0304

if (declaredMime !== detectedMime) {
  // REJECT — file is disguised
  fs.unlinkSync(filePath);
  await updateFile(fileId, { status: "rejected" });
}
```

**Prevents:**
- ✅ Executable disguised as image
- ✅ Malicious archives with misleading extension
- ✅ MIME-type based attacks

---

## STEP 5: LIMITATIONS & PROBLEMS

### 5.1 Critical Issues

#### Issue #1: Race Condition in Multiple File Uploads

**Problem:**
```javascript
// User uploads 5 files simultaneously
Promise.all([
  uploadFile(file1),  // Updates quota
  uploadFile(file2),  // Updates quota
  uploadFile(file3),  // Updates quota
  uploadFile(file4),  // Updates quota
  uploadFile(file5)   // Updates quota
]);
```

**Current Code:**
```javascript
async uploadMultipleFiles(files, userId, folderId = null) {
  const uploadedFiles = [];
  const failedFiles = [];

  for (const file of files) {  // ← SEQUENTIAL
    try {
      const uploaded = await this.uploadFile(...);
      uploadedFiles.push(uploaded);
    } catch (error) {
      failedFiles.push(...);
    }
  }
}
```

**Problem:** Sequential loop means if quota is 100MB and user uploads 5x 30MB files:
1. File 1: 30MB (30% used) ✅
2. File 2: 30MB (60% used) ✅
3. File 3: 30MB (90% used) ✅
4. File 4: 30MB (120% used) ✅ SHOULD FAIL!
5. File 5: FAILS

**But with parallel:** All 5 hit quota check simultaneously → possibilities of exceeding quota

**Fix:**
```javascript
async uploadMultipleFiles(files, userId, folderId = null) {
  const uploadedFiles = [];
  const failedFiles = [];
  
  // Sequential ensures quota check isn't bypassed
  // Already implemented correctly ✅
}
```

**Current code IS correct** (sequential loop), but should be documented.

---

#### Issue #2: MinIO Migration Bug

**Current Code (folders.service.js):**
```javascript
for (const fid of allFolderIds) {
  const files = await filesRepository.findByOwner(ownerId, fid);

  for (const file of files) {
    // ❌ WRONG: Assumes files are on disk
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
  }
}
```

**Problem:** Files are stored in MinIO, NOT on local disk!
```javascript
// Files are stored here:
objectKey: "userId/uuid-filename.ext"  // ← MinIO

// Not here:
path: "uploads/123/file.ext"  // ← DISK (doesn't exist)
```

**Symptom:** Folder deletion succeeds but doesn't actually delete files from MinIO → disk bloat

**Fix:**
```javascript
for (const file of files) {
  // Delete from MinIO
  if (file.objectKey) {
    await deleteFromMinio(file.objectKey);
  }
  
  // Also delete thumbnail if exists
  if (file.thumbnailKey) {
    await deleteFromMinio(file.thumbnailKey);
  }
  
  // Then delete from DB
  await filesRepository.deleteFile(file._id);
}
```

---

#### Issue #3: BullMQ Job Requires Disk Path But Files in MinIO

**Current Code (files.service.js):**
```javascript
await addFileProcessingJob({
  fileId: file._id.toString(),
  objectKey: file.objectKey,  // ← objectKey passed
  mimeType: file.mimeType,
  userId: userId.toString(),
});
```

**Current Code (fileProcessor.job.js):**
```javascript
const fileProcessorWorker = new Worker(..., async (job) => {
  const { fileId, filePath, mimeType, userId } = job.data;
  // ← Expecting filePath but received objectKey!
  
  if (!fs.existsSync(filePath)) {  // ← Will ALWAYS fail
    throw new Error(`File not found on disk: ${filePath}`);
  }
});
```

**Problem:** Code mismatch!
- Passing: `objectKey`
- Expecting: `filePath`

**Result:** **All file processing jobs FAIL!**

**Symptom:** Users upload files, but `processingStatus` stuck at "pending"

**Fix:**
```javascript
// In fileProcessor.job.js, use MinIO API to download:
const { getObjectStream } = require("minio.provider");

const downloadedPath = await downloadFromMinio(objectKey);
const magic = detectMimeFromMagicBytes(downloadedPath);
// Process...
fs.unlinkSync(downloadedPath);  // Cleanup temp file
```

---

#### Issue #4: Quota Not Updated on File Delete

**Current Code:**
```javascript
async deleteFile(fileId, userId) {
  const file = await filesRepository.findById(fileId);
  
  await deleteFromMinio(file.objectKey);
  
  // Storage quota update
  const fileSizeMB = file.size / (1024 * 1024);
  await authRepository.updateUser(
    { _id: userId },
    { $inc: { storageUsedMB: -fileSizeMB } }
  );
  
  await filesRepository.deleteFile(fileId);
}
```

**Looks correct**, but what if MinIO delete fails but DB delete succeeds?

```javascript
await deleteFromMinio(file.objectKey);  // ← FAILS
// File still in MinIO but DB record deleted
// User sees file deleted but it's still taking storage
// Quota won't be decremented
```

**Fix:**
```javascript
async deleteFile(fileId, userId) {
  const file = await filesRepository.findById(fileId);
  
  try {
    // Try to delete from MinIO first
    await deleteFromMinio(file.objectKey);
    if (file.thumbnailKey) {
      await deleteFromMinio(file.thumbnailKey);
    }
  } catch (error) {
    logger.error(`MinIO delete failed: ${error.message}`);
    // Don't throw — continue to DB cleanup
  }
  
  // Update quota
  const fileSizeMB = file.size / (1024 * 1024);
  await authRepository.updateUser(
    { _id: userId },
    { $inc: { storageUsedMB: -fileSizeMB } }
  );
  
  // Delete DB record
  await filesRepository.deleteFile(fileId);
}
```

---

### 5.2 Scalability Issues

#### Issue #5: N+1 Query Problem

**Current Code (folders.service.js):**
```javascript
async deleteFolder(folderId, ownerId) {
  const allFolderIds = [];
  const queue = [folderId];
  
  while (queue.length > 0) {
    const currentId = queue.shift();
    allFolderIds.push(currentId);
    
    // ⚠️ Database query for EACH folder!
    const children = await foldersRepository.findByParentId(currentId);
    for (const child of children) {
      queue.push(child._id);
    }
  }
  
  for (const fid of allFolderIds) {
    // ⚠️ Another database query for EACH folder!
    const files = await filesRepository.findByOwner(ownerId, fid);
  }
}
```

**Problem:** If user has 10,000 nested folders:
- Query count: ~10,000+ database calls
- Time: Could take several minutes
- Blocks entire deletion

**Fix:**
```javascript
// Batch query all children at once
const allFolders = await foldersRepository.findByOwnerRecursive(ownerId, folderId);
const allFiles = await filesRepository.findByOwnerMultipleFolders(ownerId, folderIds);

// Process in batches
await deleteFromMinioParallel(files);
```

---

#### Issue #6: List Files Pagination Missing

**Current Code:**
```javascript
async listFiles(userId, folderId = null) {
  const files = await filesRepository.findByOwner(userId, folderId);
  return files;  // ← Could be 100,000 files!
}
```

**Problem:** Returns ALL files in memory
- User with 100k files → 100MB JSON response
- API timeout
- Client browser crashes

**Fix:**
```javascript
async listFiles(userId, folderId = null, page = 1, limit = 50) {
  const skip = (page - 1) * limit;
  const files = await filesRepository
    .findByOwner(userId, folderId)
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 });
  
  const total = await filesRepository.count(userId, folderId);
  
  return {
    files,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
}
```

---

#### Issue #7: Search Without Indexes

**Current Code:**
```javascript
async searchFiles(userId, query) {
  const files = await filesRepository.searchFiles(userId, query.trim());
  return files;
}
```

**Problem:** Without indexes, search is O(n) — slow at scale

**Fix:**
```javascript
// Add text indexes to MongoDB
fileSchema.index({ originalName: "text", metadata: "text" });

// Use text search
async searchFiles(userId, query) {
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

### 5.3 Concurrency Issues

#### Issue #8: Concurrent File Rename/Move Race Condition

**Problem:**
```
T1: Move file to folder A
T2: Rename file (simultaneously)
T3: Delete file (simultaneously)

Result: Inconsistent state ❌
```

**Fix:** Use optimistic locking
```javascript
async moveFile(fileId, targetFolderId, ownerId, version) {
  const updated = await File.findOneAndUpdate(
    { _id: fileId, __v: version },  // Optimistic lock
    { folderId: targetFolderId, $inc: { __v: 1 } },
    { new: true }
  );
  
  if (!updated) {
    throw new ConflictError("File was modified by another operation");
  }
}
```

---

#### Issue #9: Presigned URL Generation Expensive

**Current Code:**
```javascript
async downloadFile(fileId, userId) {
  const file = await filesRepository.findById(fileId);
  
  // Generates NEW presigned URL every time
  const presignedUrl = await getPresignedUrl(file.objectKey, 3600);
  
  return { file, presignedUrl };
}
```

**Problem:** Creating presigned URLs is CPU-intensive
- 1000 concurrent downloads = 1000 URL generations
- MinIO CPU spikes

**Fix:** Cache presigned URLs in Redis
```javascript
async downloadFile(fileId, userId) {
  const cacheKey = `presigned:${fileId}`;
  let presignedUrl = await redis.get(cacheKey);
  
  if (!presignedUrl) {
    presignedUrl = await getPresignedUrl(file.objectKey, 3600);
    // Cache for 1 hour (5 min before expiry)
    await redis.set(cacheKey, presignedUrl, "EX", 3300);
  }
  
  return { file, presignedUrl };
}
```

---

### 5.4 Security Issues

#### Issue #10: No Rate Limiting on File Downloads

**Current Code:**
```javascript
app.use(globalLimiter);  // 100 req/min

// But large files can be downloaded multiple times in 1 second
GET /api/v1/files/{fileId}  // 10KB/s = 100KB in 10 seconds
GET /api/v1/files/{fileId}  // Different fileId = Not rate limited!
```

**Problem:** Attacker can DOS server:
```bash
for i in {1..1000}; do
  curl http://server/api/v1/files/{fileId}  # 1000 downloads in 10 seconds
done
```

**Fix:**
```javascript
const downloadLimiter = createLimiter({
  windowMs: 60 * 1000,        // 1 minute
  max: 20,                     // Max 20 downloads per minute
  keyPrefix: "rl:download:",
  skip: (req, res) => {
    // Skip if admin
    return req.user.role === "admin";
  }
});

app.get("/api/v1/files/:fileId", downloadLimiter, filesController.downloadFile);
```

---

#### Issue #11: No Virus Scanning

**Current Code:**
```javascript
const magic = detectMimeFromMagicBytes(filePath);
if (declaredMime !== detectedMime) {
  reject();  // Only checks filename mismatch
}
```

**Problem:** Doesn't detect actual malware
- File with correct JPEG header but contains virus
- Magic bytes check passes → File accepted ❌

**Fix:** Integrate ClamAV
```javascript
const clamd = require("clamav.js");

async checkMalware(filePath) {
  const result = await clamd.scanFile(filePath);
  if (result.isInfected) {
    fs.unlinkSync(filePath);
    throw new BadRequestError("File contains malware");
  }
}
```

---

#### Issue #12: Share Tokens Not Validated

**Current Code:**
```javascript
async downloadSharedFile(shareToken) {
  const file = await filesRepository.findByShareToken(shareToken);
  
  if (file.shareExpiresAt && new Date() > file.shareExpiresAt) {
    throw new BadRequestError("Share link has expired");
  }
  
  const presignedUrl = await getPresignedUrl(file.objectKey, 3600);
  return { file, presignedUrl };
}
```

**Problem:** Share tokens are UUIDs (128-bit, ~2^128 combinations)
- Theoretically brute-proof
- But what if token leaked?
- **No expiry enforcement in middleware**

**Improved:**
```javascript
// Add rate limiting on share downloads
const shareDownloadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 hour
  max: 100,                   // 100 downloads per hour per token
  keyGenerator: (req) => req.params.shareToken,
  skip: (req, res) => {
    // Disable for large-volume shares
    return false;
  }
});

app.get(
  "/api/v1/files/shared/:shareToken",
  shareDownloadLimiter,
  filesController.downloadSharedFile
);
```

---

## STEP 6: IMPROVEMENTS & BETTER APPROACHES

### 6.1 Performance Optimizations

#### Optimization #1: Streaming Large Files

**Current:** Redirect to MinIO presigned URL
**Better:** Stream directly from MinIO through server

Why? Presigned URL expiry might occur during large file download

```javascript
app.get("/api/v1/files/:fileId/stream", authenticate, async (req, res) => {
  const { fileId } = req.params;
  const file = await filesRepository.findById(fileId);
  
  // Check permission
  if (file.owner.toString() !== req.user.id.toString()) {
    throw new ForbiddenError("Unauthorized");
  }
  
  // Stream directly
  const stream = await minioClient.getObject(MINIO_BUCKET, file.objectKey);
  
  res.setHeader("Content-Type", file.mimeType);
  res.setHeader("Content-Disposition", `attachment; filename="${file.originalName}"`);
  res.setHeader("Content-Length", file.size);
  
  stream.pipe(res);
  
  stream.on("error", (err) => {
    logger.error(`Stream error: ${err.message}`);
    res.status(500).end();
  });
});
```

**Trade-off:**
- ✅ Supports large files, resumable downloads
- ❌ Server bandwidth used, can't scale as well
- ❌ Connection pooling complexity

---

#### Optimization #2: Image Optimization Pipeline

**Current:** Just storage + retrieval
**Better:** Auto-generate thumbnails + multiple resolutions

```javascript
// In thumbnail.job.js
const fileProcessorWorker = new Worker(QUEUE_NAMES.THUMBNAIL, async (job) => {
  const { fileId, objectKey, mimeType, userId } = job.data;
  
  if (!mimeType.startsWith("image/")) return;
  
  try {
    // Download from MinIO
    const stream = await minioClient.getObject(MINIO_BUCKET, objectKey);
    
    // Generate thumbnails using Sharp
    const sizes = { sm: 100, md: 300, lg: 800 };
    
    for (const [label, size] of Object.entries(sizes)) {
      const buffer = await sharp(stream)
        .resize(size, size, { fit: "cover" })
        .webp({ quality: 80 })
        .toBuffer();
      
      const thumbnailKey = `${objectKey.split('/')[0]}/thumbnails/${fileId}-${label}.webp`;
      await minioClient.putObject(MINIO_BUCKET, thumbnailKey, buffer);
      
      // Save thumbnail reference
      if (label === "sm") {
        await filesRepository.updateFile(fileId, {
          thumbnailKey
        });
      }
    }
    
    emitToUser(userId, SOCKET_EVENTS.THUMBNAILS_READY, { fileId });
  } catch (error) {
    logger.error(`Thumbnail generation failed: ${error.message}`);
  }
});
```

**Benefits:**
- ✅ Instant thumbnail display
- ✅ Responsive images (multiple resolutions)
- ✅ Better lazy loading
- ✅ Reduces client-side processing

---

#### Optimization #3: Batch Operations

**Current:**
```javascript
for (const file of files) {
  await deleteFromMinio(file.objectKey);           // 1 request per file
  await filesRepository.deleteFile(file._id);      // 1 request per file
}
```

**Better:**
```javascript
// Batch MinIO deletions
const objectsToDelete = files.map(f => ({ name: f.objectKey }));
await minioClient.removeObjects(MINIO_BUCKET, objectsToDelete);

// Batch DB deletions
const fileIds = files.map(f => f._id);
await filesRepository.deleteMany(fileIds);
```

**Impact:**
- Before: 1000 files = 2000 network round-trips
- After: 1000 files = 2 network round-trips
- **Speed: ~1000x faster**

---

### 6.2 Architecture Improvements for Scale

#### Scale #1: Add CDN for Presigned URLs

**Current Architecture:**
```
Client → MinIO → Stream/Download
```

**Better Architecture (with CloudFront/CDN):**
```
Client → CloudFront CDN (cached) → MinIO
            ↓
        (If cache hit)
        Return cached + ETag
```

**Implementation:**
```javascript
// CloudFront presigned URL instead of MinIO
const cloudFrontUrl = await generateCloudFrontPresignedUrl(objectKey);
```

**Benefits:**
- ✅ Geographic distribution (faster for users)
- ✅ Automatic caching
- ✅ Reduces MinIO bandwidth
- ✅ DDoS protection

---

#### Scale #2: Add Message Queue for Notifications

**Current:**
```
BullMQ Job → Socket.io directly to user
```

**Better:**
```
BullMQ Job → Message Queue (RabbitMQ/Kafka) → Notification Service → Socket.io
```

**Why?**
- Decouples job processing from notifications
- Retries if Socket.io fails
- Can have multiple notification services
- Audit trail of all events

---

#### Scale #3: Database Sharding by User

**Current:**
```
Single MongoDB
  └─ All users
```

**Better:**
```
MongoDB Cluster (Sharded by userId)
  ├─ Shard 1: userId hash 0-N
  ├─ Shard 2: userId hash N-2N
  └─ Shard 3: userId hash 2N-3N
```

**Benefits:**
- ✅ Scales to unlimited users
- ✅ Hot users don't affect cold users
- ✅ Regional sharding possible

---

#### Scale #4: Read Replicas for Search

**Current:**
```
Single MongoDB (all reads + writes)
```

**Better:**
```
Primary MongoDB → Replication → Read Replicas
(writes)           (background)    (search queries)
```

**Implementation:**
```javascript
// Write queries to primary
await db.primary.updateUser(...);

// Read queries to replica
const user = await db.replica.findById(userId);
const files = await db.replica.searchFiles(...);
```

**Benefits:**
- ✅ Search doesn't affect write performance
- ✅ Failover support
- ✅ Geographic replication

---

### 6.3 Reliability Improvements

#### Reliability #1: Circuit Breaker Pattern

**Current:** If MinIO down, delete fails instantly

**Better:** Graceful degradation
```javascript
const minioCircuitBreaker = new CircuitBreaker(
  async (objectKey) => deleteFromMinio(objectKey),
  {
    timeout: 5000,        // Fail fast
    errorThresholdPercentage: 50,
    resetTimeout: 30000   // Try again after 30s
  }
);

minioCircuitBreaker.on("open", () => {
  logger.warn("[Circuit Breaker] MinIO is down, queuing deletions");
  // Queue deletion for later
});
```

---

#### Reliability #2: Distributed Transaction (2-Phase Commit)

**Current Problem:** What if MinIO delete succeeds but DB update fails?
```
Step 1: Delete from MinIO ✅
Step 2: Update DB ❌ (network error)
Result: File deleted but DB thinks it exists
```

**Better: Saga Pattern**
```javascript
async deleteFile(fileId) {
  try {
    // Step 1: Prepare
    const file = await filesRepository.findById(fileId);
    
    // Step 2: Execute
    await deleteFromMinio(file.objectKey);
    await filesRepository.updateFile(fileId, { status: "deleted" });
    await updateQuota(file.owner, -file.size);
    
    // Step 3: Commit
    await filesRepository.hardDeleteFile(fileId);
  } catch (error) {
    // Compensate - undo all operations
    await recoverFile(fileId);
  }
}
```

---

## STEP 7: WHY OUR SOLUTION VS OTHERS

### Comparison with Alternatives

#### Our Solution: MinIO + BullMQ + MongoDB

**vs. Alternative #1: FTP Server (vsftpd)**
```
Our Solution:
✅ Multi-user access
✅ REST API (web-based)
✅ Real-time notifications
✅ Permission system
✅ Sharea links with expiry
✅ Quota management
✅ Security (JWT, encryption)
❌ Requires application code

FTP:
❌ Legacy protocol
❌ No real-time notifications
❌ Limited permission control
❌ No built-in quota
✅ Simple, battle-tested
✅ Many clients support it
```

**Trade-off: Complexity vs Features**

---

#### Our Solution: MinIO for Storage

**vs. Alternative #2: Local Disk Storage**

```
Local Disk:
✅ Simple
✅ No external dependency
❌ Single point of failure
❌ Hard to scale
❌ No redundancy
❌ Can't share storage across servers

MinIO:
✅ Redundancy
✅ Scales horizontally
✅ API access from anywhere
✅ Built-in lifecycle policies
❌ Additional infrastructure
❌ Network latency
```

**Trade-off: Simplicity vs Reliability**

---

#### Our Solution: JWT Tokens + Redis Blacklist

**vs. Alternative #3: Sessions (Express Session)**

```
Sessions:
✅ Automatic expiry
✅ Revocation instant
❌ Server-side storage
❌ Hard to scale (sticky sessions)
❌ Lost on server reboot

JWT + Blacklist:
✅ Stateless (scalable)
✅ Can verify without server state
✅ Works with multiple servers
✅ Can embed claims (role, permissions)
❌ Can't revoke instantly (need blacklist)
❌ More complex
```

**Trade-off: Scalability vs Simplicity**

---

#### Our Solution: BullMQ for Async Jobs

**vs. Alternative #4: Cron Jobs**

```
BullMQ:
✅ Triggered immediately (event-driven)
✅ Automatic retries
✅ Persistent (survives restart)
✅ Progress tracking
✅ Built-in queue management  
❌ Redis dependency

Cron:
✅ Simple, no dependencies
❌ Fixed scheduling only
❌ Can't process on-demand
❌ No retries
❌ Hard to scale
```

**Trade-off: Flexibility vs Simplicity**

---

#### Our Solution: Socket.io WebSocket

**vs. Alternative #5: HTTP Long-Polling**

```
Socket.io:
✅ Real-time (< 500ms latency)
✅ Bidirectional
✅ Lower bandwidth
✅ Natural for notifications
❌ Requires persistent connection
❌ NAT/Firewall issues sometimes

Long-Polling:
✅ Works everywhere (HTTP only)
❌ Higher latency
❌ Higher bandwidth
❌ More CPU
❌ Not truly real-time
```

**Trade-off: Responsiveness vs Compatibility**

---

## STEP 8: INTERVIEW REVISION NOTES

### KEY CONCEPTS (IMPORTANT ⭐)

#### 1. **Atomic Operations in Distributed Systems**
```javascript
// Problem: Race condition in quota
// Solution: Atomic MongoDB update with $expr
const updatedUser = await User.findOneAndUpdate(
  {
    _id: userId,
    $expr: { $lte: [{ $add: ["$storageUsedMB", fileSizeMB] }, "$storageQuotaMB"] }
  },
  { $inc: { storageUsedMB: fileSizeMB } }
);

// Key Insight: Read condition + write happens instantly in one operation
// Database guarantees atomicity — no race condition possible
```

**Interview Question:** "How would you handle concurrent uploads without quota being exceeded?"

---

#### 2. **Presigned URLs (Stateless Authorization)**

```javascript
// Instead of: Server handles download
GET /api/files/123 → Stream from server

// Use: Temporary direct access
GET /api/files/123 → Get presigned URL → Browser direct access to MinIO
// Benefits:
// - Server doesn't use bandwidth
// - Can serve 1000 concurrent downloads with tiny server
// - Stateless (scalable horizontally)
```

**Interview Question:** "How do you design a file download system that scales to 10k concurrent users?"

---

#### 3. **Two-Token Strategy (JWT Best Practice)**

```
Access Token (15 min):  Used for every request, short-lived
Refresh Token (7 days): Stored securely, used to get new access token

Benefits:
- Balance: Can't be too short (UX) or too long (security)
- Revocation: Delete from Redis = instant logout
- Layer: Separate tokens for separate concerns
```

**Interview Question:** "Compare session-based vs token-based authentication. When would you use each?"

---

#### 4. **Idempotent Job Processing**

```javascript
// Problem: What if job processed twice?
// Solution: Idempotent JobId

await fileProcessingQueue.add("process-file", payload, {
  jobId: `file-${payload.fileId}`  // Unique, consistent
  // If same job added twice, only processed once
});

// Idempotent = Processing twice = Processing once
// Safe for retry scenarios
```

**Interview Question:** "How would you handle duplicate job processing in a queue system?"

---

#### 5. **Database Sharding for Scale**

```
Single MongoDB:
- 1M files: Query takes 100ms
- 10M files: Query takes 1000ms
- 100M files: BREAKS

Sharded MongoDB (by userId):
- Shard 1: 1-10M files
- Shard 2: 10-20M files
- Shard 3: 20-30M files

Each shard independent:
- All queries still 100ms
- Add more shards = handle more files
```

**Interview Question:** "How would you scale MongoDB to handle 1 billion files?"

---

### ARCHITECTURE PATTERNS

#### Pattern #1: Service Layer
```
Controller → Service → Repository → Database
     ↓          ↓            ↓
  Validate    Business     Raw DB
  Request     Logic        Access
```

**Your Code:** ✅ Follows this correctly

---

#### Pattern #2: Error Handling Classification
```
Operational Errors:
- Invalid email
- Quota exceeded
- File not found
→ Return with HTTP status

Unhandled Errors:
- Database connection failed
- Unknown exception
→ Log, return 500
```

**Your Code:** ✅ Implements this with custom error classes

---

#### Pattern #3: Rate Limiting
```
Endpoint:     /auth/login
Limiter:      10 requests per 15 min per IP
Storage:      Redis (fast, distributed)
Behavior:     Return 429 if exceeded
```

**Your Code:** ✅ Implements with redis-based store

---

### TRADEOFFS EXPLAINED

| Decision | Pro | Con | When to Use |
|----------|-----|-----|-------------|
| **MinIO** | Scalable, redundant | Network latency | 1000+ concurrent users |
| **Local Disk** | Simple, fast | Single point of failure | Single-server small app |
| **JWT** | Stateless, scalable | Complex revocation | Microservices, mobile |
| **Sessions** | Simple revocation | Doesn't scale | Single server app |
| **Socket.io** | Real-time | Connection overhead | Live notifications needed |
| **HTTP Polling** | Works everywhere | High latency | Simple apps, compatibility |
| **BullMQ** | Reliable, retries | Redis dependency | Long-running tasks |
| **Cron** | Simple | Fixed schedule only | Scheduled tasks |

---

### COMMON INTERVIEW QUESTIONS & ANSWERS

**Q1: "How would you handle a 1GB file upload?"**

A: "Stream-based approach:
- Multer streams to disk (not buffered)
- MinIO streams from disk (not buffered)
- Memory usage stays constant ~10MB
- Presigned URL for download (no server bandwidth)"

---

**Q2: "What if MinIO server goes down?"**

A: "
- Files not accessible (HTTP 503)
- Uploads fail (add to retry queue)
- New uploads rejected (graceful error message)

Mitigation:
- MinIO cluster (3 nodes minimum)
- Replication across regions
- Circuit breaker to fail fast
- Queue for offline-first architecture"

---

**Q3: "How do you prevent storage quota abuse?"**

A: "Two layers:
1. Database-level: Atomic check + increment in one operation (prevents race condition)
2. Application-level: Check before upload starts

Why atomic? Prevents 5 parallel uploads from bypassing 100MB quota."

---

**Q4: "Design folder deletion for 1 million files inside."**

A: "BFS with batching:
- Find all nested folders (BFS queue)
- Batch query files (1000 at a time)
- Batch delete from MinIO (parallel)
- Batch delete from MongoDB (parallel)
- Update quota once

Why? N+1 query avoided. 1M files = few batches, not 1M queries."

---

**Q5: "How would you implement real-time file progress?"**

A: "Socket.io with events:
- Upload starts → emit UPLOAD_START
- Multer progress → emit UPLOAD_PROGRESS (every 5%)
- MinIO upload done → emit UPLOAD_COMPLETE
- Client receives → update progress bar

Why Socket.io? Bidirectional, real-time, low latency."

---

### ARCHITECTURE DECISION FRAMEWORK

When designing systems, think about:

1. **Scale:** How many users? files? data?
   - 100 users  → Simple, local storage OK
   - 100k users → Need MinIO, distributed
   - 1M+ users  → Need everything: CDN, sharding, replicas

2. **Reliability:** What's SLA?
   - 99% (2.88 hours downtime/month) vs 99.9% (43 minutes)
   - Affects: Replication, redundancy, backups

3. **Latency:** How fast needed?
   - < 100ms → CDN, caching
   - < 1s → Database indexes, batching
   - < 10s → Async jobs OK

4. **Complexity:** How much code?
   - Every service added = maintenance cost
   - Start simple, add when needed

---

### QUICK REVISION SUMMARY

**Problem:** Build a scalable, multi-user file server

**Architecture:**
```
Express (API) → MongoDB (metadata) + MinIO (files) + Redis (cache + tokens)
     ↓
BullMQ (async) → Workers (processing) → Socket.io (notifications)
```

**Key Decisions:**
- ✅ MinIO: Scales, redundant, presigned URLs
- ✅ JWT + Redis blacklist: Stateless, revocable
- ✅ BullMQ: Reliable job processing with retries
- ✅ Atomic Quota: Prevents race conditions
- ✅ Socket.io: Real-time notifications
- ✅ Magic Bytes: Security, MIME validation

**Challenges:**
- Race conditions (solved: atomic operations)
- N+1 queries (solved: batch operations)
- Job failures (solved: automatic retries)
- Concurrency (solved: optimistic locking)

**Scale Path:**
```
1K users   → Current system works
100K users → Add Redis replicas, database indexes
1M users   → Add MinIO cluster, database sharding, CDN
10M users  → Add micro-services, message queue
```

---

## Interview Q&A - LIGHTNING ROUND

**Q: "Three-sentence explanation of the system?"**
A: "Multi-user file server with JWT authentication and role-based access control. Files stored in MinIO with metadata in MongoDB. Async job queue (BullMQ) processes files, real-time Socket.io notifications keep clients updated."

**Q: "What's the hardest part?"**
A: "Race conditions in quota management and N+1 queries in folder operations. Solved with atomic MongoDB operations and batch processing."

**Q: "What would you change?"**
A: "Add presigned URL caching in Redis, implement page-based file listing, and batch MinIO operations for better scale."

**Q: "How many concurrent users?"**
A: "Current: ~1K. To scale: CDN for downloads, database replicas for reads, MinIO cluster for redundancy. At 10k users: need microservices."

**Q: "How would you test this?"**
A: "Unit tests for services, integration tests with test MongoDB/MinIO, load testing with 1000 concurrent uploads, chaos testing (server crashes)."

---

## KEY TAKEAWAYS FOR INTERVIEWS

1. **Atomic Operations** = Solutions to race conditions
2. **Presigned URLs** = Stateless, scalable downloads
3. **JWT + Refresh** = Balance security and UX
4. **Batch Operations** = Solve N+1 query problems
5. **Base64 Detection** = Simple security improvements
6. **Async Processing** = Don't block API with long tasks
7. **Real-time Updates** = WebSocket for notifications
8. **Horizontal Scaling** = Stateless services + sharded databases

---

End of Interview Analysis Document
