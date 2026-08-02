const Joi = require('joi');
const RegularizationRequest = require('../models/RegularizationRequest');
const Attendance = require('../models/Attendance');
const Student = require('../models/Student');
const User = require('../models/User');
const Class = require('../models/Class');
const { formatAttendanceDoc } = require('../services/timeFormatService');
const { createNotification } = require('../services/notificationService');
const { emitAttendanceEvent } = require('../socket/socketHandler');
const { logAudit } = require('../services/auditService');
const {
  isElevated,
  getScopedClassIds,
  isClassTeacherOfStudent,
} = require('../utils/scopeHelper');

async function applyRegularization(request, body, userId) {
  if (!request.attendanceId) return;
  const attendance = await Attendance.findById(request.attendanceId);
  if (!attendance) return;
  attendance.isRegularized = true;
  if (body.status) {
    attendance.editHistory.push({
      editedBy: userId,
      editedAt: new Date(),
      field: 'status',
      oldValue: attendance.status,
      newValue: body.status,
      reason: `Regularization approved: ${request.reason}`,
    });
    attendance.status = body.status;
  }
  if (body.checkInTime) attendance.checkInTime = new Date(body.checkInTime);
  await attendance.save();
  emitAttendanceEvent('attendance:updated', {
    attendance: formatAttendanceDoc(attendance),
  });
}

async function createRequest(req, res, next) {
  try {
    const schema = Joi.object({
      studentId: Joi.string().required(),
      attendanceId: Joi.string().allow(null, ''),
      reason: Joi.string().min(5).required(),
      proofUrl: Joi.string().allow('', null),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.message });

    const request = await RegularizationRequest.create({
      ...value,
      requestedBy: req.user._id,
      status: 'pending_teacher',
    });

    const student = await Student.findById(value.studentId);
    if (student) {
      const classId = student.classId;
      const klass = await Class.findById(classId);
      const tids = new Set();
      if (klass?.teacherId) tids.add(String(klass.teacherId));
      const assigned = await User.find({ role: 'teacher', classesAssigned: classId }).select('_id');
      assigned.forEach((t) => tids.add(String(t._id)));
      for (const tid of tids) {
        await createNotification({
          userId: tid,
          title: 'Regularization pending',
          body: `${student.name}: ${value.reason}`,
          type: 'regularization',
          data: { id: String(request._id) },
        });
      }
    }

    res.status(201).json({ success: true, data: request });
  } catch (err) {
    next(err);
  }
}

async function getPending(req, res, next) {
  try {
    let filter = {};
    if (req.user.role === 'teacher') {
      filter.status = { $in: ['pending_teacher', 'pending'] };
      const classIds = await getScopedClassIds(req.user);
      const students = await Student.find({ classId: { $in: classIds || [] } }).select('_id');
      filter.studentId = { $in: students.map((s) => s._id) };
    } else if (isElevated(req.user)) {
      const queue = req.query.queue || 'all';
      if (queue === 'teacher') {
        filter.status = { $in: ['pending_teacher', 'pending'] };
      } else if (queue === 'principal') {
        filter.status = 'pending_principal';
      } else {
        filter.status = {
          $in: ['pending_teacher', 'pending_principal', 'pending'],
        };
      }
    } else {
      filter.status = { $in: ['pending_teacher', 'pending_principal', 'pending'] };
    }

    const requests = await RegularizationRequest.find(filter)
      .populate('studentId', 'name rollNo classId')
      .populate('attendanceId')
      .populate('teacherReview.by', 'name')
      .sort({ requestedAt: -1 });
    res.json({ success: true, data: requests });
  } catch (err) {
    next(err);
  }
}

async function listAll(req, res, next) {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.studentId) filter.studentId = req.query.studentId;

    if (req.user.role === 'teacher') {
      const classIds = await getScopedClassIds(req.user);
      const students = await Student.find({ classId: { $in: classIds || [] } }).select('_id');
      filter.studentId = { $in: students.map((s) => s._id) };
    }

    const requests = await RegularizationRequest.find(filter)
      .populate('studentId', 'name rollNo')
      .populate('reviewedBy', 'name')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: requests });
  } catch (err) {
    next(err);
  }
}

async function teacherReview(req, res, next) {
  try {
    const decision = req.params.action === 'approve' ? 'approve' : 'reject';
    const request = await RegularizationRequest.findById(req.params.id).populate('studentId');
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });

    const statusOk =
      request.status === 'pending_teacher' || request.status === 'pending';
    if (!statusOk) {
      return res.status(400).json({ success: false, message: 'Not awaiting teacher review' });
    }

    if (req.user.role === 'teacher') {
      const ok = await isClassTeacherOfStudent(req.user, request.studentId);
      if (!ok) return res.status(403).json({ success: false, message: 'Not class teacher' });
    }

    request.teacherReview = {
      by: req.user._id,
      at: new Date(),
      note: req.body.note || '',
      decision,
    };

    if (decision === 'reject') {
      request.status = 'rejected';
      request.reviewedBy = req.user._id;
      request.reviewedAt = new Date();
      request.reviewNote = req.body.note || 'Rejected by teacher';
      await request.save();
      if (request.requestedBy) {
        await createNotification({
          userId: request.requestedBy,
          title: 'Regularization Rejected',
          body: request.reviewNote,
          type: 'regularization',
        });
      }
    } else {
      request.status = 'pending_principal';
      await request.save();
      const principals = await User.find({
        role: { $in: ['principal', 'admin'] },
        isActive: true,
      }).select('_id');
      for (const p of principals) {
        await createNotification({
          userId: p._id,
          title: 'Regularization awaiting principal',
          body: `${request.studentId?.name || 'Student'} — teacher approved`,
          type: 'regularization',
          data: { id: String(request._id) },
        });
      }
    }

    await logAudit({
      actorId: req.user._id,
      action: `regularization.teacher_${decision}`,
      entityType: 'RegularizationRequest',
      entityId: request._id,
    });

    res.json({ success: true, data: request });
  } catch (err) {
    next(err);
  }
}

async function principalReview(req, res, next) {
  try {
    const decision = req.params.action === 'approve' ? 'approve' : 'reject';
    const request = await RegularizationRequest.findById(req.params.id).populate('studentId');
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });

    const statusOk =
      request.status === 'pending_principal' ||
      request.status === 'pending_teacher' ||
      request.status === 'pending';
    if (!statusOk) {
      return res.status(400).json({ success: false, message: 'Not awaiting principal review' });
    }

    request.principalReview = {
      by: req.user._id,
      at: new Date(),
      note: req.body.note || '',
      decision,
    };
    request.reviewedBy = req.user._id;
    request.reviewedAt = new Date();
    request.reviewNote = req.body.note || (decision === 'approve' ? 'Approved' : 'Rejected');
    request.status = decision === 'approve' ? 'approved' : 'rejected';
    await request.save();

    if (decision === 'approve') {
      await applyRegularization(request, req.body, req.user._id);
    }

    if (request.requestedBy) {
      await createNotification({
        userId: request.requestedBy,
        title: `Regularization ${request.status}`,
        body: request.reviewNote,
        type: 'regularization',
      });
    }

    await logAudit({
      actorId: req.user._id,
      action: `regularization.principal_${decision}`,
      entityType: 'RegularizationRequest',
      entityId: request._id,
    });

    res.json({ success: true, data: request });
  } catch (err) {
    next(err);
  }
}

/** Legacy approve/reject — dispatch by role */
async function approve(req, res, next) {
  req.params.action = 'approve';
  if (isElevated(req.user)) return principalReview(req, res, next);
  return teacherReview(req, res, next);
}

async function reject(req, res, next) {
  req.params.action = 'reject';
  if (isElevated(req.user)) return principalReview(req, res, next);
  return teacherReview(req, res, next);
}

module.exports = {
  createRequest,
  getPending,
  listAll,
  teacherReview,
  principalReview,
  approve,
  reject,
};
