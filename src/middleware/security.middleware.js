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

// Fix: req.query readonly hai Express 5 mein — sirf body + params sanitize karo
const mongoSanitizeConfig = (req, res, next) => {
  if (req.body) mongoSanitize.sanitize(req.body, { replaceWith: "_" });
  if (req.params) mongoSanitize.sanitize(req.params, { replaceWith: "_" });
  next();
};

const hppConfig = hpp({
  whitelist: ["sort", "fields", "page", "limit"],
});

module.exports = { helmetConfig, mongoSanitizeConfig, hppConfig };
