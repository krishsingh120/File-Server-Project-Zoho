const BaseError = require('./base.error')

class ForbiddenError extends BaseError {
  constructor(message = 'Forbidden') {
    super(message, 403)
  }
}

module.exports = ForbiddenError