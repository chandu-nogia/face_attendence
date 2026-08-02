const express = require('express');
const auth = require('../middlewares/authMiddleware');
const role = require('../middlewares/roleMiddleware');
const {
  createAnnouncement,
  listAnnouncements,
  deactivateAnnouncement,
} = require('../controllers/announcementController');

const router = express.Router();

router.use(auth);
router.get('/', listAnnouncements);
router.post('/', role('admin', 'principal', 'teacher'), createAnnouncement);
router.delete('/:id', role('admin', 'principal'), deactivateAnnouncement);

module.exports = router;
