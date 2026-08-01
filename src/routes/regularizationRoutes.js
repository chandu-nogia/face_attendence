const express = require('express');
const auth = require('../middlewares/authMiddleware');
const role = require('../middlewares/roleMiddleware');
const {
  createRequest,
  getPending,
  listAll,
  approve,
  reject,
} = require('../controllers/regularizationController');

const router = express.Router();

router.use(auth);
router.post('/request', createRequest);
router.get('/pending', role('admin', 'teacher'), getPending);
router.get('/', listAll);
router.put('/:id/approve', role('admin', 'teacher'), approve);
router.put('/:id/reject', role('admin', 'teacher'), reject);

module.exports = router;
