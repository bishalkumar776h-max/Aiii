const { validationResult } = require('express-validator');
const User = require('../models/User');
const { signToken, sendTokenCookie, clearTokenCookie } = require('../utils/jwt');

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_TIME_MS = 15 * 60 * 1000; // 15 minutes

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() });
    return true;
  }
  return false;
}

// POST /api/auth/register
exports.register = async (req, res, next) => {
  try {
    if (handleValidation(req, res)) return;
    const { username, email, password } = req.body;

    const existing = await User.findOne({ $or: [{ email: email.toLowerCase() }, { username }] });
    if (existing) {
      return res.status(409).json({ success: false, message: 'An account with that email or username already exists.' });
    }

    // First-ever user automatically becomes admin (bootstrap), everyone else is 'user'
    const userCount = await User.countDocuments();
    const role = userCount === 0 ? 'admin' : 'user';

    const user = await User.create({ username, email, password, role });

    const token = signToken({ id: user._id, role: user.role });
    sendTokenCookie(res, token);

    res.status(201).json({ success: true, message: 'Account created successfully.', user: user.toSafeObject(), token });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/login
exports.login = async (req, res, next) => {
  try {
    if (handleValidation(req, res)) return;
    const { emailOrUsername, password } = req.body;

    const user = await User.findOne({
      $or: [{ email: emailOrUsername.toLowerCase() }, { username: emailOrUsername }],
    }).select('+password');

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    if (user.isLocked) {
      const minsLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
      return res.status(423).json({ success: false, message: `Account temporarily locked. Try again in ${minsLeft} minute(s).` });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ success: false, message: `Account is ${user.status}. Contact support.` });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      user.failedLoginAttempts += 1;
      if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
        user.lockUntil = new Date(Date.now() + LOCK_TIME_MS);
        user.failedLoginAttempts = 0;
      }
      await user.save();
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;
    user.lastLoginAt = new Date();
    user.lastLoginIp = req.ip;
    await user.save();

    const token = signToken({ id: user._id, role: user.role });
    sendTokenCookie(res, token);

    res.json({ success: true, message: 'Logged in successfully.', user: user.toSafeObject(), token });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/logout
exports.logout = async (req, res) => {
  clearTokenCookie(res);
  res.json({ success: true, message: 'Logged out.' });
};

// GET /api/auth/me
exports.getMe = async (req, res) => {
  res.json({ success: true, user: req.user.toSafeObject() });
};

// PATCH /api/auth/profile
exports.updateProfile = async (req, res, next) => {
  try {
    const { username } = req.body;
    if (username && username !== req.user.username) {
      const taken = await User.findOne({ username });
      if (taken) return res.status(409).json({ success: false, message: 'Username already taken.' });
      req.user.username = username;
    }
    await req.user.save();
    res.json({ success: true, message: 'Profile updated.', user: req.user.toSafeObject() });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/auth/password
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'New password must be at least 8 characters.' });
    }
    const user = await User.findById(req.user._id).select('+password');
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) return res.status(401).json({ success: false, message: 'Current password is incorrect.' });

    user.password = newPassword;
    await user.save();
    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (err) {
    next(err);
  }
};
