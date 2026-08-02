const Joi = require('joi');
const Holiday = require('../models/Holiday');
const Period = require('../models/Period');
const { getSettings, invalidateSettingsCache } = require('../services/settingsService');
const { listAuditLogs, logAudit } = require('../services/auditService');
const { buildTimingSummary } = require('../services/timingService');

async function getSchoolSettings(req, res, next) {
  try {
    const data = await getSettings();
    const json = data.toObject ? data.toObject() : { ...data };
    json.timingSummary = buildTimingSummary(json);
    res.json({ success: true, data: json });
  } catch (err) {
    next(err);
  }
}

async function updateSchoolSettings(req, res, next) {
  try {
    const allowed = [
      'schoolStartHour',
      'schoolStartMinute',
      'schoolEndHour',
      'schoolEndMinute',
      'lateAfterMinutes',
      'checkInOpensMinutesBefore',
      'earlyLeaveMinutes',
      'checkoutGraceMinutes',
      'blockCheckInAfterLateMinutes',
      'halfDayAfterHours',
      'autoAbsentHour',
      'autoAbsentMinute',
      'faceMatchThreshold',
      'requireLiveness',
      'notifyParentOnCheckIn',
      'notifyParentOnAbsent',
      'notifyViaWhatsApp',
      'notifyViaSms',
      'kioskAllowedDeviceIds',
      'periodWiseEnabled',
      'allowTeacherEnrollStudents',
      'regularizationEscalateHours',
    ];
    const updates = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }

    // Basic validation for time fields
    const clamp = (v, min, max) => Math.min(max, Math.max(min, Number(v)));
    if (updates.schoolStartHour !== undefined) updates.schoolStartHour = clamp(updates.schoolStartHour, 0, 23);
    if (updates.schoolEndHour !== undefined) updates.schoolEndHour = clamp(updates.schoolEndHour, 0, 23);
    if (updates.schoolStartMinute !== undefined) updates.schoolStartMinute = clamp(updates.schoolStartMinute, 0, 59);
    if (updates.schoolEndMinute !== undefined) updates.schoolEndMinute = clamp(updates.schoolEndMinute, 0, 59);
    if (updates.autoAbsentHour !== undefined) updates.autoAbsentHour = clamp(updates.autoAbsentHour, 0, 23);
    if (updates.autoAbsentMinute !== undefined) updates.autoAbsentMinute = clamp(updates.autoAbsentMinute, 0, 59);
    if (updates.lateAfterMinutes !== undefined) updates.lateAfterMinutes = clamp(updates.lateAfterMinutes, 0, 240);
    if (updates.checkInOpensMinutesBefore !== undefined) {
      updates.checkInOpensMinutesBefore = clamp(updates.checkInOpensMinutesBefore, 0, 360);
    }
    if (updates.earlyLeaveMinutes !== undefined) updates.earlyLeaveMinutes = clamp(updates.earlyLeaveMinutes, 0, 360);
    if (updates.checkoutGraceMinutes !== undefined) {
      updates.checkoutGraceMinutes = clamp(updates.checkoutGraceMinutes, 0, 240);
    }
    if (updates.blockCheckInAfterLateMinutes !== undefined) {
      updates.blockCheckInAfterLateMinutes = clamp(updates.blockCheckInAfterLateMinutes, 0, 480);
    }

    // Ensure departure is after arrival when both provided / resulting
    const settings = await getSettings();
    const next = { ...settings.toObject(), ...updates };
    const startM = Number(next.schoolStartHour) * 60 + Number(next.schoolStartMinute || 0);
    const endM = Number(next.schoolEndHour) * 60 + Number(next.schoolEndMinute || 0);
    if (endM <= startM) {
      return res.status(400).json({
        success: false,
        message: 'School end (jaane ka time) must be after school start (aane ka time)',
      });
    }

    Object.assign(settings, updates);
    await settings.save();
    invalidateSettingsCache();
    await logAudit({
      actorId: req.user._id,
      action: 'settings.timing_update',
      entityType: 'AttendanceSettings',
      entityId: settings._id,
      meta: updates,
    });
    const json = settings.toObject();
    json.timingSummary = buildTimingSummary(json);
    res.json({ success: true, data: json });
  } catch (err) {
    next(err);
  }
}

async function listHolidays(req, res, next) {
  try {
    const year = req.query.year || new Date().getFullYear();
    const data = await Holiday.find({
      date: { $regex: `^${year}` },
    }).sort({ date: 1 });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function upsertHoliday(req, res, next) {
  try {
    const schema = Joi.object({
      date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
      name: Joi.string().required(),
      type: Joi.string().valid('holiday', 'exam', 'event').default('holiday'),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.message });
    const data = await Holiday.findOneAndUpdate({ date: value.date }, value, {
      upsert: true,
      new: true,
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function deleteHoliday(req, res, next) {
  try {
    await Holiday.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    next(err);
  }
}

async function listPeriods(req, res, next) {
  try {
    const filter = {};
    if (req.query.classId) filter.classId = req.query.classId;
    const data = await Period.find(filter)
      .populate('teacherId', 'name email')
      .sort({ periodNumber: 1 });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function upsertPeriod(req, res, next) {
  try {
    const schema = Joi.object({
      classId: Joi.string().required(),
      subject: Joi.string().required(),
      periodNumber: Joi.number().integer().min(1).required(),
      startTime: Joi.string().allow('', null),
      endTime: Joi.string().allow('', null),
      teacherId: Joi.string().allow('', null),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.message });
    const data = await Period.findOneAndUpdate(
      { classId: value.classId, periodNumber: value.periodNumber },
      value,
      { upsert: true, new: true }
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function getAuditLogs(req, res, next) {
  try {
    const data = await listAuditLogs({
      limit: req.query.limit ? Number(req.query.limit) : 50,
      action: req.query.action,
      entityType: req.query.entityType,
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getSchoolSettings,
  updateSchoolSettings,
  listHolidays,
  upsertHoliday,
  deleteHoliday,
  listPeriods,
  upsertPeriod,
  getAuditLogs,
};
