const Joi = require('joi');
const LeaveRequest = require('../models/LeaveRequest');
const Attendance = require('../models/Attendance');
const Student = require('../models/Student');
const { createNotification } = require('../services/notificationService');
const { logAudit } = require('../services/auditService');
const { dayjs } = require('../services/timeFormatService');

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

    // Parent can only request for linked students
    if (req.user.role === 'parent') {
      const linked = (req.user.linkedStudents || []).map(String);
      if (!linked.includes(String(student._id)) && String(student.parentUserId) !== String(req.user._id)) {
        return res.status(403).json({ success: false, message: 'Not your student' });
      }
    }

    const leave = await LeaveRequest.create({
      ...value,
      requestedBy: req.user._id,
    });

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
    if (req.query.status) filter.status = req.query.status;
    if (req.query.studentId) filter.studentId = req.query.studentId;
    if (req.user.role === 'parent') {
      filter.requestedBy = req.user._id;
    }
    const data = await LeaveRequest.find(filter)
      .populate('studentId', 'name rollNo classId')
      .populate('requestedBy', 'name email role')
      .populate('reviewedBy', 'name')
      .sort({ createdAt: -1 });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function reviewLeave(req, res, next) {
  try {
    const status = req.params.action === 'approve' ? 'approved' : 'rejected';
    const leave = await LeaveRequest.findById(req.params.id).populate('studentId');
    if (!leave) return res.status(404).json({ success: false, message: 'Leave not found' });
    if (leave.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Already reviewed' });
    }

    leave.status = status;
    leave.reviewedBy = req.user._id;
    leave.reviewedAt = new Date();
    leave.reviewNote = req.body.note || '';
    await leave.save();

    if (status === 'approved') {
      let cursor = dayjs(leave.fromDate);
      const end = dayjs(leave.toDate);
      while (cursor.isBefore(end) || cursor.isSame(end, 'day')) {
        const date = cursor.format('YYYY-MM-DD');
        await Attendance.findOneAndUpdate(
          { studentId: leave.studentId._id || leave.studentId, date },
          {
            studentId: leave.studentId._id || leave.studentId,
            classId: leave.studentId.classId,
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

    await createNotification({
      userId: leave.requestedBy,
      title: `Leave ${status}`,
      body: `Your leave request was ${status}`,
      type: 'leave',
      data: { leaveId: String(leave._id) },
    });

    await logAudit({
      actorId: req.user._id,
      action: `leave.${status}`,
      entityType: 'LeaveRequest',
      entityId: leave._id,
    });

    res.json({ success: true, data: leave });
  } catch (err) {
    next(err);
  }
}

module.exports = { submitLeave, listLeaves, reviewLeave };
