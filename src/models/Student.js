const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    rollNo: { type: String, required: true, trim: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    parentContact: { type: String, trim: true },
    photoUrls: [{ type: String }],
    faceEmbedding: { type: [Number], default: [] },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

studentSchema.index({ classId: 1, rollNo: 1 }, { unique: true });
studentSchema.index({ status: 1 });

module.exports = mongoose.model('Student', studentSchema);
