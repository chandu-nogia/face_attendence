const {
  buildDailyReport,
  buildMonthlyReport,
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

async function exportPdf(req, res, next) {
  try {
    const report = await buildDailyReport({
      date: req.query.date || dayjs().format('YYYY-MM-DD'),
      classId: req.query.classId,
    });
    const className = report.records[0]?.className;
    streamPdfReport(res, `Daily Attendance — ${report.date}`, report.records, {
      className: req.query.classId ? className : 'All Classes',
    });
  } catch (err) {
    next(err);
  }
}

async function exportExcel(req, res, next) {
  try {
    const report = await buildDailyReport({
      date: req.query.date || dayjs().format('YYYY-MM-DD'),
      classId: req.query.classId,
    });
    await streamExcelReport(res, `Daily Attendance ${report.date}`, report.records);
  } catch (err) {
    next(err);
  }
}

module.exports = { daily, monthly, exportPdf, exportExcel };
