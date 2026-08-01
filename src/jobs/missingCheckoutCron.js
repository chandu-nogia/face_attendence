const cron = require('node-cron');
const Attendance = require('../models/Attendance');
const { todayDateString } = require('../services/timeFormatService');
const { createNotification } = require('../services/notificationService');
const logger = require('../utils/logger');

async function flagMissingCheckouts() {
  const date = todayDateString();
  const records = await Attendance.find({
    date,
    isDeleted: false,
    checkInTime: { $ne: null },
    checkOutTime: null,
    status: { $in: ['present', 'late', 'half-day'] },
  }).populate('studentId', 'name');

  let flagged = 0;
  for (const record of records) {
    if (!record.missingCheckoutFlagged) {
      record.missingCheckoutFlagged = true;
      await record.save();
      flagged += 1;
    }
  }
  logger.info(`Missing checkout cron: flagged ${flagged} students for ${date}`);
}

function startMissingCheckoutCron() {
  const schedule = process.env.MISSING_CHECKOUT_CRON || '0 17 * * 1-5';
  if (!cron.validate(schedule)) {
    logger.warn(`Invalid MISSING_CHECKOUT_CRON: ${schedule}`);
    return;
  }
  cron.schedule(schedule, () => {
    flagMissingCheckouts().catch((err) =>
      logger.error(`Missing checkout cron failed: ${err.message}`)
    );
  });
  logger.info(`Missing checkout cron scheduled: ${schedule}`);
}

module.exports = { startMissingCheckoutCron, flagMissingCheckouts };
