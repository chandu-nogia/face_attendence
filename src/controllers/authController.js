const Joi = require('joi');
const User = require('../models/User');
const Student = require('../models/Student');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} = require('../utils/generateToken');
const { logAudit } = require('../services/auditService');

const ROLES = ['admin', 'teacher', 'principal', 'parent', 'student'];

const registerSchema = Joi.object({
  name: Joi.string().min(2).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  role: Joi.string().valid(...ROLES).default('teacher'),
  phone: Joi.string().allow('', null),
  linkedStudents: Joi.array().items(Joi.string()).optional(),
  studentProfileId: Joi.string().allow('', null),
  inviteCode: Joi.string().allow('', null),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

async function register(req, res, next) {
  try {
    const { error, value } = registerSchema.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.message });

    // Elevated roles need admin invite or open register for teacher/parent
    const elevated = ['admin', 'principal'];
    if (elevated.includes(value.role)) {
      const adminCount = await User.countDocuments({ role: 'admin' });
      if (adminCount > 0) {
        const codeOk =
          value.inviteCode &&
          value.inviteCode === (process.env.ADMIN_INVITE_CODE || 'FACE-ADMIN-2024');
        if (!codeOk && (!req.user || !['admin', 'principal'].includes(req.user.role))) {
          return res.status(403).json({
            success: false,
            message: 'Admin/principal registration requires invite code',
          });
        }
      }
    }

    const exists = await User.findOne({ email: value.email });
    if (exists) return res.status(409).json({ success: false, message: 'Email already registered' });

    const passwordHash = await User.hashPassword(value.password);
    const user = await User.create({
      name: value.name,
      email: value.email,
      passwordHash,
      role: value.role,
      phone: value.phone,
      linkedStudents: value.linkedStudents || [],
      studentProfileId: value.studentProfileId || undefined,
    });

    // Link parent to students by email
    if (value.role === 'parent') {
      await Student.updateMany(
        { parentEmail: value.email },
        { parentUserId: user._id }
      );
      const kids = await Student.find({ parentUserId: user._id }).select('_id');
      user.linkedStudents = kids.map((k) => k._id);
      await user.save();
    }

    await logAudit({
      actorId: user._id,
      action: 'auth.register',
      entityType: 'User',
      entityId: user._id,
      meta: { role: user.role },
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
    if (user.isActive === false) {
      return res.status(403).json({ success: false, message: 'Account deactivated' });
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

async function me(req, res) {
  res.json({ success: true, data: req.user.toSafeJSON() });
}

module.exports = { register, login, refreshToken, me };
