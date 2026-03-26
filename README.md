# File Server

A cross-platform, GUI-based file server built with Node.js, Express, MongoDB, Redis, and MinIO. Supports authenticated multi-user file management over a network.

## Features

- JWT Authentication with refresh token rotation
- Role-based access control (admin, user, viewer)
- File upload, download, delete, share
- Nested folder management with cascade delete
- MinIO object storage (S3-compatible)
- Real-time upload progress via Socket.io
- Async file processing with BullMQ
- Rate limiting with Redis
- Security hardening (helmet, mongoSanitize, hpp)
- Structured logging with Winston
- Docker support

## Tech Stack

| Layer     | Technology                    |
| --------- | ----------------------------- |
| Runtime   | Node.js 20 LTS                |
| Framework | Express.js                    |
| Database  | MongoDB (Atlas)               |
| Cache     | Redis                         |
| Storage   | MinIO (S3-compatible)         |
| Queue     | BullMQ                        |
| Realtime  | Socket.io                     |
| Auth      | JWT (access + refresh tokens) |
| Container | Docker + Docker Compose       |

## Project Structure

```
src/
├── modules/
│   ├── auth/          # Authentication + RBAC
│   ├── files/         # File operations
│   ├── folders/       # Folder management
│   └── notifications/ # Socket.io events
├── middleware/        # auth, error, security, upload
├── providers/         # redis, bullmq, minio
├── config/            # db, env, redis
├── errors/            # Custom error classes
└── utils/             # logger, helpers
```

## Quick Start

### With Docker (Recommended)

```bash
# 1. Clone karo
git clone https://github.com/krishsingh120/File-Server-Project-Zoho.git
cd File-Server-Project-Zoho

# 2. .env banao
cp .env.example .env
# .env mein apni values daalo

# 3. Start karo
docker-compose up --build
```

### Without Docker

```bash
# 1. Dependencies install karo
npm install

# 2. .env banao
cp .env.example .env

# 3. Redis + MinIO locally start karo

# 4. Server start karo
npm run dev
```

## API Endpoints

### Auth

| Method | Route                 | Description   |
| ------ | --------------------- | ------------- |
| POST   | /api/v1/auth/register | Register      |
| POST   | /api/v1/auth/login    | Login         |
| POST   | /api/v1/auth/logout   | Logout        |
| POST   | /api/v1/auth/refresh  | Refresh token |
| GET    | /api/v1/auth/me       | Current user  |

### Files

| Method | Route                       | Description     |
| ------ | --------------------------- | --------------- |
| POST   | /api/v1/files/upload        | Upload file     |
| GET    | /api/v1/files               | List files      |
| GET    | /api/v1/files/download/:id  | Download file   |
| DELETE | /api/v1/files/:id           | Delete file     |
| POST   | /api/v1/files/share/:id     | Share file      |
| GET    | /api/v1/files/shared/:token | Download shared |
| GET    | /api/v1/files/storage       | Storage info    |
| GET    | /api/v1/files/search        | Search files    |

### Folders

| Method | Route                        | Description     |
| ------ | ---------------------------- | --------------- |
| POST   | /api/v1/folders              | Create folder   |
| GET    | /api/v1/folders              | List folders    |
| GET    | /api/v1/folders/:id/contents | Folder contents |
| PATCH  | /api/v1/folders/:id/rename   | Rename folder   |
| DELETE | /api/v1/folders/:id          | Delete folder   |
| PATCH  | /api/v1/folders/move/:fileId | Move file       |

## Environment Variables

See `.env.example` for all required variables.

## Architecture

Modular Monolith — each module is independently structured and can be extracted into a microservice. Migration path: Docker containers → separate deployments → message queue communication.

## License

MIT
