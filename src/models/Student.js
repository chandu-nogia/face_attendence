const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    rollNo: { type: String, required: true, trim: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    parentContact: { type: String, trim: true },
    parentEmail: { type: String, trim: true, lowercase: true },
    parentUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    photoUrls: [{ type: String }],
    faceEmbedding: { type: [Number], default: [] },
    faceQualityScore: { type: Number },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    leaveBalance: { type: Number, default: 10 },
  },
  { timestamps: true }
);

studentSchema.index({ classId: 1, rollNo: 1 }, { unique: true });
studentSchema.index({ status: 1 });
studentSchema.index({ parentUserId: 1 });
studentSchema.index({ parentEmail: 1 });

module.exports = mongoose.model('Student', studentSchema);
