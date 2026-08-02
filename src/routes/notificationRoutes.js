const express = require('express');
const auth = require('../middlewares/authMiddleware');
const {
  listNotifications,
  readNotification,
  readAll,
  registerFcmToken,
} = require('../controllers/notificationController');

const router = express.Router();

router.use(auth);
router.get('/', listNotifications);
router.put('/read-all', readAll);
router.put('/:id/read', readNotification);
router.post('/fcm-token', registerFcmToken);

module.exports = router;
