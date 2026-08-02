const mongoose = require('mongoose');

const periodSchema = new mongoose.Schema(
  {
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    subject: { type: String, required: true },
    periodNumber: { type: Number, required: true },
    startTime: { type: String }, // hh:mm a
    endTime: { type: String },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

periodSchema.index({ classId: 1, periodNumber: 1 }, { unique: true });

module.exports = mongoose.model('Period', periodSchema);
