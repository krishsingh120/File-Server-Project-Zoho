# 🚀 File Server (Zoho SETU)

---

## ✅ Final Decision List

| Decision     | Choice                       |
| ------------ | ---------------------------- |
| Architecture | Modular Monolith             |
| Language     | JavaScript                   |
| Framework    | Express.js                   |
| Database     | MongoDB                      |
| Cache        | Redis                        |
| Queue        | BullMQ                       |
| File Storage | Multer (local) → MinIO later |
| Auth         | JWT (Access + Refresh Token) |
| Frontend     | Later (Not in Phase 1)       |

---

# 🎯 Features — Backend Only

---

## 🟡 Phase 1 — Days 1–3

### Setup

- Express.js project setup
- MongoDB connection
- Redis setup
- Docker basic setup

### Auth Module

- Register
- Login
- Logout
- Refresh Token

### Security

- JWT middleware
- Protected routes

---

## 🟠 Phase 2 — Days 4–6

### Files Module

- Upload file
- Download file
- Delete file
- List files

### Folder Module

- Create folder
- Rename folder
- Delete folder

### Validation

- File size validation
- MIME type validation

### Storage Control

- Storage quota per user

---

## 🔴 Phase 3 — Days 7–10

### Async Processing

- BullMQ integration
- Background file jobs

### Real-time

- WebSocket for upload progress

### Performance & Security

- Rate limiting (Redis)

### Sharing

- Shareable / presigned links

### Logging

- Winston logging

### DevOps

- Docker setup (final)

---


# 🧾 Commit Types — Github standards

---

## 📌 Standard Commit Types

| Type     | Matlab                | Example                              |
|----------|----------------------|--------------------------------------|
| feat     | Naya feature         | feat: add user login endpoint        |
| fix      | Bug fix              | fix: resolve jwt expiry issue        |
| chore    | Setup / maintenance  | chore: install dependencies          |
| refactor | Code improve         | refactor: clean auth service         |
| docs     | Documentation        | docs: add API readme                 |
| test     | Testing              | test: add auth unit tests            |
| style    | Formatting           | style: fix indentation               |

---

## 🎯 Usage Tips

- Har commit meaningful hona chahiye
- Ek commit = ek logical change
- Clear aur concise message likho
- Lowercase prefix use karo (feat, fix, etc.)

---

## 💀 Pro Tip (Interview + Real Projects)

> "I follow conventional commits to maintain clean version history and improve collaboration."

---


# 📁 Folder Structure — Final

```bash
file-server/
├── src/
│ ├── modules/
│ │ ├── auth/
│ │ │ ├── auth.routes.js
│ │ │ ├── auth.controller.js
│ │ │ ├── auth.service.js
│ │ │ ├── auth.repository.js
│ │ │ └── auth.model.js
│ │ ├── files/
│ │ │ ├── files.routes.js
│ │ │ ├── files.controller.js
│ │ │ ├── files.service.js
│ │ │ ├── files.repository.js
│ │ │ └── files.model.js
│ │ ├── folders/
│ │ │ ├── folders.routes.js
│ │ │ ├── folders.controller.js
│ │ │ ├── folders.service.js
│ │ │ └── folders.model.js
│ │ └── notifications/
│ │ ├── notifications.gateway.js
│ │ └── notifications.service.js
│
│ ├── providers/
│ │ ├── redis.provider.js
│ │ ├── bullmq.provider.js
│ │ └── minio.provider.js
│
│ ├── middleware/
│ │ ├── auth.middleware.js
│ │ │ ├── rateLimit.middleware.js
│ │ │ ├── upload.middleware.js
│ │ │ └── error.middleware.js
│
│ ├── config/
│ │ ├── db.js
│ │ ├── redis.js
│ │ └── env.js
│
│ └── app.js
│
├── docker-compose.yml
├── .env.example
├── server.js
└── package.json
```

---

# 🧠 Architecture Summary

- Modular Monolith structure
- Clean separation of concerns
- Async background processing via BullMQ
- Redis for caching & rate limiting
- Storage abstraction (local → MinIO)

---

# 🔥 Future Scope

- Convert to microservices architecture
- Cloud storage (AWS S3 / MinIO)
- Chunk upload for large files
- Role-based access control (RBAC)
- API Gateway integration

---

# 💀 Interview One-Liner

> "The system is built as a modular monolith with clear module boundaries, async job processing using BullMQ, and storage abstraction to support future scalability and microservices migration."

---
