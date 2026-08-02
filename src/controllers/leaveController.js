const Joi = require('joi');
const LeaveRequest = require('../models/LeaveRequest');
const Attendance = require('../models/Attendance');
const Student = require('../models/Student');
const User = require('../models/User');
const Class = require('../models/Class');
const { createNotification } = require('../services/notificationService');
const { logAudit } = require('../services/auditService');
const { dayjs } = require('../services/timeFormatService');
const {
  isElevated,
  getScopedClassIds,
  assertStudentAccess,
  isClassTeacherOfStudent,
} = require('../utils/scopeHelper');

async function applyLeaveToAttendance(leave) {
  const student = leave.studentId.classId
    ? leave.studentId
    : await Student.findById(leave.studentId._id || leave.studentId);
  let cursor = dayjs(leave.fromDate);
  const end = dayjs(leave.toDate);
  while (cursor.isBefore(end) || cursor.isSame(end, 'day')) {
    const date = cursor.format('YYYY-MM-DD');
    await Attendance.findOneAndUpdate(
      { studentId: student._id, date },
      {
        studentId: student._id,
        classId: student.classId,
        date,
        status: 'leave',
        markedBy: 'manual',
        isDeleted: false,
      },
      { upsert: true, new: true }
    );
    cursor = cursor.add(1, 'day');
  }
}

async function notifyClassTeachers(student, title, body, data) {
  const classId = student.classId?._id || student.classId;
  const klass = await Class.findById(classId);
  const teacherIds = new Set();
  if (klass?.teacherId) teacherIds.add(String(klass.teacherId));
  const assigned = await User.find({
    role: 'teacher',
    classesAssigned: classId,
  }).select('_id');
  assigned.forEach((t) => teacherIds.add(String(t._id)));
  for (const tid of teacherIds) {
    await createNotification({ userId: tid, title, body, type: 'leave', data });
  }
}

async function notifyAdmins(title, body, data) {
  const admins = await User.find({
    role: { $in: ['admin', 'principal'] },
    isActive: true,
  }).select('_id');
  for (const a of admins) {
    await createNotification({ userId: a._id, title, body, type: 'leave', data });
  }
}

async function submitLeave(req, res, next) {
  try {
    const schema = Joi.object({
      studentId: Joi.string().required(),
      fromDate: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
      toDate: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
      leaveType: Joi.string().valid('medical', 'casual', 'emergency', 'other').default('casual'),
      reason: Joi.string().required(),
      proofUrl: Joi.string().allow('', null),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.message });

    const student = await Student.findById(value.studentId);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

    const allowed = await assertStudentAccess(req.user, student._id);
    // Teachers/admins can also submit on behalf
    if (!allowed && !['admin', 'principal', 'teacher'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Not allowed for this student' });
    }
    if (req.user.role === 'teacher') {
      const ok = await isClassTeacherOfStudent(req.user, student);
      if (!ok) return res.status(403).json({ success: false, message: 'Not your class student' });
    }
    if (req.user.role === 'student') {
      if (String(req.user.studentProfileId) !== String(student._id)) {
        return res.status(403).json({ success: false, message: 'Can only request leave for yourself' });
      }
    }

    const leave = await LeaveRequest.create({
      ...value,
      requestedBy: req.user._id,
      status: 'pending_teacher',
    });

    await notifyClassTeachers(
      student,
      'New leave request',
      `${student.name}: ${value.reason}`,
      { leaveId: String(leave._id) }
    );

    await logAudit({
      actorId: req.user._id,
      action: 'leave.submit',
      entityType: 'LeaveRequest',
      entityId: leave._id,
    });

    res.status(201).json({ success: true, data: leave });
  } catch (err) {
    next(err);
  }
}

async function listLeaves(req, res, next) {
  try {
    const filter = {};
    if (req.query.status) {
      if (req.query.status === 'pending') {
        filter.status = { $in: ['pending', 'pending_teacher', 'pending_admin'] };
      } else {
        filter.status = req.query.status;
      }
    }
    if (req.query.studentId) filter.studentId = req.query.studentId;

    if (req.user.role === 'parent') {
      const kids = await Student.find({
        $or: [
          { parentUserId: req.user._id },
          { _id: { $in: req.user.linkedStudents || [] } },
          { parentEmail: req.user.email },
        ],
      }).select('_id');
      filter.studentId = { $in: kids.map((k) => k._id) };
    } else if (req.user.role === 'student') {
      filter.studentId = req.user.studentProfileId;
    } else if (req.user.role === 'teacher') {
      const classIds = await getScopedClassIds(req.user);
      const students = await Student.find({ classId: { $in: classIds || [] } }).select('_id');
      filter.studentId = { $in: students.map((s) => s._id) };
      if (req.query.queue === 'teacher') {
        filter.status = { $in: ['pending_teacher', 'pending'] };
      }
    } else if (isElevated(req.user) && req.query.queue === 'admin') {
      filter.status = 'pending_admin';
    }

    const data = await LeaveRequest.find(filter)
      .populate('studentId', 'name rollNo classId')
      .populate('requestedBy', 'name email role')
      .populate('reviewedBy', 'name')
      .populate('teacherReview.by', 'name')
      .populate('adminReview.by', 'name')
      .sort({ createdAt: -1 });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/** Class teacher first step */
async function teacherReview(req, res, next) {
  try {
    const decision = req.params.action === 'approve' ? 'approve' : 'reject';
    const leave = await LeaveRequest.findById(req.params.id).populate('studentId');
    if (!leave) return res.status(404).json({ success: false, message: 'Leave not found' });

    const statusOk =
      leave.status === 'pending_teacher' || leave.status === 'pending';
    if (!statusOk) {
      return res.status(400).json({
        success: false,
        message: `Cannot teacher-review in status: ${leave.status}`,
      });
    }

    if (req.user.role === 'teacher') {
      const ok = await isClassTeacherOfStudent(req.user, leave.studentId);
      if (!ok) return res.status(403).json({ success: false, message: 'Not class teacher' });
    }

    leave.teacherReview = {
      by: req.user._id,
      at: new Date(),
      note: req.body.note || '',
      decision,
    };

    if (decision === 'reject') {
      leave.status = 'rejected';
      leave.reviewedBy = req.user._id;
      leave.reviewedAt = new Date();
      leave.reviewNote = req.body.note || 'Rejected by class teacher';
      await leave.save();
      await createNotification({
        userId: leave.requestedBy,
        title: 'Leave rejected by teacher',
        body: leave.reviewNote,
        type: 'leave',
        data: { leaveId: String(leave._id) },
      });
    } else {
      leave.status = 'pending_admin';
      await leave.save();
      await notifyAdmins(
        'Leave awaiting admin approval',
        `${leave.studentId.name} — teacher approved`,
        { leaveId: String(leave._id) }
      );
      await createNotification({
        userId: leave.requestedBy,
        title: 'Leave forwarded to admin',
        body: 'Class teacher approved. Waiting for admin/principal.',
        type: 'leave',
        data: { leaveId: String(leave._id) },
      });
    }

    await logAudit({
      actorId: req.user._id,
      action: `leave.teacher_${decision}`,
      entityType: 'LeaveRequest',
      entityId: leave._id,
    });

    res.json({ success: true, data: leave });
  } catch (err) {
    next(err);
  }
}

/** Admin / principal final step */
async function adminReview(req, res, next) {
  try {
    const decision = req.params.action === 'approve' ? 'approve' : 'reject';
    const leave = await LeaveRequest.findById(req.params.id).populate('studentId');
    if (!leave) return res.status(404).json({ success: false, message: 'Leave not found' });

    // Admin can also fast-track from pending_teacher
    const statusOk =
      leave.status === 'pending_admin' ||
      leave.status === 'pending_teacher' ||
      leave.status === 'pending';
    if (!statusOk) {
      return res.status(400).json({
        success: false,
        message: `Cannot admin-review in status: ${leave.status}`,
      });
    }

    leave.adminReview = {
      by: req.user._id,
      at: new Date(),
      note: req.body.note || '',
      decision,
    };
    leave.reviewedBy = req.user._id;
    leave.reviewedAt = new Date();
    leave.reviewNote = req.body.note || (decision === 'approve' ? 'Approved' : 'Rejected');
    leave.status = decision === 'approve' ? 'approved' : 'rejected';
    await leave.save();

    if (decision === 'approve') {
      await applyLeaveToAttendance(leave);
    }

    await createNotification({
      userId: leave.requestedBy,
      title: `Leave ${leave.status}`,
      body: leave.reviewNote,
      type: 'leave',
      data: { leaveId: String(leave._id) },
    });

    await logAudit({
      actorId: req.user._id,
      action: `leave.admin_${decision}`,
      entityType: 'LeaveRequest',
      entityId: leave._id,
    });

    res.json({ success: true, data: leave });
  } catch (err) {
    next(err);
  }
}

/** Legacy wrapper — routes teacher vs admin by role/status */
async function reviewLeave(req, res, next) {
  try {
    const leave = await LeaveRequest.findById(req.params.id);
    if (!leave) return res.status(404).json({ success: false, message: 'Leave not found' });

    if (isElevated(req.user)) {
      return adminReview(req, res, next);
    }
    if (
      req.user.role === 'teacher' &&
      (leave.status === 'pending_teacher' || leave.status === 'pending')
    ) {
      return teacherReview(req, res, next);
    }
    return res.status(403).json({ success: false, message: 'Cannot review at this stage' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  submitLeave,
  listLeaves,
  teacherReview,
  adminReview,
  reviewLeave,
};
