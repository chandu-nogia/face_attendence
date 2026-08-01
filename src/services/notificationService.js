const Notification = require('../models/Notification');
const logger = require('../utils/logger');

async function createNotification({ userId, title, body, type = 'system', data }) {
  try {
    const notification = await Notification.create({
      userId,
      title,
      body,
      type,
      data,
    });
    return notification;
  } catch (err) {
    logger.warn(`Failed to create notification: ${err.message}`);
    return null;
  }
}

async function getUserNotifications(userId, { unreadOnly = false } = {}) {
  const filter = { userId };
  if (unreadOnly) filter.isRead = false;
  return Notification.find(filter).sort({ createdAt: -1 }).limit(100);
}

async function markNotificationRead(id, userId) {
  return Notification.findOneAndUpdate(
    { _id: id, userId },
    { isRead: true },
    { new: true }
  );
}

module.exports = {
  createNotification,
  getUserNotifications,
  markNotificationRead,
};
