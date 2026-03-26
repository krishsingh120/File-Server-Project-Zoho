// server.js
const http = require("http");                                          // ← NEW
const app = require("./src/app");
const connectDB = require("./src/config/dbConfig");
const { PORT } = require("./src/config/serverConfig");
const redis = require("./src/config/redisConfig");
const logger = require("./src/utils/logger");
const { initSocket } = require("./src/modules/notifications/notifications.gateway"); // ← NEW

// ── BullMQ Workers — server start hote hi register ho jayein
require("./src/modules/notifications/jobs/fileProcessor.job");
require("./src/modules/notifications/jobs/thumbnail.job");

const startServer = async () => {
  try {
    await connectDB();

    // http.createServer — Socket.io ke liye zaroori
    const httpServer = http.createServer(app);                         // ← NEW

    // Socket.io initialize
    initSocket(httpServer);                                            // ← NEW

    httpServer.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV}`);
    });
  } catch (error) {
    logger.error(`Server startup failed: ${error.message}`);
    process.exit(1);
  }
};

startServer();