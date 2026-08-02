const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    body: { type: String, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    audience: {
      type: String,
      enum: ['all', 'teachers', 'parents', 'students', 'class'],
      default: 'all',
    },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
    expiresAt: { type: Date },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Announcement', announcementSchema);
