const express = require('express');
const auth = require('../middlewares/authMiddleware');
const role = require('../middlewares/roleMiddleware');
const {
  createRequest,
  getPending,
  listAll,
  teacherReview,
  principalReview,
  approve,
  reject,
} = require('../controllers/regularizationController');

const router = express.Router();

router.use(auth);
router.post(
  '/request',
  role('admin', 'teacher', 'principal', 'parent', 'student'),
  createRequest
);
router.get('/pending', role('admin', 'teacher', 'principal'), getPending);
router.get('/', listAll);

router.put(
  '/:id/teacher-approve',
  role('admin', 'teacher', 'principal'),
  (req, res, next) => {
    req.params.action = 'approve';
    return teacherReview(req, res, next);
  }
);
router.put(
  '/:id/teacher-reject',
  role('admin', 'teacher', 'principal'),
  (req, res, next) => {
    req.params.action = 'reject';
    return teacherReview(req, res, next);
  }
);
router.put(
  '/:id/principal-approve',
  role('admin', 'principal'),
  (req, res, next) => {
    req.params.action = 'approve';
    return principalReview(req, res, next);
  }
);
router.put(
  '/:id/principal-reject',
  role('admin', 'principal'),
  (req, res, next) => {
    req.params.action = 'reject';
    return principalReview(req, res, next);
  }
);

router.put('/:id/approve', role('admin', 'teacher', 'principal'), approve);
router.put('/:id/reject', role('admin', 'teacher', 'principal'), reject);

module.exports = router;
