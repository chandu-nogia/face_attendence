const express = require('express');
const auth = require('../middlewares/authMiddleware');
const role = require('../middlewares/roleMiddleware');
const { submitLeave, listLeaves, reviewLeave } = require('../controllers/leaveController');

const router = express.Router();

router.use(auth);
router.post('/request', role('admin', 'teacher', 'parent', 'principal', 'student'), submitLeave);
router.get('/', listLeaves);
router.put('/:id/approve', role('admin', 'teacher', 'principal'), (req, res, next) => {
  req.params.action = 'approve';
  return reviewLeave(req, res, next);
});
router.put('/:id/reject', role('admin', 'teacher', 'principal'), (req, res, next) => {
  req.params.action = 'reject';
  return reviewLeave(req, res, next);
});

module.exports = router;
