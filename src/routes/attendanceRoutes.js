const express = require('express');
const auth = require('../middlewares/authMiddleware');
const role = require('../middlewares/roleMiddleware');
const {
  markLimiter,
  markAttendance,
  checkout,
  getToday,
  getReport,
  updateAttendance,
  softDeleteAttendance,
  readdAttendance,
  bulkUpdate,
  getDefaulters,
} = require('../controllers/attendanceController');

const router = express.Router();

router.use(auth);
router.post('/mark', markLimiter, role('admin', 'teacher', 'principal'), markAttendance);
router.post('/checkout', markLimiter, role('admin', 'teacher', 'principal'), checkout);
router.get('/today', getToday);
router.get('/report', getReport);
router.get('/defaulters', getDefaulters);
router.put('/bulk-update', role('admin', 'teacher', 'principal'), bulkUpdate);
router.put('/:id', role('admin', 'teacher', 'principal'), updateAttendance);
router.delete('/:id', role('admin', 'teacher', 'principal'), softDeleteAttendance);
router.post('/:id/readd', role('admin', 'teacher', 'principal'), readdAttendance);

module.exports = router;
