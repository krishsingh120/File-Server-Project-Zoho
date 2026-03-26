// src/middleware/security.middleware.js
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const hpp = require("hpp");

const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:"],
    },
  },
  crossOriginEmbedderPolicy: false, // MinIO presigned URLs ke liye
});

const mongoSanitizeConfig = mongoSanitize({
  replaceWith: "_", // $ ko _ se replace karo
  onSanitizeError: (req, res) => {
    res.status(400).json({
      status: "fail",
      message: "Invalid characters detected in request",
    });
  },
});

const hppConfig = hpp({
  whitelist: ["sort", "fields", "page", "limit"], // ye params array mein aa sakte hain
});

module.exports = { helmetConfig, mongoSanitizeConfig, hppConfig };
