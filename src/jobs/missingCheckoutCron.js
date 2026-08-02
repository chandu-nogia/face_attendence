const cron = require('node-cron');
const Attendance = require('../models/Attendance');
const { todayDateString, dayjs } = require('../services/timeFormatService');
const { getSettings } = require('../services/settingsService');
const { getDayAnchors } = require('../services/timingService');
const logger = require('../utils/logger');

async function flagMissingCheckouts() {
  const settings = await getSettings();
  const anchors = getDayAnchors(settings, new Date());
  if (dayjs().isBefore(anchors.checkoutDeadline)) {
    logger.info(
      `Missing checkout cron: skipped (deadline ${anchors.checkoutDeadline.format('h:mm A')})`
    );
    return 0;
  }

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
  return flagged;
}

function startMissingCheckoutCron() {
  // Every 15 min on weekdays — actual flagging waits until checkoutDeadline
  const schedule = process.env.MISSING_CHECKOUT_CRON || '*/15 12-20 * * 1-5';
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
