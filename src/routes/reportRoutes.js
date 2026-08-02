const express = require('express');
const auth = require('../middlewares/authMiddleware');
const role = require('../middlewares/roleMiddleware');
const { daily, monthly, exportPdf, exportExcel } = require('../controllers/reportController');

const router = express.Router();

router.use(auth);
router.use(role('admin', 'teacher', 'principal'));
router.get('/daily', daily);
router.get('/monthly', monthly);
router.get('/export/pdf', exportPdf);
router.get('/export/excel', exportExcel);

module.exports = router;
