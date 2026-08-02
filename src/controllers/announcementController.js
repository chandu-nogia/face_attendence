const Joi = require('joi');
const Announcement = require('../models/Announcement');
const User = require('../models/User');
const { createNotification } = require('../services/notificationService');

async function createAnnouncement(req, res, next) {
  try {
    const schema = Joi.object({
      title: Joi.string().required(),
      body: Joi.string().required(),
      audience: Joi.string()
        .valid('all', 'teachers', 'parents', 'students', 'class')
        .default('all'),
      classId: Joi.string().allow('', null),
      expiresAt: Joi.date().allow(null),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.message });

    const ann = await Announcement.create({
      ...value,
      createdBy: req.user._id,
    });

    // Fan-out in-app notifications
    const roleMap = {
      teachers: ['teacher', 'admin', 'principal'],
      parents: ['parent'],
      students: ['student'],
      all: ['admin', 'teacher', 'principal', 'parent', 'student'],
    };
    const roles = roleMap[value.audience] || roleMap.all;
    const users = await User.find({ role: { $in: roles }, isActive: true }).select('_id');
    await Promise.all(
      users.slice(0, 500).map((u) =>
        createNotification({
          userId: u._id,
          title: value.title,
          body: value.body,
          type: 'announcement',
          data: { announcementId: String(ann._id) },
        })
      )
    );

    res.status(201).json({ success: true, data: ann });
  } catch (err) {
    next(err);
  }
}

async function listAnnouncements(req, res, next) {
  try {
    const filter = { isActive: true };
    const data = await Announcement.find(filter)
      .populate('createdBy', 'name role')
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function deactivateAnnouncement(req, res, next) {
  try {
    const data = await Announcement.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

module.exports = { createAnnouncement, listAnnouncements, deactivateAnnouncement };
