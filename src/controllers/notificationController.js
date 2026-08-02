const {
  getUserNotifications,
  markNotificationRead,
  markAllRead,
} = require('../services/notificationService');
const User = require('../models/User');

async function listNotifications(req, res, next) {
  try {
    const unreadOnly = req.query.unreadOnly === 'true';
    const data = await getUserNotifications(req.user._id, { unreadOnly });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function readNotification(req, res, next) {
  try {
    const data = await markNotificationRead(req.params.id, req.user._id);
    if (!data) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function readAll(req, res, next) {
  try {
    await markAllRead(req.user._id);
    res.json({ success: true, message: 'All marked as read' });
  } catch (err) {
    next(err);
  }
}

async function registerFcmToken(req, res, next) {
  try {
    const { fcmToken, deviceId } = req.body;
    if (!fcmToken) return res.status(400).json({ success: false, message: 'fcmToken required' });
    const updates = { fcmToken };
    if (deviceId) {
      await User.findByIdAndUpdate(req.user._id, {
        fcmToken,
        $addToSet: { deviceIds: deviceId },
      });
    } else {
      await User.findByIdAndUpdate(req.user._id, updates);
    }
    res.json({ success: true, message: 'FCM token registered' });
  } catch (err) {
    next(err);
  }
}

module.exports = { listNotifications, readNotification, readAll, registerFcmToken };
