const mongoose = require('mongoose');

const classSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    section: { type: String, trim: true, default: '' },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],
  },
  { timestamps: true }
);

classSchema.virtual('displayName').get(function displayName() {
  return this.section ? `${this.name} - ${this.section}` : this.name;
});

classSchema.set('toJSON', { virtuals: true });
classSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Class', classSchema);
