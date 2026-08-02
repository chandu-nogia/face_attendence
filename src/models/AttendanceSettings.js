const mongoose = require('mongoose');

/** Singleton school attendance policy */
const attendanceSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'default', unique: true },
    schoolStartHour: { type: Number, default: 8 },
    schoolStartMinute: { type: Number, default: 0 },
    schoolEndHour: { type: Number, default: 14 },
    schoolEndMinute: { type: Number, default: 0 },
    lateAfterMinutes: { type: Number, default: 15 },
    halfDayAfterHours: { type: Number, default: 4 },
    autoAbsentHour: { type: Number, default: 18 },
    faceMatchThreshold: { type: Number, default: 0.85 },
    requireLiveness: { type: Boolean, default: true },
    notifyParentOnCheckIn: { type: Boolean, default: true },
    notifyParentOnAbsent: { type: Boolean, default: true },
    notifyViaWhatsApp: { type: Boolean, default: false },
    notifyViaSms: { type: Boolean, default: false },
    kioskAllowedDeviceIds: [{ type: String }],
    periodWiseEnabled: { type: Boolean, default: false },
    /** When true, teachers may enroll/create students in their assigned classes */
    allowTeacherEnrollStudents: { type: Boolean, default: false },
    /** Hours before pending teacher regularization auto-escalates to principal */
    regularizationEscalateHours: { type: Number, default: 48 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AttendanceSettings', attendanceSettingsSchema);
