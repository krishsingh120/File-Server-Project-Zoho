const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const errorHandler = require("./middleware/error.middleware");
const NotFoundError = require("./errors/notFound.error");
const logger = require("./utils/logger");
const {
  helmetConfig,
  mongoSanitizeConfig,
  hppConfig,
} = require("./middleware/security.middleware");
const serverAdapter = require("./config/bullBoardUi.Config");

// Routes
const authRoutes = require("./modules/auth/auth.routes");
const filesRoutes = require("./modules/files/files.routes");
const foldersRoutes = require("./modules/folders/folders.routes");

const app = express();

// Middleware
// Security middleware — sabse pehle lagao
app.use(helmetConfig);
app.use(mongoSanitizeConfig);
app.use(hppConfig);

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  }),
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

// Morgan — winston ke saath integrate
app.use(morgan("combined", { stream: logger.stream }));

// Health Check
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    message: "File Server is running",
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/files", filesRoutes);
app.use("/api/v1/folders", foldersRoutes);

// Bull Board UI
app.use("/admin/bull-board", serverAdapter.getRouter());

// 404 Handler
app.use((req, res, next) => {
  next(new NotFoundError(`Route ${req.originalUrl} not found`));
});

// Global Error Handler
app.use(errorHandler);

module.exports = app;
