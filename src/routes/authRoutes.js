const express = require('express');
const { register, login, refreshToken, me } = require('../controllers/authController');
const { linkParent, createStudentLogin } = require('../controllers/parentLinkController');
const auth = require('../middlewares/authMiddleware');
const role = require('../middlewares/roleMiddleware');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/refresh-token', refreshToken);
router.post('/link-parent', linkParent);
router.get('/me', auth, me);
router.post(
  '/create-student-login',
  auth,
  role('admin', 'teacher', 'principal'),
  createStudentLogin
);

module.exports = router;
