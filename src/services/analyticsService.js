const Attendance = require('../models/Attendance');
const Student = require('../models/Student');
const Class = require('../models/Class');
const { dayjs } = require('./timeFormatService');

async function getAnalyticsOverview({ from, to, classId } = {}) {
  const start = from || dayjs().startOf('month').format('YYYY-MM-DD');
  const end = to || dayjs().format('YYYY-MM-DD');
  const filter = { date: { $gte: start, $lte: end }, isDeleted: false };
  if (classId) filter.classId = classId;

  const records = await Attendance.find(filter);
  const byStatus = {};
  const byDate = {};
  for (const r of records) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    if (!byDate[r.date]) byDate[r.date] = { present: 0, absent: 0, late: 0, total: 0 };
    byDate[r.date].total += 1;
    if (['present', 'late', 'half-day'].includes(r.status)) byDate[r.date].present += 1;
    if (r.status === 'absent') byDate[r.date].absent += 1;
    if (r.status === 'late') byDate[r.date].late += 1;
  }

  const studentFilter = { status: 'active' };
  if (classId) studentFilter.classId = classId;
  const totalStudents = await Student.countDocuments(studentFilter);
  const classCount = classId ? 1 : await Class.countDocuments();

  const trend = Object.keys(byDate)
    .sort()
    .map((date) => ({
      date,
      ...byDate[date],
      percent:
        byDate[date].total > 0
          ? Number(((byDate[date].present / byDate[date].total) * 100).toFixed(1))
          : 0,
    }));

  return {
    from: start,
    to: end,
    totalStudents,
    classCount,
    totalRecords: records.length,
    byStatus,
    trend,
    averageAttendance:
      trend.length > 0
        ? Number((trend.reduce((s, t) => s + t.percent, 0) / trend.length).toFixed(1))
        : 0,
  };
}

async function getAtRiskStudents({ threshold = 75, from, to, classId } = {}) {
  const start = from || dayjs().startOf('month').format('YYYY-MM-DD');
  const end = to || dayjs().format('YYYY-MM-DD');
  const filter = { date: { $gte: start, $lte: end }, isDeleted: false };
  if (classId) filter.classId = classId;

  const records = await Attendance.find(filter).populate('studentId', 'name rollNo classId parentContact');
  const stats = {};
  for (const r of records) {
    const sid = String(r.studentId?._id || r.studentId);
    if (!stats[sid]) {
      stats[sid] = { student: r.studentId, total: 0, presentDays: 0 };
    }
    stats[sid].total += 1;
    if (['present', 'late', 'half-day'].includes(r.status)) {
      stats[sid].presentDays += r.status === 'half-day' ? 0.5 : 1;
    }
  }

  return Object.values(stats)
    .map((s) => ({
      ...s,
      percent: s.total > 0 ? Number(((s.presentDays / s.total) * 100).toFixed(1)) : 0,
    }))
    .filter((s) => s.percent < threshold)
    .sort((a, b) => a.percent - b.percent);
}

async function getClassComparison({ from, to } = {}) {
  const start = from || dayjs().startOf('month').format('YYYY-MM-DD');
  const end = to || dayjs().format('YYYY-MM-DD');
  const classes = await Class.find().select('name section');
  const results = [];
  for (const c of classes) {
    const records = await Attendance.find({
      classId: c._id,
      date: { $gte: start, $lte: end },
      isDeleted: false,
    });
    const present = records.filter((r) =>
      ['present', 'late', 'half-day'].includes(r.status)
    ).length;
    results.push({
      classId: c._id,
      name: c.name,
      section: c.section,
      total: records.length,
      present,
      percent: records.length
        ? Number(((present / records.length) * 100).toFixed(1))
        : 0,
    });
  }
  return results.sort((a, b) => b.percent - a.percent);
}

module.exports = { getAnalyticsOverview, getAtRiskStudents, getClassComparison };
