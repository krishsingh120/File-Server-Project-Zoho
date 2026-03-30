// src/modules/auth/auth.service.js
const jwt = require("jsonwebtoken");
const authRepository = require("./auth.repository");
const redis = require("../../config/redisConfig");
const {
  JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET,
  JWT_ACCESS_EXPIRES,
  JWT_REFRESH_EXPIRES,
} = require("../../config/serverConfig");
const BadRequestError = require("../../errors/badRequest.error");
const UnauthorizedError = require("../../errors/unauthorized.error");
const NotFoundError = require("../../errors/notFound.error");

class AuthService {
  // Token generate karo
  generateAccessToken(payload) {
    return jwt.sign(payload, JWT_ACCESS_SECRET, {
      expiresIn: JWT_ACCESS_EXPIRES,
    });
  }

  generateRefreshToken(payload) {
    return jwt.sign(payload, JWT_REFRESH_SECRET, {
      expiresIn: JWT_REFRESH_EXPIRES,
    });
  }

  // Refresh token Redis mein save karo
  async saveRefreshToken(userId, refreshToken) {
    // 7 days in seconds
    const ttl = 7 * 24 * 60 * 60;
    await redis.set(`refresh:${userId}`, refreshToken, "EX", ttl);
  }

  // Access token blacklist karo (logout pe)
  async blacklistAccessToken(token) {
    const decoded = jwt.decode(token);
    if (!decoded) return;
    const ttl = decoded.exp - Math.floor(Date.now() / 1000);
    if (ttl > 0) {
      await redis.set(`blacklist:${token}`, "1", "EX", ttl);
    }
  }

  async isTokenBlacklisted(token) {
    const result = await redis.get(`blacklist:${token}`);
    return !!result;
  }

  // Register
  async register(userData) {
    const { name, email, password } = userData;

    const emailTaken = await authRepository.isEmailTaken(email);
    if (emailTaken) {
      throw new BadRequestError("Email already registered");
    }

    const user = await authRepository.createUser({ name, email, password });

    const payload = { id: user._id, role: user.role };
    const accessToken = this.generateAccessToken(payload);
    const refreshToken = this.generateRefreshToken(payload);

    await this.saveRefreshToken(user._id, refreshToken);

    return { user, accessToken, refreshToken };
  }

  // Login
  async login({ email, password }) {
    const user = await authRepository.findByEmail(email);
    if (!user) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const isPasswordCorrect = await user.comparePassword(password);
    if (!isPasswordCorrect) {
      throw new UnauthorizedError("Invalid email or password");
    }

    if (!user.isActive) {
      throw new UnauthorizedError("Account is deactivated");
    }

    await authRepository.updateLastLogin(user._id);

    const payload = { id: user._id, role: user.role };
    const accessToken = this.generateAccessToken(payload);
    const refreshToken = this.generateRefreshToken(payload);

    await this.saveRefreshToken(user._id, refreshToken);

    return { user, accessToken, refreshToken };
  }

  // Logout
  async logout(userId, accessToken) {
    await redis.del(`refresh:${userId}`);
    await this.blacklistAccessToken(accessToken);
  }

  // Refresh token se naya access token lo
  async refreshAccessToken(refreshToken) {
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    } catch {
      throw new UnauthorizedError("Invalid or expired refresh token");
    }

    const storedToken = await redis.get(`refresh:${decoded.id}`);
    if (!storedToken || storedToken !== refreshToken) {
      throw new UnauthorizedError(
        "Refresh token reused or expired. Please login again",
      );
    }

    const user = await authRepository.findById(decoded.id);
    if (!user || !user.isActive) {
      throw new UnauthorizedError("User not found or deactivated");
    }

    // Refresh token rotation — purana delete, naya banao
    const payload = { id: user._id, role: user.role };
    const newAccessToken = this.generateAccessToken(payload);
    const newRefreshToken = this.generateRefreshToken(payload);

    await this.saveRefreshToken(user._id, newRefreshToken);

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  // Current user
  async getMe(userId) {
    const user = await authRepository.findById(userId);
    if (!user) {
      throw new NotFoundError("User not found");
    }
    return user;
  }
}

module.exports = new AuthService();
