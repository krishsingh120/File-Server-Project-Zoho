// src/modules/auth/auth.routes.js
const express = require("express");
const router = express.Router();
const authController = require("./auth.controller");
const { authenticate } = require("../../middleware/auth.middleware");

// Public routes
router.post("/register", authController.register.bind(authController));
router.post("/login", authController.login.bind(authController));
router.post("/refresh", authController.refresh.bind(authController));

// Private routes
router.post(
  "/logout",
  authenticate,
  authController.logout.bind(authController),
);
router.get("/me", authenticate, authController.getMe.bind(authController));

module.exports = router;
