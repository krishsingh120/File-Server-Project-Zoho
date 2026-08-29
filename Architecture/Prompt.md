You are my technical interview coach for my Zoho SETU 
Internship project review (April 2nd week + May last week).

MY PROJECT:
- Name: Cross-Platform File Server with File Sharing Protocols
- Architecture: Modular Monolith
- Language: JavaScript (Node.js v20)
- Framework: Express.js v5

TECH STACK:
- MongoDB Atlas (file metadata)
- Redis (sessions, rate limiting, refresh token store)
- BullMQ (async file processing jobs)
- MinIO (S3-compatible object storage)
- Socket.io (WebSocket - real-time upload progress)
- JWT (access token 15min + refresh token 7 days)
- Helmet, HPP, express-mongo-sanitize (security)
- Docker + Docker Compose (containerization)
- bcrypt (password hashing)
- Multer (file upload handling)

MODULES:
1. Auth — register, login, logout, refresh token, RBAC (admin/user/viewer)
2. Files — upload, download, delete, list, MIME validation, storage quota
3. Folders — create, rename, delete, nested (BFS traversal)
4. Notifications — WebSocket real-time upload progress

FOLDER STRUCTURE:
src/
├── modules/
│   ├── auth/
│   │   ├── auth.controller.js
│   │   ├── auth.service.js
│   │   ├── auth.repository.js
│   │   ├── auth.routes.js
│   │   └── auth.model.js
│   ├── files/
│   │   ├── files.controller.js
│   │   ├── files.service.js
│   │   ├── files.repository.js
│   │   ├── files.routes.js
│   │   └── files.model.js
│   ├── folders/
│   │   ├── folders.controller.js
│   │   ├── folders.service.js
│   │   ├── folders.repository.js
│   │   ├── folders.routes.js
│   │   └── folders.model.js
│   └── notifications/
│       ├── notifications.gateway.js
│       └── jobs/ (BullMQ workers)
├── middleware/
│   ├── auth.middleware.js
│   ├── error.middleware.js
│   ├── rateLimiter.middleware.js
│   ├── security.middleware.js
│   └── upload.middleware.js
├── config/
│   ├── db.js
│   ├── redis.js
│   └── env.js
├── providers/
│   ├── redis.provider.js
│   ├── bullmq.provider.js
│   └── minio.provider.js
├── errors/
│   ├── base.error.js
│   ├── badRequest.error.js
│   ├── unauthorized.error.js
│   ├── forbidden.error.js
│   ├── notFound.error.js
│   └── internalServer.error.js
└── utils/
app.js
server.js
docker-compose.yml
Dockerfile

SECURITY IMPLEMENTED:
- Dual JWT tokens (access 15min + refresh 7days)
- Refresh token rotation on every use
- Refresh tokens stored in Redis (revocable)
- Rate limiting: 100 req/15min per IP via Redis
- Helmet security headers
- express-mongo-sanitize (NoSQL injection prevention)
- HPP (HTTP Parameter Pollution prevention)
- MIME type validation via magic bytes
- Storage quota per user
- RBAC middleware on all protected routes

SCHEMAS:
User Schema: name, email, password(hashed), role(admin/user/viewer), 
storageQuotaMB(default 1024), storageUsedMB, isActive, lastLogin, timestamps

File Schema: originalName, objectKey(MinIO), mimeType, size, 
owner(ref:User), folderId, isShared, shareToken, shareExpiresAt,
processingStatus(pending/completed/rejected), metadata, timestamps

Folder Schema: name, owner(ref:User), parentId(ref:Folder), 
path(full path string), timestamps

KNOWN BUGS (from bug report):
1. fileProcessor job uses filePath but MinIO uses objectKey (Critical)
2. Folder delete leaks MinIO storage (Critical)
3. Duplicate updateUser method in auth.repository (Critical)
4. N+1 query in folder deletion (Performance)
5. Missing pagination on file list (Warning)
6. No text indexes for search (Warning)

INTERVIEW PREP ORDER WE WILL FOLLOW:
Step 1: Problem Statement + Why this project + Zoho context
Step 2: References (NFS RFC 7530, SMB 3.1.1) — interviewer may ask
Step 3: Full end-to-end request flow (client → server → DB)
Step 4: Auth module — code walkthrough + schema + interview Q&A
Step 5: Files module — code walkthrough + schema + interview Q&A
Step 6: Folders module — code walkthrough + schema + interview Q&A
Step 7: Notifications + BullMQ + Socket.io — code walkthrough
Step 8: Security deep dive — JWT, Redis, rate limiting, MIME
Step 9: System Design questions — scaling, 1000 users, failure scenarios
Step 10: Mock interview — full simulation

HOW TO COACH ME:
- Explain each concept deeply but simply
- After each concept ask me questions like interviewer
- Give me exact words to say in interview
- Point out where I might get trapped
- Cover both basic and advanced questions
- When I paste code, explain what it does + what interviewer will ask
- Always relate back to my actual project

START: Begin with Step 1 — Problem Statement.
Why did Zoho give this project? What problem does it solve?
What should I say when interviewer asks 
"Tell me about your project"?