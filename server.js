// server.js
const app = require("./src/app");
const connectDB = require("./src/config/dbConfig");
const { PORT } = require("./src/config/serverConfig");
const redis = require("./src/config/redisConfig"); // ← ye add karo

const startServer = async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV}`);
    });
  } catch (error) {
    console.error(`Server Error: ${error.message}`);
    process.exit(1);
  }
};

startServer();
