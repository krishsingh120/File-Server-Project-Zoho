// server.js
const http = require("http");
const app = require("./src/app");
const connectDB = require("./src/config/dbConfig");
const { PORT } = require("./src/config/serverConfig");
const redis = require("./src/config/redisConfig");
const logger = require("./src/utils/logger");
const {
  initSocket,
} = require("./src/modules/notifications/notifications.gateway");
const { initMinio } = require("./src/providers/minio.provider"); // ← NEW

// ── BullMQ Workers
require("./src/modules/notifications/jobs/fileProcessor.job");
require("./src/modules/notifications/jobs/thumbnail.job");


const startServer = async () => {
  try {
    await connectDB();
    await initMinio(); // ← NEW: bucket ready karo

    const httpServer = http.createServer(app);
    initSocket(httpServer);

    httpServer.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV}`);
      logger.info(`Bull Board UI → http://localhost:${PORT}/admin/bull-board`);
    });
  } catch (error) {
    logger.error(`Server startup failed: ${error.message}`);
    process.exit(1);
  }
};

startServer();
