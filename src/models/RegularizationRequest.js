const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    at: { type: Date },
    note: { type: String },
    decision: { type: String, enum: ['approve', 'reject'] },
  },
  { _id: false }
);

const regularizationSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    attendanceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Attendance' },
    reason: { type: String, required: true },
    proofUrl: { type: String },
    status: {
      type: String,
      enum: [
        'pending_teacher',
        'pending_principal',
        'approved',
        'rejected',
        'pending', // legacy
      ],
      default: 'pending_teacher',
      index: true,
    },
    teacherReview: reviewSchema,
    principalReview: reviewSchema,
    requestedAt: { type: Date, default: Date.now },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    reviewNote: { type: String },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    escalatedAt: { type: Date },
    escalationReason: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('RegularizationRequest', regularizationSchema);
