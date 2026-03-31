const jwt = require('jsonwebtoken');
const User = require('../models/User');
const config = require('../config/env');

const generateToken = (userId) => {
  return jwt.sign({ id: userId }, config.JWT_SECRET, { expiresIn: config.JWT_EXPIRE });
};

// POST /api/auth/register
exports.register = async (req, res, next) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ success: false, error: 'Please provide all fields' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, error: 'Please provide a valid email' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ success: false, error: 'User with this email already exists' });
    }

    // Check if this should be superadmin
    const role = email.toLowerCase() === config.SUPER_ADMIN_EMAIL.toLowerCase() ? 'superadmin' : 'user';

    const user = await User.create({
      username,
      email: email.toLowerCase(),
      password,
      role,
    });

    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      token,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        bio: user.bio,
        role: user.role,
        isOnline: true,
      },
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/auth/login
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Please provide email and password' });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // Update online status
    user.isOnline = true;
    await user.save();

    const token = generateToken(user._id);

    res.json({
      success: true,
      token,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        bio: user.bio,
        role: user.role,
        isOnline: true,
      },
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/auth/me
exports.getMe = async (req, res) => {
  res.json({
    success: true,
    user: {
      _id: req.user._id,
      username: req.user.username,
      email: req.user.email,
      avatar: req.user.avatar,
      bio: req.user.bio,
      role: req.user.role,
      isOnline: req.user.isOnline,
      friends: req.user.friends,
      createdAt: req.user.createdAt,
    },
  });
};
