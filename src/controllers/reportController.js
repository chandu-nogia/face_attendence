const {
  buildDailyReport,
  buildMonthlyReport,
  buildRangeReport,
  streamPdfReport,
  streamExcelReport,
} = require('../services/reportService');
const { dayjs } = require('../services/timeFormatService');

async function daily(req, res, next) {
  try {
    const report = await buildDailyReport({
      date: req.query.date,
      classId: req.query.classId,
    });
    res.json({ success: true, data: report });
  } catch (err) {
    next(err);
  }
}

async function monthly(req, res, next) {
  try {
    const report = await buildMonthlyReport({
      year: req.query.year ? Number(req.query.year) : undefined,
      month: req.query.month ? Number(req.query.month) : undefined,
      classId: req.query.classId,
    });
    res.json({ success: true, data: report });
  } catch (err) {
    next(err);
  }
}

async function resolveExportRows(query) {
  if (query.from || query.to) {
    return buildRangeReport({
      from: query.from,
      to: query.to,
      classId: query.classId,
    });
  }
  return buildDailyReport({
    date: query.date || dayjs().format('YYYY-MM-DD'),
    classId: query.classId,
  });
}

async function exportPdf(req, res, next) {
  try {
    const report = await resolveExportRows(req.query);
    const className = report.records[0]?.className;
    const title = report.from && report.to && report.from !== report.to
      ? `Attendance ${report.from} to ${report.to}`
      : `Daily Attendance — ${report.date || report.from}`;
    streamPdfReport(res, title, report.records, {
      className: req.query.classId ? className : 'All Classes',
    });
  } catch (err) {
    next(err);
  }
}

async function exportExcel(req, res, next) {
  try {
    const report = await resolveExportRows(req.query);
    const title = report.from && report.to && report.from !== report.to
      ? `Attendance ${report.from} to ${report.to}`
      : `Daily Attendance ${report.date || report.from}`;
    await streamExcelReport(res, title, report.records);
  } catch (err) {
    next(err);
  }
}

module.exports = { daily, monthly, exportPdf, exportExcel };
