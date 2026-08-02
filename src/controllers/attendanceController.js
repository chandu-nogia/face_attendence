const Joi = require('joi');
const rateLimit = require('express-rate-limit');
const Attendance = require('../models/Attendance');
const Student = require('../models/Student');
const Holiday = require('../models/Holiday');
const { findBestMatch } = require('../services/faceMatchService');
const { cacheGet, cacheSet, cacheDel } = require('../config/redis');
const {
  formatAttendanceDoc,
  formatAttendanceList,
  todayDateString,
  parseAmPmTimeOnDate,
  toAmPm,
  dayjs,
} = require('../services/timeFormatService');
const { emitAttendanceEvent } = require('../socket/socketHandler');
const { getSettings } = require('../services/settingsService');
const { notifyParentOfAttendance } = require('../services/notificationService');
const { logAudit } = require('../services/auditService');
const { getScopedClassIds } = require('../utils/scopeHelper');

const markLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many scan requests, slow down' },
});

function attendanceCacheKey(date, studentId) {
  return `attendance:${date}:${studentId}`;
}

async function resolveStatus(checkInTime, settings) {
  const startH = settings?.schoolStartHour ?? Number(process.env.SCHOOL_START_HOUR || 8);
  const startM = settings?.schoolStartMinute ?? Number(process.env.SCHOOL_START_MINUTE || 0);
  const lateAfter = settings?.lateAfterMinutes ?? Number(process.env.LATE_AFTER_MINUTES || 15);
  const threshold = dayjs(checkInTime)
    .hour(startH)
    .minute(startM)
    .second(0)
    .add(lateAfter, 'minute');
  return dayjs(checkInTime).isAfter(threshold) ? 'late' : 'present';
}

async function markAttendance(req, res, next) {
  try {
    const schema = Joi.object({
      embedding: Joi.array().items(Joi.number()).min(1).required(),
      classId: Joi.string().allow(null, ''),
      threshold: Joi.number().min(0).max(1).optional(),
      periodId: Joi.string().allow(null, ''),
      livenessPassed: Joi.boolean().optional(),
      deviceId: Joi.string().allow(null, ''),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.message });

    const settings = await getSettings();
    const date = todayDateString();
    const holiday = await Holiday.findOne({ date, type: 'holiday' });
    if (holiday) {
      return res.status(400).json({
        success: false,
        message: `Holiday today: ${holiday.name}. Attendance not required.`,
      });
    }

    if (settings.requireLiveness && value.livenessPassed === false) {
      return res.status(400).json({
        success: false,
        message: 'Liveness check failed. Please blink or turn head.',
      });
    }

    if (
      settings.kioskAllowedDeviceIds?.length &&
      value.deviceId &&
      !settings.kioskAllowedDeviceIds.includes(value.deviceId)
    ) {
      return res.status(403).json({ success: false, message: 'Device not authorized for kiosk' });
    }

    const threshold = value.threshold ?? settings.faceMatchThreshold;
    const match = await findBestMatch(value.embedding, value.classId || null, threshold);
    if (!match.matched) {
      return res.status(404).json({
        success: false,
        message: match.reason || 'Face not recognized',
        bestScore: match.bestScore,
      });
    }

    const student = match.student;
    const cacheKey = attendanceCacheKey(date, student._id);
    const cached = await cacheGet(cacheKey);
    if (cached) {
      return res.status(200).json({
        success: true,
        alreadyMarked: true,
        message: 'Already marked today',
        data: {
          student: { id: student._id, name: student.name, rollNo: student.rollNo },
          confidence: match.confidence,
        },
      });
    }

    const existing = await Attendance.findOne({ studentId: student._id, date, isDeleted: false });
    if (existing && existing.checkInTime) {
      await cacheSet(cacheKey, '1', 86400);
      return res.status(200).json({
        success: true,
        alreadyMarked: true,
        message: 'Already marked today',
        data: {
          attendance: formatAttendanceDoc(existing),
          student: { id: student._id, name: student.name, rollNo: student.rollNo },
          confidence: match.confidence,
        },
      });
    }

    const now = new Date();
    const status = await resolveStatus(now, settings);
    let attendance;
    if (existing) {
      existing.checkInTime = now;
      existing.status = status;
      existing.markedBy = 'face_recognition';
      existing.confidenceScore = match.confidence;
      attendance = await existing.save();
    } else {
      attendance = await Attendance.create({
        studentId: student._id,
        classId: student.classId,
        date,
        checkInTime: now,
        status,
        markedBy: 'face_recognition',
        confidenceScore: match.confidence,
      });
    }

    await cacheSet(cacheKey, '1', 86400);
    const formatted = formatAttendanceDoc(attendance);
    emitAttendanceEvent('attendance:marked', {
      attendance: formatted,
      student: { id: student._id, name: student.name, rollNo: student.rollNo },
    });

    const fullStudent = await Student.findById(student._id);
    notifyParentOfAttendance({
      student: fullStudent || student,
      event: 'checkin',
      timeLabel: toAmPm(now),
      settings,
    }).catch(() => {});

    res.status(201).json({
      success: true,
      alreadyMarked: false,
      message: `Thank you, ${student.name}`,
      data: {
        attendance: formatted,
        student: { id: student._id, name: student.name, rollNo: student.rollNo, classId: student.classId },
        confidence: match.confidence,
        checkInTime: toAmPm(now),
        status,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function checkout(req, res, next) {
  try {
    const schema = Joi.object({
      embedding: Joi.array().items(Joi.number()).min(1).required(),
      classId: Joi.string().allow(null, ''),
      threshold: Joi.number().min(0).max(1).optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.message });

    const match = await findBestMatch(value.embedding, value.classId || null, value.threshold);
    if (!match.matched) {
      return res.status(404).json({ success: false, message: match.reason || 'Face not recognized' });
    }

    const student = match.student;
    const date = todayDateString();
    const attendance = await Attendance.findOne({ studentId: student._id, date, isDeleted: false });
    if (!attendance || !attendance.checkInTime) {
      return res.status(400).json({
        success: false,
        message: 'No check-in found for today. Mark check-in first.',
      });
    }
    if (attendance.checkOutTime) {
      return res.status(200).json({
        success: true,
        alreadyCheckedOut: true,
        message: 'Already checked out today',
        data: {
          attendance: formatAttendanceDoc(attendance),
          student: { id: student._id, name: student.name },
        },
      });
    }

    attendance.checkOutTime = new Date();
    attendance.missingCheckoutFlagged = false;
    await attendance.save();

    const formatted = formatAttendanceDoc(attendance);
    emitAttendanceEvent('attendance:updated', { attendance: formatted });

    const settings = await getSettings();
    const fullStudent = await Student.findById(student._id);
    notifyParentOfAttendance({
      student: fullStudent || student,
      event: 'checkout',
      timeLabel: toAmPm(attendance.checkOutTime),
      settings,
    }).catch(() => {});

    res.json({
      success: true,
      message: `Thank you, ${student.name}. Checked out.`,
      data: {
        attendance: formatted,
        student: { id: student._id, name: student.name, rollNo: student.rollNo },
        confidence: match.confidence,
        checkOutTime: toAmPm(attendance.checkOutTime),
      },
    });
  } catch (err) {
    next(err);
  }
}

async function getToday(req, res, next) {
  try {
    const filter = { date: todayDateString(), isDeleted: false };
    if (req.query.classId) filter.classId = req.query.classId;

    const scoped = await getScopedClassIds(req.user);
    if (scoped !== null) {
      if (req.query.classId) {
        if (!scoped.map(String).includes(String(req.query.classId))) {
          return res.json({ success: true, data: [] });
        }
      } else {
        filter.classId = { $in: scoped };
      }
    }

    if (req.user.role === 'student' && req.user.studentProfileId) {
      filter.studentId = req.user.studentProfileId;
      delete filter.classId;
    }

    const records = await Attendance.find(filter)
      .populate('studentId', 'name rollNo')
      .populate('classId', 'name section')
      .sort({ checkInTime: -1 });
    res.json({ success: true, data: formatAttendanceList(records) });
  } catch (err) {
    next(err);
  }
}

async function getReport(req, res, next) {
  try {
    const filter = { isDeleted: false };
    if (req.query.studentId) filter.studentId = req.query.studentId;
    if (req.query.classId) filter.classId = req.query.classId;
    if (req.query.from || req.query.to) {
      filter.date = {};
      if (req.query.from) filter.date.$gte = req.query.from;
      if (req.query.to) filter.date.$lte = req.query.to;
    }
    const records = await Attendance.find(filter)
      .populate('studentId', 'name rollNo')
      .populate('classId', 'name section')
      .sort({ date: -1 });
    res.json({ success: true, data: formatAttendanceList(records) });
  } catch (err) {
    next(err);
  }
}

async function updateAttendance(req, res, next) {
  try {
    const attendance = await Attendance.findById(req.params.id);
    if (!attendance || attendance.isDeleted) {
      return res.status(404).json({ success: false, message: 'Attendance not found' });
    }

    const fields = ['status', 'checkInTime', 'checkOutTime'];
    for (const field of fields) {
      if (req.body[field] === undefined) continue;
      let newValue = req.body[field];
      if ((field === 'checkInTime' || field === 'checkOutTime') && typeof newValue === 'string') {
        if (/^\d{1,2}:\d{2}\s?(AM|PM)$/i.test(newValue.trim())) {
          newValue = parseAmPmTimeOnDate(attendance.date, newValue.trim().toUpperCase());
        } else {
          newValue = new Date(newValue);
        }
      }
      attendance.editHistory.push({
        editedBy: req.user._id,
        editedAt: new Date(),
        field,
        oldValue: attendance[field],
        newValue,
        reason: req.body.reason || 'Manual edit',
      });
      attendance[field] = newValue;
    }

    await attendance.save();
    await logAudit({
      actorId: req.user._id,
      action: 'attendance.edit',
      entityType: 'Attendance',
      entityId: attendance._id,
      meta: req.body,
    });
    const formatted = formatAttendanceDoc(attendance);
    emitAttendanceEvent('attendance:updated', { attendance: formatted });
    res.json({ success: true, data: formatted });
  } catch (err) {
    next(err);
  }
}

async function softDeleteAttendance(req, res, next) {
  try {
    const reason = req.body.reason;
    if (!reason) {
      return res.status(400).json({ success: false, message: 'Delete reason is mandatory' });
    }
    const attendance = await Attendance.findById(req.params.id);
    if (!attendance || attendance.isDeleted) {
      return res.status(404).json({ success: false, message: 'Attendance not found' });
    }

    attendance.editHistory.push({
      editedBy: req.user._id,
      editedAt: new Date(),
      field: 'isDeleted',
      oldValue: false,
      newValue: true,
      reason,
    });
    attendance.isDeleted = true;
    attendance.deleteReason = reason;
    await attendance.save();
    await cacheDel(attendanceCacheKey(attendance.date, attendance.studentId));

    emitAttendanceEvent('attendance:updated', { attendance: formatAttendanceDoc(attendance) });
    res.json({ success: true, message: 'Attendance soft-deleted', data: formatAttendanceDoc(attendance) });
  } catch (err) {
    next(err);
  }
}

async function readdAttendance(req, res, next) {
  try {
    const attendance = await Attendance.findById(req.params.id);
    if (!attendance) return res.status(404).json({ success: false, message: 'Attendance not found' });
    if (!attendance.isDeleted) {
      return res.status(400).json({ success: false, message: 'Record is not deleted' });
    }

    attendance.editHistory.push({
      editedBy: req.user._id,
      editedAt: new Date(),
      field: 'isDeleted',
      oldValue: true,
      newValue: false,
      reason: req.body.reason || 'Re-added',
    });
    attendance.isDeleted = false;
    attendance.deleteReason = undefined;
    await attendance.save();

    if (attendance.checkInTime) {
      await cacheSet(attendanceCacheKey(attendance.date, attendance.studentId), '1', 86400);
    }

    emitAttendanceEvent('attendance:updated', { attendance: formatAttendanceDoc(attendance) });
    res.json({ success: true, data: formatAttendanceDoc(attendance) });
  } catch (err) {
    next(err);
  }
}

async function bulkUpdate(req, res, next) {
  try {
    const schema = Joi.object({
      classId: Joi.string().required(),
      date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).default(todayDateString()),
      status: Joi.string().valid('present', 'absent', 'late', 'half-day', 'leave').required(),
      reason: Joi.string().allow('', null),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.message });

    const students = await Student.find({ classId: value.classId, status: 'active' });
    const results = [];
    for (const student of students) {
      let attendance = await Attendance.findOne({ studentId: student._id, date: value.date });
      if (!attendance) {
        attendance = new Attendance({
          studentId: student._id,
          classId: value.classId,
          date: value.date,
          status: value.status,
          markedBy: 'manual',
          checkInTime: value.status !== 'absent' ? new Date() : undefined,
        });
      } else {
        attendance.editHistory.push({
          editedBy: req.user._id,
          editedAt: new Date(),
          field: 'status',
          oldValue: attendance.status,
          newValue: value.status,
          reason: value.reason || 'Bulk update',
        });
        attendance.status = value.status;
        attendance.isDeleted = false;
      }
      await attendance.save();
      results.push(formatAttendanceDoc(attendance));
    }
    emitAttendanceEvent('attendance:updated', { bulk: true, count: results.length });
    res.json({ success: true, data: { updated: results.length, records: results } });
  } catch (err) {
    next(err);
  }
}

async function getDefaulters(req, res, next) {
  try {
    const threshold = Number(req.query.threshold || 75);
    const from = req.query.from || dayjs().startOf('month').format('YYYY-MM-DD');
    const to = req.query.to || dayjs().format('YYYY-MM-DD');
    const filter = { date: { $gte: from, $lte: to }, isDeleted: false };
    if (req.query.classId) filter.classId = req.query.classId;

    const records = await Attendance.find(filter).populate('studentId', 'name rollNo classId');
    const stats = {};
    for (const r of records) {
      const sid = String(r.studentId?._id || r.studentId);
      if (!stats[sid]) {
        stats[sid] = {
          student: r.studentId,
          total: 0,
          presentDays: 0,
        };
      }
      stats[sid].total += 1;
      if (['present', 'late', 'half-day'].includes(r.status)) {
        stats[sid].presentDays += r.status === 'half-day' ? 0.5 : 1;
      }
    }

    const defaulters = Object.values(stats)
      .map((s) => ({
        ...s,
        percent: s.total > 0 ? Number(((s.presentDays / s.total) * 100).toFixed(1)) : 0,
      }))
      .filter((s) => s.percent < threshold)
      .sort((a, b) => a.percent - b.percent);

    res.json({ success: true, data: { threshold, from, to, defaulters } });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  markLimiter,
  markAttendance,
  checkout,
  getToday,
  getReport,
  updateAttendance,
  softDeleteAttendance,
  readdAttendance,
  bulkUpdate,
  getDefaulters,
};
