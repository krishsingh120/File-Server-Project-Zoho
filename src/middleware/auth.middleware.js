// src/middleware/auth.middleware.js
const jwt = require("jsonwebtoken");
const authService = require("../modules/auth/auth.service");
const { JWT_ACCESS_SECRET } = require("../config/serverConfig");
const UnauthorizedError = require("../errors/unauthorized.error");
const ForbiddenError = require("../errors/forbidden.error");

// Token verify karo
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedError("Access token required");
    }

    const token = authHeader.split(" ")[1];

    // Blacklist check karo
    const isBlacklisted = await authService.isTokenBlacklisted(token);
    if (isBlacklisted) {
      throw new UnauthorizedError(
        "Token is no longer valid. Please login again",
      );
    }

    // Token verify karo
    const decoded = jwt.verify(token, JWT_ACCESS_SECRET);

    // req.user mein daalo — aage controllers use karenge
    req.user = {
      id: decoded.id,
      role: decoded.role,
    };

    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return next(new UnauthorizedError("Invalid token"));
    }
    if (error.name === "TokenExpiredError") {
      return next(new UnauthorizedError("Token expired. Please refresh"));
    }
    next(error);
  }
};

// Role based access control
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new ForbiddenError(
          `Role '${req.user.role}' is not allowed to access this resource`,
        ),
      );
    }
    next();
  };
};

module.exports = { authenticate, authorize };
