const {
  getAnalyticsOverview,
  getAtRiskStudents,
  getClassComparison,
} = require('../services/analyticsService');
const Attendance = require('../models/Attendance');
const Student = require('../models/Student');
const Class = require('../models/Class');
const LeaveRequest = require('../models/LeaveRequest');
const RegularizationRequest = require('../models/RegularizationRequest');
const { todayDateString } = require('../services/timeFormatService');
const { getScopedClassIds, assertClassAccess } = require('../utils/scopeHelper');

async function resolveTeacherClassId(user, classId) {
  if (classId) {
    const ok = await assertClassAccess(user, classId);
    if (!ok) return { denied: true };
    return { classId };
  }
  const scoped = await getScopedClassIds(user);
  if (scoped === null) return { classId: undefined };
  if (!scoped.length) return { denied: true };
  if (scoped.length === 1) return { classId: scoped[0] };
  return { classId: scoped[0], forced: true, allowedClassIds: scoped };
}

async function overview(req, res, next) {
  try {
    const scope = await resolveTeacherClassId(req.user, req.query.classId);
    if (scope.denied) return res.status(403).json({ success: false, message: 'Access denied' });
    const data = await getAnalyticsOverview({
      from: req.query.from,
      to: req.query.to,
      classId: scope.classId,
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function atRisk(req, res, next) {
  try {
    const scope = await resolveTeacherClassId(req.user, req.query.classId);
    if (scope.denied) return res.status(403).json({ success: false, message: 'Access denied' });
    const data = await getAtRiskStudents({
      threshold: req.query.threshold ? Number(req.query.threshold) : 75,
      from: req.query.from,
      to: req.query.to,
      classId: scope.classId,
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function classComparison(req, res, next) {
  try {
    const data = await getClassComparison({
      from: req.query.from,
      to: req.query.to,
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function principalOverview(req, res, next) {
  try {
    const today = todayDateString();
    const [todayRecords, totalStudents, classCount, pendingLeavesTeacher, pendingLeavesAdmin, pendingRegTeacher, pendingRegPrincipal, comparison, defaulters] =
      await Promise.all([
        Attendance.find({ date: today, isDeleted: false }),
        Student.countDocuments({ status: 'active' }),
        Class.countDocuments(),
        LeaveRequest.countDocuments({ status: { $in: ['pending_teacher', 'pending'] } }),
        LeaveRequest.countDocuments({ status: 'pending_admin' }),
        RegularizationRequest.countDocuments({
          status: { $in: ['pending_teacher', 'pending'] },
        }),
        RegularizationRequest.countDocuments({ status: 'pending_principal' }),
        getClassComparison({}),
        getAtRiskStudents({ threshold: 75 }),
      ]);

    const present = todayRecords.filter((r) =>
      ['present', 'late', 'half-day'].includes(r.status)
    ).length;
    const late = todayRecords.filter((r) => r.status === 'late').length;
    const absent = todayRecords.filter((r) => r.status === 'absent').length;
    const onLeave = todayRecords.filter((r) => r.status === 'leave').length;

    const classesWithMark = new Set(todayRecords.map((r) => String(r.classId)));
    const allClasses = await Class.find().select('name section');
    const classesWithoutAttendance = allClasses
      .filter((c) => !classesWithMark.has(String(c._id)))
      .map((c) => ({
        id: c._id,
        name: c.section ? `${c.name} - ${c.section}` : c.name,
      }));

    res.json({
      success: true,
      data: {
        date: today,
        totalStudents,
        classCount,
        today: {
          marked: todayRecords.length,
          present,
          late,
          absent,
          onLeave,
          percent:
            totalStudents > 0
              ? Number(((present / totalStudents) * 100).toFixed(1))
              : 0,
        },
        pending: {
          leavesTeacher: pendingLeavesTeacher,
          leavesAdmin: pendingLeavesAdmin,
          regularizationTeacher: pendingRegTeacher,
          regularizationPrincipal: pendingRegPrincipal,
        },
        classComparison: comparison,
        classesWithoutAttendance,
        atRiskCount: defaulters.length,
        atRiskTop: defaulters.slice(0, 5),
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { overview, atRisk, classComparison, principalOverview };
