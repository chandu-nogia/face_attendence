const Joi = require('joi');
const User = require('../models/User');
const Class = require('../models/Class');
const { logAudit } = require('../services/auditService');
const { isElevated } = require('../utils/scopeHelper');

async function listUsers(req, res, next) {
  try {
    const filter = {};
    if (req.query.role) filter.role = req.query.role;
    if (req.query.active !== undefined) filter.isActive = req.query.active === 'true';
    if (req.query.search) {
      filter.$or = [
        { name: new RegExp(req.query.search, 'i') },
        { email: new RegExp(req.query.search, 'i') },
      ];
    }
    const users = await User.find(filter)
      .select('-passwordHash')
      .populate('classesAssigned', 'name section')
      .sort({ createdAt: -1 });
    res.json({
      success: true,
      data: users.map((u) => u.toSafeJSON()),
    });
  } catch (err) {
    next(err);
  }
}

async function createTeacher(req, res, next) {
  try {
    if (!isElevated(req.user)) {
      return res.status(403).json({ success: false, message: 'Admin/principal only' });
    }
    const schema = Joi.object({
      name: Joi.string().required(),
      email: Joi.string().email().required(),
      password: Joi.string().min(6).required(),
      phone: Joi.string().allow('', null),
      role: Joi.string().valid('teacher', 'principal', 'admin').default('teacher'),
      classesAssigned: Joi.array().items(Joi.string()).default([]),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.message });

    const exists = await User.findOne({ email: value.email.toLowerCase() });
    if (exists) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const passwordHash = await User.hashPassword(value.password);
    const user = await User.create({
      name: value.name,
      email: value.email.toLowerCase(),
      passwordHash,
      role: value.role,
      phone: value.phone || undefined,
      classesAssigned: value.classesAssigned,
    });

    if (value.classesAssigned?.length) {
      await Class.updateMany(
        { _id: { $in: value.classesAssigned } },
        { $set: { teacherId: user._id } }
      );
    }

    await logAudit({
      actorId: req.user._id,
      action: 'user.create',
      entityType: 'User',
      entityId: user._id,
      meta: { role: user.role, email: user.email },
    });

    res.status(201).json({ success: true, data: user.toSafeJSON() });
  } catch (err) {
    next(err);
  }
}

async function updateUser(req, res, next) {
  try {
    if (!isElevated(req.user)) {
      return res.status(403).json({ success: false, message: 'Admin/principal only' });
    }
    const schema = Joi.object({
      name: Joi.string(),
      phone: Joi.string().allow('', null),
      role: Joi.string().valid('teacher', 'principal', 'admin', 'parent', 'student'),
      classesAssigned: Joi.array().items(Joi.string()),
      isActive: Joi.boolean(),
      password: Joi.string().min(6),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.message });

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (value.name !== undefined) user.name = value.name;
    if (value.phone !== undefined) user.phone = value.phone;
    if (value.role !== undefined) user.role = value.role;
    if (value.isActive !== undefined) user.isActive = value.isActive;
    if (value.password) user.passwordHash = await User.hashPassword(value.password);

    if (value.classesAssigned !== undefined) {
      const oldIds = (user.classesAssigned || []).map(String);
      user.classesAssigned = value.classesAssigned;
      // Clear teacherId on removed classes if this user was teacher
      const removed = oldIds.filter((id) => !value.classesAssigned.map(String).includes(id));
      if (removed.length) {
        await Class.updateMany(
          { _id: { $in: removed }, teacherId: user._id },
          { $unset: { teacherId: 1 } }
        );
      }
      if (value.classesAssigned.length) {
        await Class.updateMany(
          { _id: { $in: value.classesAssigned } },
          { $set: { teacherId: user._id } }
        );
      }
    }

    await user.save();
    await logAudit({
      actorId: req.user._id,
      action: 'user.update',
      entityType: 'User',
      entityId: user._id,
      meta: value,
    });

    res.json({ success: true, data: user.toSafeJSON() });
  } catch (err) {
    next(err);
  }
}

async function deleteUser(req, res, next) {
  try {
    if (!isElevated(req.user)) {
      return res.status(403).json({ success: false, message: 'Admin/principal only' });
    }
    if (String(req.user._id) === String(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Cannot deactivate yourself' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    user.isActive = false;
    await user.save();
    await Class.updateMany({ teacherId: user._id }, { $unset: { teacherId: 1 } });
    await logAudit({
      actorId: req.user._id,
      action: 'user.deactivate',
      entityType: 'User',
      entityId: user._id,
    });

    res.json({ success: true, message: 'User deactivated', data: user.toSafeJSON() });
  } catch (err) {
    next(err);
  }
}

module.exports = { listUsers, createTeacher, updateUser, deleteUser };
