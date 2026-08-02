const express = require('express');
const auth = require('../middlewares/authMiddleware');
const role = require('../middlewares/roleMiddleware');
const {
  getSchoolSettings,
  updateSchoolSettings,
  listHolidays,
  upsertHoliday,
  deleteHoliday,
  listPeriods,
  upsertPeriod,
  getAuditLogs,
} = require('../controllers/schoolController');

const router = express.Router();

router.use(auth);
router.get('/settings', getSchoolSettings);
router.put('/settings', role('admin', 'principal'), updateSchoolSettings);
router.get('/holidays', listHolidays);
router.post('/holidays', role('admin', 'principal'), upsertHoliday);
router.delete('/holidays/:id', role('admin', 'principal'), deleteHoliday);
router.get('/periods', listPeriods);
router.post('/periods', role('admin', 'teacher', 'principal'), upsertPeriod);
router.get('/audit-logs', role('admin', 'principal'), getAuditLogs);

module.exports = router;
