const Attendance = require('../models/Attendance');
const Student = require('../models/Student');
const LeaveRequest = require('../models/LeaveRequest');
const { formatAttendanceList } = require('../services/timeFormatService');
const { dayjs } = require('../services/timeFormatService');

function linkedStudentIds(user) {
  return (user.linkedStudents || []).map((id) => String(id));
}

async function parentDashboard(req, res, next) {
  try {
    let studentIds = linkedStudentIds(req.user);
    if (req.user.role === 'student' && req.user.studentProfileId) {
      studentIds = [String(req.user.studentProfileId)];
    }
    // Also find by parentUserId / email
    if (req.user.role === 'parent') {
      const byLink = await Student.find({
        $or: [
          { parentUserId: req.user._id },
          { parentEmail: req.user.email },
          { _id: { $in: studentIds } },
        ],
      }).select('-faceEmbedding');
      studentIds = byLink.map((s) => String(s._id));
      var students = byLink;
    } else {
      var students = await Student.find({ _id: { $in: studentIds } }).select('-faceEmbedding');
    }

    const today = dayjs().format('YYYY-MM-DD');
    const todayAttendance = await Attendance.find({
      studentId: { $in: studentIds },
      date: today,
      isDeleted: false,
    }).populate('classId', 'name section');

    const from = dayjs().startOf('month').format('YYYY-MM-DD');
    const monthRecords = await Attendance.find({
      studentId: { $in: studentIds },
      date: { $gte: from, $lte: today },
      isDeleted: false,
    });

    const percentByStudent = {};
    for (const sid of studentIds) {
      const recs = monthRecords.filter((r) => String(r.studentId) === sid);
      const present = recs.filter((r) =>
        ['present', 'late', 'half-day'].includes(r.status)
      ).length;
      percentByStudent[sid] = {
        total: recs.length,
        present,
        percent: recs.length ? Number(((present / recs.length) * 100).toFixed(1)) : 0,
      };
    }

    const pendingLeaves = await LeaveRequest.countDocuments({
      studentId: { $in: studentIds },
      status: 'pending',
    });

    res.json({
      success: true,
      data: {
        students,
        todayAttendance: formatAttendanceList(todayAttendance),
        monthlyPercent: percentByStudent,
        pendingLeaves,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function parentChildHistory(req, res, next) {
  try {
    const studentId = req.params.studentId;
    const allowed =
      req.user.role === 'admin' ||
      req.user.role === 'principal' ||
      linkedStudentIds(req.user).includes(studentId) ||
      String(req.user.studentProfileId) === studentId;

    if (!allowed && req.user.role === 'parent') {
      const s = await Student.findById(studentId);
      if (
        !s ||
        (String(s.parentUserId) !== String(req.user._id) && s.parentEmail !== req.user.email)
      ) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    const from = req.query.from || dayjs().startOf('month').format('YYYY-MM-DD');
    const to = req.query.to || dayjs().format('YYYY-MM-DD');
    const records = await Attendance.find({
      studentId,
      date: { $gte: from, $lte: to },
      isDeleted: false,
    })
      .populate('classId', 'name section')
      .sort({ date: -1 });

    res.json({ success: true, data: formatAttendanceList(records) });
  } catch (err) {
    next(err);
  }
}

module.exports = { parentDashboard, parentChildHistory };
