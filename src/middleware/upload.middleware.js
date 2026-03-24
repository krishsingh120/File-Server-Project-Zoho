// src/middleware/upload.middleware.js
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const BadRequestError = require("../errors/badRequest.error");

// Allowed MIME types
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/x-zip-compressed",
  "video/mp4",
  "audio/mpeg",
];

// Dangerous file extensions — reject karo
const BLOCKED_EXTENSIONS = [
  ".exe",
  ".sh",
  ".bat",
  ".cmd",
  ".msi",
  ".ps1",
  ".vbs",
  ".js",
  ".jar",
  ".php",
];

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Per-user folder banao
    const uploadPath = path.join("uploads", req.user.id.toString());
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Unique filename — uuid + timestamp + originalname
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${uuidv4()}-${Date.now()}${ext}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();

  // Blocked extensions check
  if (BLOCKED_EXTENSIONS.includes(ext)) {
    return cb(new BadRequestError(`File type ${ext} is not allowed`), false);
  }

  // MIME type check
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(
      new BadRequestError(`MIME type ${file.mimetype} is not allowed`),
      false,
    );
  }

  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 100 * 1024 * 1024, // 100MB default
  },
});

module.exports = upload;
