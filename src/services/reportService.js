const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const Attendance = require('../models/Attendance');
const { toAmPm, dayjs } = require('./timeFormatService');

async function getAttendanceForRange({ classId, studentId, from, to }) {
  const filter = { isDeleted: false };
  if (classId) filter.classId = classId;
  if (studentId) filter.studentId = studentId;
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = from;
    if (to) filter.date.$lte = to;
  }
  return Attendance.find(filter)
    .populate('studentId', 'name rollNo')
    .populate('classId', 'name section')
    .sort({ date: 1 });
}

async function buildDailyReport({ date, classId }) {
  const filter = { date: date || dayjs().format('YYYY-MM-DD'), isDeleted: false };
  if (classId) filter.classId = classId;
  const records = await Attendance.find(filter)
    .populate('studentId', 'name rollNo')
    .populate('classId', 'name section');

  const summary = {
    date: filter.date,
    total: records.length,
    present: records.filter((r) => r.status === 'present').length,
    late: records.filter((r) => r.status === 'late').length,
    absent: records.filter((r) => r.status === 'absent').length,
    halfDay: records.filter((r) => r.status === 'half-day').length,
    leave: records.filter((r) => r.status === 'leave').length,
    records: records.map((r) => ({
      id: r._id,
      studentName: r.studentId?.name,
      rollNo: r.studentId?.rollNo,
      className: r.classId?.name,
      status: r.status,
      checkInTime: toAmPm(r.checkInTime),
      checkOutTime: toAmPm(r.checkOutTime),
    })),
  };
  return summary;
}

async function buildMonthlyReport({ year, month, classId }) {
  const y = year || dayjs().year();
  const m = String(month || dayjs().month() + 1).padStart(2, '0');
  const from = `${y}-${m}-01`;
  const to = dayjs(from).endOf('month').format('YYYY-MM-DD');
  const records = await getAttendanceForRange({ classId, from, to });

  const byStudent = {};
  for (const r of records) {
    const sid = String(r.studentId?._id || r.studentId);
    if (!byStudent[sid]) {
      byStudent[sid] = {
        studentId: sid,
        name: r.studentId?.name,
        rollNo: r.studentId?.rollNo,
        present: 0,
        absent: 0,
        late: 0,
        leave: 0,
        halfDay: 0,
        total: 0,
      };
    }
    byStudent[sid].total += 1;
    if (r.status === 'present') byStudent[sid].present += 1;
    else if (r.status === 'absent') byStudent[sid].absent += 1;
    else if (r.status === 'late') byStudent[sid].late += 1;
    else if (r.status === 'leave') byStudent[sid].leave += 1;
    else if (r.status === 'half-day') byStudent[sid].halfDay += 1;
  }

  const students = Object.values(byStudent).map((s) => ({
    ...s,
    attendancePercent:
      s.total > 0 ? Number((((s.present + s.late + s.halfDay * 0.5) / s.total) * 100).toFixed(1)) : 0,
  }));

  return { year: y, month: Number(m), from, to, students };
}

function streamPdfReport(res, title, rows) {
  const doc = new PDFDocument({ margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${title.replace(/\s+/g, '_')}.pdf"`);
  doc.pipe(res);
  doc.fontSize(18).fillColor('#C62828').text(title, { align: 'center' });
  doc.moveDown();
  doc.fontSize(10).fillColor('#000');
  rows.forEach((row, i) => {
    doc.text(
      `${i + 1}. ${row.studentName || '-'} (${row.rollNo || '-'}) | ${row.status} | In: ${row.checkInTime || '-'} | Out: ${row.checkOutTime || '-'}`
    );
  });
  doc.end();
}

async function streamExcelReport(res, title, rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Attendance');
  sheet.columns = [
    { header: '#', key: 'idx', width: 6 },
    { header: 'Student', key: 'studentName', width: 24 },
    { header: 'Roll No', key: 'rollNo', width: 12 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Check In', key: 'checkInTime', width: 14 },
    { header: 'Check Out', key: 'checkOutTime', width: 14 },
  ];
  rows.forEach((row, i) => sheet.addRow({ idx: i + 1, ...row }));
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFC62828' } };

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${title.replace(/\s+/g, '_')}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}

module.exports = {
  getAttendanceForRange,
  buildDailyReport,
  buildMonthlyReport,
  streamPdfReport,
  streamExcelReport,
};
