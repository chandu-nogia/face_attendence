const cron = require('node-cron');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const { todayDateString, dayjs } = require('../services/timeFormatService');
const { emitAttendanceEvent } = require('../socket/socketHandler');
const { getSettings } = require('../services/settingsService');
const { getDayAnchors } = require('../services/timingService');
const logger = require('../utils/logger');

async function markAbsentees() {
  const settings = await getSettings();
  const anchors = getDayAnchors(settings, new Date());
  if (dayjs().isBefore(anchors.autoAbsentAt)) {
    logger.info(`Auto-absent cron: skipped until ${anchors.autoAbsentAt.format('h:mm A')}`);
    return 0;
  }

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
  return marked;
}

function startCronJobs() {
  // Run hourly; actual marking waits for autoAbsentAt from school settings
  const schedule = process.env.AUTO_ABSENT_CRON || '5 * * * 1-5';
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
