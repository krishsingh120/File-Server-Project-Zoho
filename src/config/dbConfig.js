const mongoose = require("mongoose");
const { MONGO_URI } = require("./serverConfig");

const connectToDB = async () => {
  try {
    const conn = await mongoose.connect(MONGO_URI);
    console.log(`🚀 Successfully connect MongoDB: ${conn.connection.host}`);
  } catch (error) {
    console.error(`MongoDB Connection Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectToDB;
