const Joi = require('joi');
const Class = require('../models/Class');
const User = require('../models/User');
const { getScopedClassIds, assertClassAccess, isElevated } = require('../utils/scopeHelper');

async function createClass(req, res, next) {
  try {
    const schema = Joi.object({
      name: Joi.string().trim().min(1).required(),
      section: Joi.string().allow('', null),
      teacherId: Joi.string().allow(null, ''),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.message });

    const payload = {
      name: value.name,
      section: value.section || '',
    };
    if (value.teacherId) payload.teacherId = value.teacherId;

    const klass = await Class.create(payload);
    if (value.teacherId) {
      await User.findByIdAndUpdate(value.teacherId, {
        $addToSet: { classesAssigned: klass._id },
      });
    }
    res.status(201).json({ success: true, data: klass });
  } catch (err) {
    next(err);
  }
}

async function listClasses(req, res, next) {
  try {
    const filter = {};
    const scoped = await getScopedClassIds(req.user);
    if (scoped !== null) {
      filter._id = { $in: scoped };
    }
    const classes = await Class.find(filter)
      .populate('teacherId', 'name email')
      .populate('students', 'name rollNo status');
    res.json({ success: true, data: classes });
  } catch (err) {
    next(err);
  }
}

async function getClass(req, res, next) {
  try {
    const allowed = await assertClassAccess(req.user, req.params.id);
    if (!allowed) return res.status(403).json({ success: false, message: 'Access denied' });

    const klass = await Class.findById(req.params.id)
      .populate('teacherId', 'name email')
      .populate('students', 'name rollNo status parentContact');
    if (!klass) return res.status(404).json({ success: false, message: 'Class not found' });
    res.json({ success: true, data: klass });
  } catch (err) {
    next(err);
  }
}

async function updateClass(req, res, next) {
  try {
    const allowed = ['name', 'section', 'teacherId'];
    const updates = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k] || null;
    }
    const existing = await Class.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Class not found' });

    const oldTeacher = existing.teacherId ? String(existing.teacherId) : null;
    const klass = await Class.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    })
      .populate('teacherId', 'name email')
      .populate('students', 'name rollNo status');

    if (updates.teacherId !== undefined) {
      if (oldTeacher) {
        await User.findByIdAndUpdate(oldTeacher, {
          $pull: { classesAssigned: klass._id },
        });
      }
      if (updates.teacherId) {
        await User.findByIdAndUpdate(updates.teacherId, {
          $addToSet: { classesAssigned: klass._id },
        });
      }
    }

    res.json({ success: true, data: klass });
  } catch (err) {
    next(err);
  }
}

async function deleteClass(req, res, next) {
  try {
    if (!isElevated(req.user)) {
      return res.status(403).json({ success: false, message: 'Admin/principal only' });
    }
    const klass = await Class.findById(req.params.id);
    if (!klass) return res.status(404).json({ success: false, message: 'Class not found' });
    if (klass.students?.length) {
      return res.status(400).json({
        success: false,
        message: 'Move or delete students before deleting class',
      });
    }
    await User.updateMany({}, { $pull: { classesAssigned: klass._id } });
    await Class.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Class deleted' });
  } catch (err) {
    next(err);
  }
}

module.exports = { createClass, listClasses, getClass, updateClass, deleteClass };
