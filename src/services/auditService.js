const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

async function logAudit({ actorId, action, entityType, entityId, meta, ip }) {
  try {
    return await AuditLog.create({
      actorId,
      action,
      entityType,
      entityId: entityId ? String(entityId) : undefined,
      meta,
      ip,
    });
  } catch (err) {
    logger.warn(`Audit log failed: ${err.message}`);
    return null;
  }
}

async function listAuditLogs({ limit = 50, action, entityType } = {}) {
  const filter = {};
  if (action) filter.action = action;
  if (entityType) filter.entityType = entityType;
  return AuditLog.find(filter)
    .populate('actorId', 'name email role')
    .sort({ createdAt: -1 })
    .limit(Math.min(limit, 200));
}

module.exports = { logAudit, listAuditLogs };
