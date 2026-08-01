const Joi = require('joi');
const RegularizationRequest = require('../models/RegularizationRequest');
const Attendance = require('../models/Attendance');
const { formatAttendanceDoc } = require('../services/timeFormatService');
const { createNotification } = require('../services/notificationService');
const { emitAttendanceEvent } = require('../socket/socketHandler');

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
    });
    res.status(201).json({ success: true, data: request });
  } catch (err) {
    next(err);
  }
}

async function getPending(req, res, next) {
  try {
    const filter = { status: 'pending' };
    const requests = await RegularizationRequest.find(filter)
      .populate('studentId', 'name rollNo classId')
      .populate('attendanceId')
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
    const requests = await RegularizationRequest.find(filter)
      .populate('studentId', 'name rollNo')
      .populate('reviewedBy', 'name')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: requests });
  } catch (err) {
    next(err);
  }
}

async function approve(req, res, next) {
  try {
    const request = await RegularizationRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
    if (request.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Request already reviewed' });
    }

    request.status = 'approved';
    request.reviewedBy = req.user._id;
    request.reviewedAt = new Date();
    request.reviewNote = req.body.note || 'Approved';
    await request.save();

    if (request.attendanceId) {
      const attendance = await Attendance.findById(request.attendanceId);
      if (attendance) {
        attendance.isRegularized = true;
        if (req.body.status) {
          attendance.editHistory.push({
            editedBy: req.user._id,
            editedAt: new Date(),
            field: 'status',
            oldValue: attendance.status,
            newValue: req.body.status,
            reason: `Regularization approved: ${request.reason}`,
          });
          attendance.status = req.body.status;
        }
        if (req.body.checkInTime) {
          attendance.checkInTime = new Date(req.body.checkInTime);
        }
        await attendance.save();
        emitAttendanceEvent('attendance:updated', {
          attendance: formatAttendanceDoc(attendance),
        });
      }
    }

    await createNotification({
      userId: request.requestedBy,
      title: 'Regularization Approved',
      body: request.reviewNote,
      type: 'regularization',
    });

    res.json({ success: true, data: request });
  } catch (err) {
    next(err);
  }
}

async function reject(req, res, next) {
  try {
    const request = await RegularizationRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
    if (request.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Request already reviewed' });
    }

    request.status = 'rejected';
    request.reviewedBy = req.user._id;
    request.reviewedAt = new Date();
    request.reviewNote = req.body.note || 'Rejected';
    await request.save();

    await createNotification({
      userId: request.requestedBy,
      title: 'Regularization Rejected',
      body: request.reviewNote,
      type: 'regularization',
    });

    res.json({ success: true, data: request });
  } catch (err) {
    next(err);
  }
}

module.exports = { createRequest, getPending, listAll, approve, reject };
