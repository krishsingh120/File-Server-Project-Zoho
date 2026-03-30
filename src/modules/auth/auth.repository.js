// src/modules/auth/auth.repository.js
const User = require("./auth.model");

class AuthRepository {
  async createUser(userData) {
    const user = await User.create(userData);
    return user;
  }

  async findByEmail(email) {
    const user = await User.findOne({ email }).select("+password");
    return user;
  }

  async findById(id) {
    const user = await User.findById(id);
    return user;
  }

  async updateLastLogin(id) {
    const user = await User.findByIdAndUpdate(
      id,
      { lastLogin: new Date() },
      { new: true },
    );
    return user;
  }

  async updateUser(id, updateData) {
    const user = await User.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });
    return user;
  }

  // auth.repository.js mein ye method update karo
  async updateUser(filter, updateData) {
    const user = await User.findOneAndUpdate(filter, updateData, {
      new: true,
      runValidators: true,
    });
    return user;
  }

  async isEmailTaken(email) {
    const user = await User.findOne({ email });
    return !!user;
  }
}

module.exports = new AuthRepository();
