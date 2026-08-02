const cron = require('node-cron');
const RegularizationRequest = require('../models/RegularizationRequest');
const User = require('../models/User');
const { getSettings } = require('../services/settingsService');
const { createNotification } = require('../services/notificationService');
const { logAudit } = require('../services/auditService');
const logger = require('../utils/logger');

async function escalateStaleRegularizations() {
  const settings = await getSettings();
  const hours = Number(settings.regularizationEscalateHours || 48);
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

  const stale = await RegularizationRequest.find({
    status: { $in: ['pending_teacher', 'pending'] },
    requestedAt: { $lte: cutoff },
  }).populate('studentId', 'name');

  if (!stale.length) return 0;

  const principals = await User.find({
    role: { $in: ['principal', 'admin'] },
    isActive: true,
  }).select('_id');

  let count = 0;
  for (const request of stale) {
    request.status = 'pending_principal';
    request.escalatedAt = new Date();
    request.escalationReason = `Auto-escalated after ${hours}h without teacher response`;
    await request.save();

    await logAudit({
      actorId: null,
      action: 'regularization.auto_escalate',
      entityType: 'RegularizationRequest',
      entityId: request._id,
      meta: { hours, studentId: request.studentId?._id || request.studentId },
    });

    for (const p of principals) {
      await createNotification({
        userId: p._id,
        title: 'Regularization auto-escalated',
        body: `${request.studentId?.name || 'Student'}: teacher did not respond within ${hours}h`,
        type: 'regularization',
        data: { id: String(request._id) },
      });
    }
    count += 1;
  }

  logger.info(`Regularization escalate cron: moved ${count} request(s) to principal`);
  return count;
}

function startRegularizationEscalateCron() {
  const schedule = process.env.REG_ESCALATE_CRON || '0 * * * *';
  if (!cron.validate(schedule)) {
    logger.warn(`Invalid REG_ESCALATE_CRON: ${schedule}`);
    return;
  }
  cron.schedule(schedule, () => {
    escalateStaleRegularizations().catch((err) =>
      logger.error(`Regularization escalate failed: ${err.message}`)
    );
  });
  logger.info(`Regularization escalate cron scheduled: ${schedule}`);
}

module.exports = { startRegularizationEscalateCron, escalateStaleRegularizations };
