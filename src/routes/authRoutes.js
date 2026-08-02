const express = require('express');
const { register, login, refreshToken, me } = require('../controllers/authController');
const auth = require('../middlewares/authMiddleware');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/refresh-token', refreshToken);
router.get('/me', auth, me);

module.exports = router;
