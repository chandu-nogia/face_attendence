const {
  buildDailyReport,
  buildMonthlyReport,
  buildRangeReport,
  streamPdfReport,
  streamExcelReport,
} = require('../services/reportService');
const { dayjs } = require('../services/timeFormatService');
const { getScopedClassIds, assertClassAccess } = require('../utils/scopeHelper');

async function resolveScopedClassId(user, requestedClassId) {
  const scoped = await getScopedClassIds(user);
  if (requestedClassId) {
    const ok = await assertClassAccess(user, requestedClassId);
    if (!ok) return { denied: true };
    return { classId: requestedClassId };
  }
  if (scoped === null) return { classId: undefined };
  if (!scoped.length) return { denied: true };
  // Teacher without classId: force first assigned (reports must be scoped)
  if (scoped.length === 1) return { classId: scoped[0] };
  return { classId: undefined, classIds: scoped };
}

async function daily(req, res, next) {
  try {
    const scope = await resolveScopedClassId(req.user, req.query.classId);
    if (scope.denied) return res.status(403).json({ success: false, message: 'Access denied' });
    if (scope.classIds && !scope.classId) {
      // Aggregate only scoped classes by querying each — simple: require classId for multi
      return res.status(400).json({
        success: false,
        message: 'Select a class. Teachers must pick one of their assigned classes.',
        data: { allowedClassIds: scope.classIds },
      });
    }
    const report = await buildDailyReport({
      date: req.query.date,
      classId: scope.classId,
    });
    res.json({ success: true, data: report });
  } catch (err) {
    next(err);
  }
}

async function monthly(req, res, next) {
  try {
    const scope = await resolveScopedClassId(req.user, req.query.classId);
    if (scope.denied) return res.status(403).json({ success: false, message: 'Access denied' });
    if (scope.classIds && !scope.classId) {
      return res.status(400).json({
        success: false,
        message: 'Select a class. Teachers must pick one of their assigned classes.',
        data: { allowedClassIds: scope.classIds },
      });
    }
    const report = await buildMonthlyReport({
      year: req.query.year ? Number(req.query.year) : undefined,
      month: req.query.month ? Number(req.query.month) : undefined,
      classId: scope.classId,
    });
    res.json({ success: true, data: report });
  } catch (err) {
    next(err);
  }
}

async function resolveExportRows(query, user) {
  const scope = await resolveScopedClassId(user, query.classId);
  if (scope.denied) {
    const err = new Error('Access denied');
    err.statusCode = 403;
    throw err;
  }
  if (scope.classIds && !scope.classId) {
    const err = new Error('Select a class for export');
    err.statusCode = 400;
    throw err;
  }
  const classId = scope.classId;
  if (query.from || query.to) {
    return buildRangeReport({
      from: query.from,
      to: query.to,
      classId,
    });
  }
  return buildDailyReport({
    date: query.date || dayjs().format('YYYY-MM-DD'),
    classId,
  });
}

async function exportPdf(req, res, next) {
  try {
    const report = await resolveExportRows(req.query, req.user);
    const className = report.records[0]?.className;
    const title = report.from && report.to && report.from !== report.to
      ? `Attendance ${report.from} to ${report.to}`
      : `Daily Attendance — ${report.date || report.from}`;
    streamPdfReport(res, title, report.records, {
      className: req.query.classId ? className : 'All Classes',
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    next(err);
  }
}

async function exportExcel(req, res, next) {
  try {
    const report = await resolveExportRows(req.query, req.user);
    const title = report.from && report.to && report.from !== report.to
      ? `Attendance ${report.from} to ${report.to}`
      : `Daily Attendance ${report.date || report.from}`;
    await streamExcelReport(res, title, report.records);
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    next(err);
  }
}

module.exports = { daily, monthly, exportPdf, exportExcel };
