const Joi = require('joi');
const bcrypt = require('bcryptjs');
const Student = require('../models/Student');
const User = require('../models/User');
const {
  generateAccessToken,
  generateRefreshToken,
} = require('../utils/generateToken');
const { logAudit } = require('../services/auditService');

/**
 * Parent links to student using rollNo + school-generated PIN.
 * Creates parent account if needed, or links to existing parent login.
 */
async function linkParent(req, res, next) {
  try {
    const schema = Joi.object({
      rollNo: Joi.string().required(),
      pin: Joi.string().length(6).required(),
      classId: Joi.string().allow('', null),
      name: Joi.string().min(2).required(),
      phone: Joi.string().allow('', null),
      email: Joi.string().email().required(),
      password: Joi.string().min(6).required(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.message });

    const studentFilter = { rollNo: value.rollNo.trim() };
    if (value.classId) studentFilter.classId = value.classId;

    const matches = await Student.find(studentFilter);
    if (!matches.length) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    if (matches.length > 1 && !value.classId) {
      return res.status(400).json({
        success: false,
        message: 'Multiple students with this roll no. Provide classId.',
        data: matches.map((s) => ({
          id: s._id,
          name: s.name,
          classId: s.classId,
        })),
      });
    }

    const student = matches[0];
    if (!student.parentLinkPinHash || !student.parentLinkPinExpires) {
      return res.status(400).json({
        success: false,
        message: 'No active PIN. Ask school to generate a parent link PIN.',
      });
    }
    if (new Date() > new Date(student.parentLinkPinExpires)) {
      return res.status(400).json({ success: false, message: 'PIN expired' });
    }
    const pinOk = await bcrypt.compare(value.pin, student.parentLinkPinHash);
    if (!pinOk) {
      return res.status(401).json({ success: false, message: 'Invalid PIN' });
    }

    let user = await User.findOne({ email: value.email.toLowerCase() });
    if (user) {
      if (user.role !== 'parent') {
        return res.status(409).json({
          success: false,
          message: 'Email already registered with another role',
        });
      }
      const passOk = await user.comparePassword(value.password);
      if (!passOk) {
        return res.status(401).json({ success: false, message: 'Wrong password for existing account' });
      }
    } else {
      const passwordHash = await User.hashPassword(value.password);
      user = await User.create({
        name: value.name,
        email: value.email.toLowerCase(),
        passwordHash,
        role: 'parent',
        phone: value.phone,
        linkedStudents: [],
      });
    }

    student.parentUserId = user._id;
    student.parentContact = value.phone || student.parentContact;
    student.parentEmail = user.email;
    student.parentLinkPinHash = undefined;
    student.parentLinkPinExpires = undefined;
    student.parentLinkedAt = new Date();
    await student.save();

    await User.findByIdAndUpdate(user._id, {
      $addToSet: { linkedStudents: student._id },
    });
    user = await User.findById(user._id);

    await logAudit({
      actorId: user._id,
      action: 'parent.link',
      entityType: 'Student',
      entityId: student._id,
    });

    const payload = { id: user._id, role: user.role };
    res.status(201).json({
      success: true,
      message: `Linked to ${student.name}`,
      data: {
        user: user.toSafeJSON(),
        student: {
          id: student._id,
          name: student.name,
          rollNo: student.rollNo,
          classId: student.classId,
        },
        accessToken: generateAccessToken(payload),
        refreshToken: generateRefreshToken(payload),
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Create student login linked to Student profile (admin/teacher).
 */
async function createStudentLogin(req, res, next) {
  try {
    const schema = Joi.object({
      studentId: Joi.string().required(),
      email: Joi.string().email().required(),
      password: Joi.string().min(6).required(),
      name: Joi.string().allow('', null),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.message });

    const student = await Student.findById(value.studentId);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

    const exists = await User.findOne({ email: value.email.toLowerCase() });
    if (exists) return res.status(409).json({ success: false, message: 'Email already used' });

    const passwordHash = await User.hashPassword(value.password);
    const user = await User.create({
      name: value.name || student.name,
      email: value.email.toLowerCase(),
      passwordHash,
      role: 'student',
      studentProfileId: student._id,
    });

    res.status(201).json({ success: true, data: user.toSafeJSON() });
  } catch (err) {
    next(err);
  }
}

module.exports = { linkParent, createStudentLogin };
