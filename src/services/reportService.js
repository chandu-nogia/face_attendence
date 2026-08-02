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
    .populate('classId', 'name section')
    .sort({ 'studentId.rollNo': 1 });

  const summary = {
    date: filter.date,
    total: records.length,
    present: records.filter((r) => r.status === 'present').length,
    late: records.filter((r) => r.status === 'late').length,
    absent: records.filter((r) => r.status === 'absent').length,
    halfDay: records.filter((r) => r.status === 'half-day').length,
    leave: records.filter((r) => r.status === 'leave').length,
    records: records.map((r) => {
      const section = r.classId?.section;
      const classLabel = r.classId
        ? section
          ? `${r.classId.name} - ${section}`
          : r.classId.name
        : '-';
      return {
        id: r._id,
        studentName: r.studentId?.name || '-',
        rollNo: r.studentId?.rollNo || '-',
        className: classLabel,
        status: (r.status || '-').toUpperCase(),
        checkInTime: toAmPm(r.checkInTime) || '-',
        checkOutTime: toAmPm(r.checkOutTime) || '-',
      };
    }),
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

function drawTableHeader(doc, y, cols) {
  const startX = 40;
  doc.save();
  doc.rect(startX, y, 515, 22).fill('#C62828');
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(9);
  let x = startX + 4;
  cols.forEach((c) => {
    doc.text(c.label, x, y + 6, { width: c.width, align: c.align || 'left' });
    x += c.width;
  });
  doc.restore();
  return y + 22;
}

function drawTableRow(doc, y, cols, values, stripe) {
  const startX = 40;
  const rowH = 20;
  if (y > 750) {
    doc.addPage();
    y = 40;
    y = drawTableHeader(doc, y, cols);
  }
  if (stripe) {
    doc.save();
    doc.rect(startX, y, 515, rowH).fill('#FFF5F5');
    doc.restore();
  }
  doc.fillColor('#212121').font('Helvetica').fontSize(9);
  let x = startX + 4;
  values.forEach((v, i) => {
    doc.text(String(v ?? '-'), x, y + 5, { width: cols[i].width - 4, align: cols[i].align || 'left' });
    x += cols[i].width;
  });
  doc
    .moveTo(startX, y + rowH)
    .lineTo(startX + 515, y + rowH)
    .strokeColor('#E0E0E0')
    .lineWidth(0.5)
    .stroke();
  return y + rowH;
}

function streamPdfReport(res, title, rows, meta = {}) {
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${title.replace(/\s+/g, '_')}.pdf"`);
  doc.pipe(res);

  doc.fontSize(18).fillColor('#C62828').font('Helvetica-Bold').text('Face Attendance Pro', { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(13).fillColor('#424242').font('Helvetica').text(title, { align: 'center' });
  doc.moveDown(0.4);
  doc
    .fontSize(9)
    .fillColor('#616161')
    .text(
      `Generated: ${dayjs().format('DD MMM YYYY, hh:mm A')}` +
        (meta.className ? `  |  Class: ${meta.className}` : '') +
        `  |  Total: ${rows.length}`,
      { align: 'center' }
    );
  doc.moveDown(0.8);

  // Summary chips
  const present = rows.filter((r) => String(r.status).toLowerCase() === 'present').length;
  const late = rows.filter((r) => String(r.status).toLowerCase() === 'late').length;
  const absent = rows.filter((r) => String(r.status).toLowerCase() === 'absent').length;
  doc.fontSize(10).fillColor('#212121').font('Helvetica-Bold');
  doc.text(`Present: ${present}    Late: ${late}    Absent: ${absent}    Records: ${rows.length}`);
  doc.moveDown(0.6);

  const cols = [
    { label: '#', width: 28, align: 'left' },
    { label: 'Roll', width: 55, align: 'left' },
    { label: 'Student Name', width: 140, align: 'left' },
    { label: 'Class', width: 90, align: 'left' },
    { label: 'Status', width: 60, align: 'left' },
    { label: 'Check In', width: 70, align: 'left' },
    { label: 'Check Out', width: 72, align: 'left' },
  ];

  let y = doc.y;
  y = drawTableHeader(doc, y, cols);

  if (!rows.length) {
    doc.fillColor('#757575').font('Helvetica').fontSize(11).text('No attendance records found.', 40, y + 16);
  } else {
    rows.forEach((row, i) => {
      y = drawTableRow(
        doc,
        y,
        cols,
        [
          i + 1,
          row.rollNo,
          row.studentName,
          row.className,
          row.status,
          row.checkInTime,
          row.checkOutTime,
        ],
        i % 2 === 1
      );
    });
  }

  doc.end();
}

async function streamExcelReport(res, title, rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Attendance');
  sheet.columns = [
    { header: '#', key: 'idx', width: 6 },
    { header: 'Roll No', key: 'rollNo', width: 12 },
    { header: 'Student', key: 'studentName', width: 24 },
    { header: 'Class', key: 'className', width: 18 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Check In', key: 'checkInTime', width: 14 },
    { header: 'Check Out', key: 'checkOutTime', width: 14 },
  ];
  rows.forEach((row, i) => sheet.addRow({ idx: i + 1, ...row }));
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFC62828' },
  };
  header.alignment = { vertical: 'middle', horizontal: 'center' };

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
