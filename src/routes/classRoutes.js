const express = require('express');
const auth = require('../middlewares/authMiddleware');
const role = require('../middlewares/roleMiddleware');
const {
  createClass,
  listClasses,
  getClass,
  updateClass,
  deleteClass,
} = require('../controllers/classController');

const router = express.Router();

router.use(auth);
router.post('/', role('admin', 'principal'), createClass);
router.get('/', listClasses);
router.get('/:id', getClass);
router.put('/:id', role('admin', 'principal'), updateClass);
router.delete('/:id', role('admin', 'principal'), deleteClass);

module.exports = router;
