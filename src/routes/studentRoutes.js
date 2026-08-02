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
router.post('/', role('admin', 'teacher', 'principal'), createStudent);
router.get('/', listStudents);
router.post('/bulk-import', role('admin', 'teacher', 'principal'), bulkImport);
router.put('/:id', role('admin', 'teacher', 'principal'), updateStudent);
router.delete('/:id', role('admin', 'teacher', 'principal'), deleteStudent);
router.post(
  '/:id/enroll-face',
  role('admin', 'teacher', 'principal'),
  upload.single('photo'),
  enrollFace
);

module.exports = router;
