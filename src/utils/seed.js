const bcrypt = require('bcryptjs');
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Class = require('../models/Class');
const logger = require('./logger');

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/face_attendance_pro');

  let admin = await User.findOne({ email: 'admin@school.com' });
  if (!admin) {
    admin = await User.create({
      name: 'Admin',
      email: 'admin@school.com',
      passwordHash: await bcrypt.hash('admin123', 12),
      role: 'admin',
    });
    logger.info('Created admin@school.com / admin123');
  }

  let teacher = await User.findOne({ email: 'teacher@school.com' });
  if (!teacher) {
    teacher = await User.create({
      name: 'Teacher',
      email: 'teacher@school.com',
      passwordHash: await bcrypt.hash('teacher123', 12),
      role: 'teacher',
    });
    logger.info('Created teacher@school.com / teacher123');
  }

  let klass = await Class.findOne({ name: 'Grade 10', section: 'A' });
  if (!klass) {
    klass = await Class.create({
      name: 'Grade 10',
      section: 'A',
      teacherId: teacher._id,
    });
    teacher.classesAssigned = [klass._id];
    await teacher.save();
    logger.info('Created class Grade 10 - A');
  }

  await mongoose.disconnect();
  logger.info('Seed complete');
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
