// server.js
const app = require("./src/app");
const connectDB = require("./src/config/dbConfig");
const { PORT } = require("./src/config/serverConfig");
const redis = require("./src/config/redisConfig");
const logger = require("./src/utils/logger");

// ── BullMQ Workers — yahan import karo taaki server start hote hi register ho jayein
require("./src/modules/notifications/jobs/fileProcessor.job");
require("./src/modules/notifications/jobs/thumbnail.job");

const startServer = async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV}`);
    });
  } catch (error) {
    logger.error(`Server startup failed: ${error.message}`);
    process.exit(1);
  }
};

startServer();
