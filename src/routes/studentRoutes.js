const express = require('express');
const auth = require('../middlewares/authMiddleware');
const role = require('../middlewares/roleMiddleware');
const upload = require('../middlewares/uploadMiddleware');
const {
  createStudent,
  listStudents,
  updateStudent,
  deleteStudent,
  enrollFace,
  bulkImport,
} = require('../controllers/studentController');

const router = express.Router();

router.use(auth);
router.post('/', role('admin', 'teacher'), createStudent);
router.get('/', listStudents);
router.put('/:id', role('admin', 'teacher'), updateStudent);
router.delete('/:id', role('admin', 'teacher'), deleteStudent);
router.post('/:id/enroll-face', role('admin', 'teacher'), upload.single('photo'), enrollFace);
router.post('/bulk-import', role('admin', 'teacher'), bulkImport);

module.exports = router;
