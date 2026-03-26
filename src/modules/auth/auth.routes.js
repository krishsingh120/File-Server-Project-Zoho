// src/modules/auth/auth.routes.js
const express = require("express");
const router = express.Router();
const authController = require("./auth.controller");
const { authenticate } = require("../../middleware/auth.middleware");
const { authLimiter } = require("../../middleware/rateLimiter.middleware");


// Public routes
router.post(
  "/register",
  authLimiter,
  authController.register.bind(authController),
);
router.post("/login", authLimiter, authController.login.bind(authController));
router.post(
  "/refresh",
  authLimiter,
  authController.refresh.bind(authController),
);

// Private routes
router.post(
  "/logout",
  authenticate,
  authController.logout.bind(authController),
);
router.get("/me", authenticate, authController.getMe.bind(authController));

module.exports = router;
