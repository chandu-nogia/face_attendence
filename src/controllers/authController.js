const Joi = require('joi');
const User = require('../models/User');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} = require('../utils/generateToken');

const registerSchema = Joi.object({
  name: Joi.string().min(2).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  role: Joi.string().valid('admin', 'teacher').default('teacher'),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

async function register(req, res, next) {
  try {
    const { error, value } = registerSchema.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.message });

    const exists = await User.findOne({ email: value.email });
    if (exists) return res.status(409).json({ success: false, message: 'Email already registered' });

    const passwordHash = await User.hashPassword(value.password);
    const user = await User.create({
      name: value.name,
      email: value.email,
      passwordHash,
      role: value.role,
    });

    const payload = { id: user._id, role: user.role };
    res.status(201).json({
      success: true,
      data: {
        user: user.toSafeJSON(),
        accessToken: generateAccessToken(payload),
        refreshToken: generateRefreshToken(payload),
      },
    });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.message });

    const user = await User.findOne({ email: value.email });
    if (!user || !(await user.comparePassword(value.password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const payload = { id: user._id, role: user.role };
    res.json({
      success: true,
      data: {
        user: user.toSafeJSON(),
        accessToken: generateAccessToken(payload),
        refreshToken: generateRefreshToken(payload),
      },
    });
  } catch (err) {
    next(err);
  }
}

async function refreshToken(req, res, next) {
  try {
    const token = req.body.refreshToken;
    if (!token) return res.status(400).json({ success: false, message: 'refreshToken required' });

    const decoded = verifyRefreshToken(token);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ success: false, message: 'User not found' });

    const payload = { id: user._id, role: user.role };
    res.json({
      success: true,
      data: {
        accessToken: generateAccessToken(payload),
        refreshToken: generateRefreshToken(payload),
      },
    });
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid refresh token' });
  }
}

module.exports = { register, login, refreshToken };
