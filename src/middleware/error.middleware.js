const logger = require("../utils/logger");

const sendDevError = (err, res) => {
  logger.error(`DEV ERROR: ${err.message} | Stack: ${err.stack}`); // ← add
  res.status(err.statusCode).json({
    status: err.status,
    message: err.message,
    stack: err.stack,
  });
};

const sendProdError = (err, res) => {
  if (err.isOperational) {
    logger.warn(`OPERATIONAL ERROR: ${err.statusCode} | ${err.message}`); // ← add
    res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
    });
  } else {
    logger.error(`UNHANDLED ERROR: ${err.message} | Stack: ${err.stack}`); // ← console.error replace
    res.status(500).json({
      status: "error",
      message: "Something went wrong",
    });
  }
};

// baaki sab same rehega...

const handleCastErrorDB = () => {
  const { BadRequestError } = require("../errors/badRequest.error");
  return new BadRequestError("Invalid ID format");
};

const handleDuplicateFieldsDB = (err) => {
  const BadRequestError = require("../errors/badRequest.error");
  const value = err.keyValue ? Object.values(err.keyValue)[0] : "unknown";
  return new BadRequestError(`Duplicate value: ${value}`);
};

const handleValidationErrorDB = (err) => {
  const BadRequestError = require("../errors/badRequest.error");
  const errors = Object.values(err.errors).map((el) => el.message);
  return new BadRequestError(`Validation Error: ${errors.join(". ")}`);
};

const handleJWTError = () => {
  const UnauthorizedError = require("../errors/unauthorized.error");
  return new UnauthorizedError("Invalid token. Please login again");
};

const handleJWTExpiredError = () => {
  const UnauthorizedError = require("../errors/unauthorized.error");
  return new UnauthorizedError("Token expired. Please login again");
};

const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || "error";

  if (process.env.NODE_ENV === "development") {
    sendDevError(err, res);
  } else {
    let error = { ...err, message: err.message };
    if (err.name === "CastError") error = handleCastErrorDB(error);
    if (err.code === 11000) error = handleDuplicateFieldsDB(error);
    if (err.name === "ValidationError") error = handleValidationErrorDB(error);
    if (err.name === "JsonWebTokenError") error = handleJWTError();
    if (err.name === "TokenExpiredError") error = handleJWTExpiredError();
    sendProdError(error, res);
  }
};

module.exports = errorHandler;
