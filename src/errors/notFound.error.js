const BaseError = require("./base.error");

class NotFoundError extends BaseError {
  constructor(message = "Resource not found") {
    super(message, 404);
  }
}

module.exports = NotFoundError;
