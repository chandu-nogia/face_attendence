const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ['admin', 'teacher', 'principal', 'parent', 'student'],
      default: 'teacher',
    },
    phone: { type: String, trim: true },
    classesAssigned: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Class' }],
    /** Parent → linked student records */
    linkedStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],
    /** Student-role user → their Student profile */
    studentProfileId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    fcmToken: { type: String },
    deviceIds: [{ type: String }],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

userSchema.methods.comparePassword = function comparePassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.statics.hashPassword = async function hashPassword(plain) {
  return bcrypt.hash(plain, 12);
};

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    phone: this.phone,
    classesAssigned: this.classesAssigned,
    linkedStudents: this.linkedStudents,
    studentProfileId: this.studentProfileId,
    isActive: this.isActive,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('User', userSchema);
