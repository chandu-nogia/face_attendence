const express = require('express');
const auth = require('../middlewares/authMiddleware');
const role = require('../middlewares/roleMiddleware');
const { parentDashboard, parentChildHistory } = require('../controllers/parentController');

const router = express.Router();

router.use(auth);
router.get(
  '/dashboard',
  role('parent', 'student', 'admin', 'principal'),
  parentDashboard
);
router.get(
  '/students/:studentId/history',
  role('parent', 'student', 'admin', 'principal', 'teacher'),
  parentChildHistory
);

module.exports = router;
