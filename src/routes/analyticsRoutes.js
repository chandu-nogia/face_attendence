const express = require('express');
const auth = require('../middlewares/authMiddleware');
const role = require('../middlewares/roleMiddleware');
const {
  overview,
  atRisk,
  classComparison,
  principalOverview,
} = require('../controllers/analyticsController');

const router = express.Router();

router.use(auth);
router.get('/overview', role('admin', 'teacher', 'principal'), overview);
router.get('/at-risk', role('admin', 'teacher', 'principal'), atRisk);
router.get('/class-comparison', role('admin', 'principal'), classComparison);
router.get('/principal-overview', role('admin', 'principal'), principalOverview);

module.exports = router;
