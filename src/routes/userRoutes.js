const express = require('express');
const auth = require('../middlewares/authMiddleware');
const role = require('../middlewares/roleMiddleware');
const {
  listUsers,
  createTeacher,
  updateUser,
  deleteUser,
} = require('../controllers/userController');

const router = express.Router();

router.use(auth);
router.use(role('admin', 'principal'));
router.get('/', listUsers);
router.post('/', createTeacher);
router.put('/:id', updateUser);
router.delete('/:id', deleteUser);

module.exports = router;
