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
    /** Minutes before school start when face check-in becomes available */
    checkInOpensMinutesBefore: { type: Number, default: 60 },
    /** If checkout is this many minutes before school end → half-day */
    earlyLeaveMinutes: { type: Number, default: 60 },
    /** After school end + this grace, missing checkout is flagged */
    checkoutGraceMinutes: { type: Number, default: 30 },
    /** Optional hard block: minutes after late threshold when check-in is rejected (0 = never) */
    blockCheckInAfterLateMinutes: { type: Number, default: 0 },
    halfDayAfterHours: { type: Number, default: 4 },
    autoAbsentHour: { type: Number, default: 18 },
    autoAbsentMinute: { type: Number, default: 0 },
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
