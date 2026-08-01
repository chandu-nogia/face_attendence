const mongoose = require('mongoose');

const editHistorySchema = new mongoose.Schema(
  {
    editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    editedAt: { type: Date, default: Date.now },
    field: { type: String },
    oldValue: { type: mongoose.Schema.Types.Mixed },
    newValue: { type: mongoose.Schema.Types.Mixed },
    reason: { type: String },
  },
  { _id: false }
);

const attendanceSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    date: { type: String, required: true, index: true }, // YYYY-MM-DD
    checkInTime: { type: Date },
    checkOutTime: { type: Date },
    status: {
      type: String,
      enum: ['present', 'absent', 'late', 'half-day', 'leave'],
      default: 'present',
    },
    markedBy: {
      type: String,
      enum: ['face_recognition', 'manual'],
      default: 'face_recognition',
    },
    confidenceScore: { type: Number },
    isRegularized: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    deleteReason: { type: String },
    editHistory: [editHistorySchema],
    missingCheckoutFlagged: { type: Boolean, default: false },
  },
  { timestamps: true }
);

attendanceSchema.index({ studentId: 1, date: 1 }, { unique: true });
attendanceSchema.index({ classId: 1, date: 1, isDeleted: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
