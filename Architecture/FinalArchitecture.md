# 🌊 Complete Request Flow — Tera Project

## 📍 Entry Point
Client (Browser/Postman)
        ↓
server.js
  - connectDB() → MongoDB Atlas
  - connectRedis() → Redis
  - app.listen(5000)
        ↓
app.js
  - Helmet (security headers)
  - CORS
  - Morgan (logging)
  - express.json()
  - Rate Limiter (Redis)
  - Routes register
  - Error Middleware

## 1️⃣ AUTH FLOW
Register
POST /api/v1/auth/register
        ↓
auth.middleware.js → (public route, skip)
        ↓
auth.routes.js → auth.controller.js → register()
        ↓
auth.service.js
  - email already exists? → throw BadRequestError
  - bcrypt.hash(password, 12)
  - authRepository.createUser()
        ↓
auth.repository.js
  - User.create({ name, email, hashedPassword, role:'user' })
        ↓
MongoDB → users collection
        ↓
Response: { user: { id, name, email, role } }
Login
POST /api/v1/auth/login
        ↓
auth.service.js → login()
  - authRepository.findByEmail(email)
  - user.comparePassword(password) → bcrypt.compare()
  - generate accessToken (JWT, 15min, JWT_ACCESS_SECRET)
  - generate refreshToken (JWT, 7days, JWT_REFRESH_SECRET)
  - Redis: SET refresh:{userId} refreshToken EX 604800
  - authRepository.updateLastLogin(userId)
        ↓
Response: { accessToken, refreshToken, user }
Refresh Token
POST /api/v1/auth/refresh
        ↓
auth.service.js → refreshToken()
  - jwt.verify(refreshToken, JWT_REFRESH_SECRET)
  - Redis: GET refresh:{userId} → match karo
  - Redis: DEL refresh:{userId} (purana delete)
  - naya accessToken generate
  - naya refreshToken generate
  - Redis: SET refresh:{userId} newRefreshToken EX 604800
        ↓
Response: { accessToken, refreshToken }
Protected Route — Auth Middleware
GET /api/v1/auth/me
        ↓
auth.middleware.js
  - Authorization: Bearer <token> header check
  - jwt.verify(token, JWT_ACCESS_SECRET)
  - req.user = { userId, role }
        ↓
auth.controller.js → getMe()
  - authRepository.findById(req.user.userId)
        ↓
Response: { user }
Logout
POST /api/v1/auth/logout
        ↓
auth.middleware.js → verify JWT
        ↓
auth.service.js → logout()
  - Redis: DEL refresh:{userId}
        ↓
Response: { message: 'Logged out successfully' }

2️⃣ FILE UPLOAD FLOW — Most Complex 🔥
POST /api/v1/files/upload
        ↓
── MIDDLEWARE CHAIN ──
        ↓
auth.middleware.js
  - JWT verify → req.user set
        ↓
upload.middleware.js (Multer)
  - multipart/form-data parse
  - file.size > MAX_FILE_SIZE? → reject
  - file stored temporarily (memory/disk)
        ↓
── CONTROLLER ──
files.controller.js → uploadFile()
        ↓
── SERVICE ──
files.service.js → uploadFile()

  STEP 1: Quota Check
  - authRepository.findById(userId)
  - user.storageUsedMB + fileSizeMB > user.storageQuotaMB?
  - → throw BadRequestError('Storage quota exceeded')

  STEP 2: MIME Validation
  - file.mimetype check (declared)
  - magic bytes check (actual)
  - mismatch? → reject file

  STEP 3: Generate Object Key
  - objectKey = uploads/{userId}/{uuid}-{filename}

  STEP 4: Upload to MinIO
  - minioClient.putObject(BUCKET, objectKey, fileStream)
  - file physically stored in MinIO

  STEP 5: Save Metadata to MongoDB
  - filesRepository.createFile({
      originalName, objectKey, mimeType,
      size, owner: userId, folderId,
      processingStatus: 'pending'
    })

  STEP 6: Update User Quota
  - authRepository.updateUser(userId, {
      $inc: { storageUsedMB: fileSizeMB }
    })

  STEP 7: Enqueue BullMQ Job 🔥
  - uploadQueue.add('file:process', {
      fileId, objectKey, mimeType, userId
    })
        ↓
Response: { file: { id, name, size, status:'pending' } }

3️⃣ BULLMQ ASYNC PROCESSING FLOW 🔥
── QUEUE ──
BullMQ Queue: 'file-processing'
Job added: { fileId, objectKey, mimeType, userId }
        ↓
── WORKER (background process) ──
fileProcessor.job.js

  STEP 1: Download from MinIO to temp
  - minioClient.getObject(BUCKET, objectKey)
  - save to /tmp/{fileId}-{timestamp}

  STEP 2: Magic Bytes Check
  - read first 8 bytes of file
  - detect actual MIME type
  - declared vs actual match?
  - mismatch → processingStatus: 'rejected'

  STEP 3: Extract Metadata
  - file size, extension, lastModified

  STEP 4: Update MongoDB
  - filesRepository.updateFile(fileId, {
      processingStatus: 'completed',
      metadata: { detectedMime, extension, sizeBytes }
    })

  STEP 5: Cleanup temp file
  - fs.unlinkSync(tempPath)

  STEP 6: Emit WebSocket Event 🔥
  - emitToUser(userId, 'file:completed', { fileId, metadata })
  OR
  - emitToUser(userId, 'file:rejected', { fileId, reason })
        ↓
Job: COMPLETED ✅ or FAILED ❌

4️⃣ SOCKET.IO REAL-TIME NOTIFICATION FLOW 🔥
── CONNECTION ──
Client connects: io('http://localhost:5000')
        ↓
notifications.gateway.js
  - io.on('connection', (socket) => {
      socket.on('join', (userId) => {
        socket.join(`user:${userId}`) // Room join
      })
    })

── DURING UPLOAD ──
Client joins room with userId
        ↓
BullMQ Worker completes job
        ↓
emitToUser(userId, event, data)
  - io.to(`user:${userId}`).emit(event, data)
        ↓
Client receives real-time update:
  'file:completed' → UI update karo
  'file:rejected'  → Error show karo
  'upload:progress' → Progress bar update

5️⃣ FILE DOWNLOAD FLOW
GET /api/v1/files/download/:fileId
        ↓
auth.middleware.js → JWT verify
        ↓
files.service.js → downloadFile()

  STEP 1: Find file metadata
  - filesRepository.findById(fileId)
  - file not found? → NotFoundError

  STEP 2: Permission check
  - file.owner === req.user.userId? → allow
  - file.isShared === true? → allow
  - else → ForbiddenError

  STEP 3: Generate Presigned URL
  - Redis check: GET presigned:{fileId}
  - Cache hit? → return cached URL
  - Cache miss?
    - minioClient.presignedGetObject(BUCKET, objectKey, 3600)
    - Redis: SET presigned:{fileId} url EX 3300

  STEP 4: Increment download count
  - filesRepository.incrementDownloadCount(fileId)
        ↓
Response: { presignedUrl, file }

6️⃣ FOLDER DELETE FLOW — Complex 🔥
DELETE /api/v1/folders/:folderId
        ↓
auth.middleware.js → JWT verify
        ↓
folders.service.js → deleteFolder()

  STEP 1: BFS Traversal
  - queue = [folderId]
  - while queue not empty:
    - currentId = queue.shift()
    - allFolderIds.push(currentId)
    - children = foldersRepository.findByParentId(currentId)
    - children forEach → queue.push(child._id)

  STEP 2: Get all files in all folders
  - files = filesRepository.findByMultipleFolders(allFolderIds)

  STEP 3: Delete from MinIO
  - minioClient.removeObjects(BUCKET, objectKeys)

  STEP 4: Update storage quota
  - totalFreedMB = sum of all file sizes
  - authRepository.updateUser(userId, {
      $inc: { storageUsedMB: -totalFreedMB }
    })

  STEP 5: Delete from MongoDB
  - filesRepository.deleteMany(fileIds)
  - foldersRepository.deleteManyFolders(allFolderIds)
        ↓
Response: { message: 'Folder deleted', freedMB }

7️⃣ ERROR FLOW — Har Jagah
Koi bhi error aaye
        ↓
throw new NotFoundError('message')
  OR
throw new BadRequestError('message')
  OR
throw new UnauthorizedError('message')
        ↓
Express catches → error.middleware.js
        ↓
Development:
  { status, message, stack }

Production:
  Operational error → { status, message }
  Unknown error → { status: 'error', message: 'Something went wrong' }

🗺️ Complete System Map
CLIENT
  ↓ HTTP Request
server.js → app.js
  ↓ Middleware (Helmet, CORS, RateLimit, Morgan)
  ↓ Auth Middleware (JWT verify)
  ↓ Router (/api/v1/*)
  ↓ Controller (req/res handle)
  ↓ Service (business logic)
  ↓ Repository (DB queries)
  ↓
  ├── MongoDB (metadata store)
  ├── Redis (sessions, cache, rate limit)
  └── MinIO (actual files)
       ↓
  BullMQ Queue (async jobs)
       ↓
  Worker (process file)
       ↓
  Socket.io (emit to client)
       ↓
CLIENT receives real-time update

















-------





Client → POST /upload
            ↓
Server file leta hai
            ↓
Server MIME check karta hai
            ↓
Server MinIO pe upload karta hai
            ↓
Server metadata MongoDB mein save karta hai
            ↓
Server virus scan karta hai (2-3 min)
            ↓
Server thumbnail banata hai (30 sec)
            ↓
Response: 200 OK ← Client yahan tak wait karta hai!!








------



BullMQ Ke Saath Kya Hota Hai
Client → POST /upload
            ↓
Server file leta hai
            ↓
MinIO pe upload (fast - 2-3 sec)
            ↓
MongoDB mein metadata save
  { processingStatus: 'pending' }
            ↓
BullMQ Queue mein job daalo 📥
            ↓
Response: 200 OK ← Client TURANT response pata hai!!

--- BACKGROUND MEIN (alag process) ---

BullMQ Worker job uthata hai
            ↓
MinIO se file download karta hai
            ↓
MIME check karta hai
            ↓
Metadata update karta hai
  { processingStatus: 'completed' }
            ↓
Socket.io se client ko notify karta hai 🔔

-----


PHASE 1 — Synchronous (turant hota hai)
Client → POST /upload
            ↓
Server file leta hai
            ↓
Basic MIME check (extension vs declared type)
Fast hai — 10ms
            ↓
MinIO pe upload ✅
            ↓
MongoDB mein save
{ processingStatus: 'pending' } ← Notice karo
            ↓
BullMQ mein job daalo
            ↓
Response: 200 OK ← 2-3 second mein

PHASE 2 — Async Background (baad mein hota hai)
Worker job uthata hai
            ↓
MinIO se file download (temp)
            ↓
Magic bytes se DEEP MIME check
            ↓
(Future) Virus scan
            ↓
processingStatus: 'completed' ya 'rejected'
            ↓
Socket.io → Client notify


---------
MinIO = Private bucket
            ↓
File directly accessible NAHI hai
            ↓
Sirf Presigned URL se access hota hai
            ↓
Presigned URL tabhi generate hoga jab:
processingStatus === 'completed'
            ↓
Matlab virus file kabhi download nahi ho sakti
jab tak scan complete na ho ✅


----
