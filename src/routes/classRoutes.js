const express = require('express');
const auth = require('../middlewares/authMiddleware');
const role = require('../middlewares/roleMiddleware');
const { createClass, listClasses, getClass, updateClass } = require('../controllers/classController');

const router = express.Router();

router.use(auth);
router.post('/', role('admin'), createClass);
router.get('/', listClasses);
router.get('/:id', getClass);
router.put('/:id', role('admin', 'teacher'), updateClass);

module.exports = router;
