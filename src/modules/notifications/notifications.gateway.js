// src/modules/notifications/notifications.gateway.js
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const { JWT_ACCESS_SECRET } = require("../../config/serverConfig");
const authService = require("../auth/auth.service");
const logger = require("../../utils/logger");

// ─── Connected Users Map ──────────────────────────────────────────────────────
// userId → socketId — taaki specific user ko emit kar sakein
const connectedUsers = new Map();

let io;

/**
 * Socket.io initialize karo — server.js se call hoga
 * @param {http.Server} httpServer
 */
const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:3000",
      credentials: true,
    },
  });

  // ── JWT Auth Middleware ────────────────────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      // Client handshake mein token bhejega:
      // socket = io("http://localhost:5000", { auth: { token: "Bearer xxx" } })
      const token = socket.handshake.auth?.token?.replace("Bearer ", "");

      if (!token) {
        return next(new Error("Authentication token required"));
      }

      // Blacklist check
      const isBlacklisted = await authService.isTokenBlacklisted(token);
      if (isBlacklisted) {
        return next(new Error("Token is no longer valid"));
      }

      // Verify
      const decoded = jwt.verify(token, JWT_ACCESS_SECRET);
      socket.user = { id: decoded.id, role: decoded.role }; // socket pe attach karo

      next();
    } catch (error) {
      if (error.name === "JsonWebTokenError") {
        return next(new Error("Invalid token"));
      }
      if (error.name === "TokenExpiredError") {
        return next(new Error("Token expired"));
      }
      next(error);
    }
  });

  // ── Connection Handler ─────────────────────────────────────────────────────
  io.on("connection", (socket) => {
    const userId = socket.user.id;

    // User ko map mein store karo
    connectedUsers.set(userId, socket.id);
    logger.info(
      `[Socket.io] User connected — userId: ${userId} | socketId: ${socket.id}`,
    );

    // Disconnect handler
    socket.on("disconnect", () => {
      connectedUsers.delete(userId);
      logger.info(`[Socket.io] User disconnected — userId: ${userId}`);
    });
  });

  logger.info("[Socket.io] Initialized successfully");
  return io;
};

/**
 * Specific user ko event emit karo
 * @param {string} userId
 * @param {string} event
 * @param {Object} data
 */
const emitToUser = (userId, event, data) => {
  if (!io) {
    logger.error("[Socket.io] io not initialized — emitToUser failed");
    return;
  }

  const socketId = connectedUsers.get(userId.toString());

  if (socketId) {
    io.to(socketId).emit(event, data);
    logger.info(`[Socket.io] Emitted '${event}' → userId: ${userId}`);
  } else {
    // User offline hai — emit nahi hoga, but that's okay
    logger.info(
      `[Socket.io] User offline — event '${event}' not delivered | userId: ${userId}`,
    );
  }
};

// ─── Socket Events (constants) ────────────────────────────────────────────────
const SOCKET_EVENTS = {
  FILE_PROCESSING: "file:processing", // job start
  FILE_COMPLETED: "file:completed", // processing done
  FILE_REJECTED: "file:rejected", // MIME mismatch
  FILE_THUMBNAIL: "file:thumbnail", // thumbnail ready
};

module.exports = { initSocket, emitToUser, SOCKET_EVENTS, connectedUsers };
