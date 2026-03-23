const BaseError = require("./base.error");

class BadRequestError extends BaseError {
  constructor(message = "Bad Request") {
    super(message, 400);
  }
}

module.exports = BadRequestError;
