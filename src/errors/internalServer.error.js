const BaseError = require('./base.error')

class InternalServerError extends BaseError {
  constructor(message = 'Internal Server Error') {
    super(message, 500)
  }
}

module.exports = InternalServerError