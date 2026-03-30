const winston = require("winston");
const { NODE_ENV } = require("../config/serverConfig");

const allowedTransports = [];

// Console — sirf development
if (NODE_ENV !== "production") {
  allowedTransports.push(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        winston.format.printf(
          (log) => `${log.timestamp} [${log.level}] : ${log.message}`,
        ),
      ),
    }),
  );
}

// File — sirf errors
allowedTransports.push(
  new winston.transports.File({
    filename: "logs/error.log",
    level: "error",
  }),
);

// File — sab levels
allowedTransports.push(
  new winston.transports.File({
    filename: "logs/combined.log",
  }),
);

// const logger = winston.createLogger({
//   level: NODE_ENV === "production" ? "warn" : "http", // ← debug → http
//   format: winston.format.combine(
//     winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
//     winston.format.printf(
//       (log) => `${log.timestamp} [${log.level.toUpperCase()}] : ${log.message}`,
//     ),
//   ),
//   transports: allowedTransports,
// });

const logger = winston.createLogger({
  level: NODE_ENV === "production" ? "warn" : "http",
  levels: winston.config.npm.levels, // ← YE LINE ADD KAR (naya)
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.printf(
      (log) => `${log.timestamp} [${log.level.toUpperCase()}] : ${log.message}`,
    ),
  ),
  transports: allowedTransports,
});

// ← YE BLOCK ADD KAR module.exports se pehle (naya)
logger.stream = {
  write: (message) => logger.http(message.trim()),
};

module.exports = logger;
