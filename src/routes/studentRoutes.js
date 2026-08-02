const express = require('express');
const auth = require('../middlewares/authMiddleware');
const role = require('../middlewares/roleMiddleware');
const {
  createStudent,
  listStudents,
  updateStudent,
  deleteStudent,
  enrollFace,
  bulkImport,
  generateParentPin,
} = require('../controllers/studentController');
const upload = require('../middlewares/uploadMiddleware');

const router = express.Router();

router.use(auth);
router.post('/', role('admin', 'teacher', 'principal'), createStudent);
router.get('/', listStudents);
router.post('/bulk-import', role('admin', 'principal'), bulkImport);
router.post(
  '/:id/generate-parent-pin',
  role('admin', 'teacher', 'principal'),
  generateParentPin
);
router.put('/:id', role('admin', 'teacher', 'principal'), updateStudent);
router.delete('/:id', role('admin', 'principal'), deleteStudent);
router.post(
  '/:id/enroll-face',
  role('admin', 'teacher', 'principal'),
  upload.single('photo'),
  enrollFace
);

module.exports = router;
