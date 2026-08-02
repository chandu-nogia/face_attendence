const Notification = require('../models/Notification');
const User = require('../models/User');
const logger = require('../utils/logger');
const { notifyParentChannels } = require('./messagingService');

async function createNotification({ userId, title, body, type = 'system', data }) {
  try {
    const notification = await Notification.create({
      userId,
      title,
      body,
      type,
      data,
    });
    // FCM push stub — set FCM_SERVER_KEY to enable
    await pushFcm(userId, title, body, data);
    return notification;
  } catch (err) {
    logger.warn(`Failed to create notification: ${err.message}`);
    return null;
  }
}

async function pushFcm(userId, title, body, data) {
  try {
    const user = await User.findById(userId).select('fcmToken');
    if (!user?.fcmToken || !process.env.FCM_SERVER_KEY) {
      if (user?.fcmToken) {
        logger.info(`[FCM stub] user=${userId} title=${title}`);
      }
      return;
    }
    await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `key=${process.env.FCM_SERVER_KEY}`,
      },
      body: JSON.stringify({
        to: user.fcmToken,
        notification: { title, body },
        data: data || {},
      }),
    });
  } catch (err) {
    logger.warn(`FCM push failed: ${err.message}`);
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

async function markAllRead(userId) {
  await Notification.updateMany({ userId, isRead: false }, { isRead: true });
  return { success: true };
}

async function notifyParentOfAttendance({ student, event, timeLabel, settings }) {
  if (!settings?.notifyParentOnCheckIn && event === 'checkin') return;
  const parentIds = [];
  if (student.parentUserId) parentIds.push(student.parentUserId);
  if (student.parentEmail) {
    const parent = await User.findOne({ email: student.parentEmail, role: 'parent' });
    if (parent) parentIds.push(parent._id);
  }
  const title = event === 'checkout' ? 'Check-out' : 'Check-in';
  const body = `${student.name} ${event === 'checkout' ? 'checked out' : 'marked present'} at ${timeLabel}`;
  for (const uid of [...new Set(parentIds.map(String))]) {
    await createNotification({
      userId: uid,
      title,
      body,
      type: event === 'checkout' ? 'checkout' : 'attendance',
      data: { studentId: String(student._id), event },
    });
  }
  if (student.parentContact) {
    await notifyParentChannels({
      phone: student.parentContact,
      message: body,
      settings,
    });
  }
}

module.exports = {
  createNotification,
  getUserNotifications,
  markNotificationRead,
  markAllRead,
  notifyParentOfAttendance,
  pushFcm,
};
