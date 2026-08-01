const cron = require('node-cron');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const { todayDateString } = require('../services/timeFormatService');
const { emitAttendanceEvent } = require('../socket/socketHandler');
const logger = require('../utils/logger');

async function markAbsentees() {
  const date = todayDateString();
  const students = await Student.find({ status: 'active' }).select('_id classId');
  let marked = 0;
  for (const student of students) {
    const existing = await Attendance.findOne({ studentId: student._id, date });
    if (!existing) {
      const attendance = await Attendance.create({
        studentId: student._id,
        classId: student.classId,
        date,
        status: 'absent',
        markedBy: 'manual',
      });
      marked += 1;
      emitAttendanceEvent('attendance:updated', { attendance });
    } else if (!existing.checkInTime && existing.status !== 'leave' && !existing.isDeleted) {
      existing.status = 'absent';
      await existing.save();
      marked += 1;
    }
  }
  logger.info(`Auto-absent cron: marked ${marked} students absent for ${date}`);
}

function startCronJobs() {
  const schedule = process.env.AUTO_ABSENT_CRON || '0 18 * * 1-5';
  if (!cron.validate(schedule)) {
    logger.warn(`Invalid AUTO_ABSENT_CRON: ${schedule}`);
    return;
  }
  cron.schedule(schedule, () => {
    markAbsentees().catch((err) => logger.error(`Auto-absent failed: ${err.message}`));
  });
  logger.info(`Auto-absent cron scheduled: ${schedule}`);
}

module.exports = { startCronJobs, markAbsentees };
