const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const customParseFormat = require('dayjs/plugin/customParseFormat');

dayjs.extend(utc);
dayjs.extend(customParseFormat);

const AMPM_FORMAT = 'hh:mm A';

function toAmPm(value) {
  if (value == null || value === '') return null;
  const d = dayjs(value);
  if (!d.isValid()) return null;
  return d.format(AMPM_FORMAT);
}

function formatAttendanceDoc(doc) {
  if (!doc) return doc;
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  return {
    ...obj,
    checkInTime: toAmPm(obj.checkInTime),
    checkOutTime: toAmPm(obj.checkOutTime),
    checkInTimeRaw: obj.checkInTime,
    checkOutTimeRaw: obj.checkOutTime,
    editHistory: (obj.editHistory || []).map((h) => ({
      ...h,
      editedAt: h.editedAt ? dayjs(h.editedAt).format('hh:mm A') : null,
      editedAtRaw: h.editedAt,
    })),
  };
}

function formatAttendanceList(list) {
  return (list || []).map(formatAttendanceDoc);
}

function todayDateString() {
  return dayjs().format('YYYY-MM-DD');
}

function parseAmPmTimeOnDate(dateStr, timeStr) {
  if (!timeStr) return null;
  const combined = dayjs(`${dateStr} ${timeStr}`, 'YYYY-MM-DD hh:mm A', true);
  if (combined.isValid()) return combined.toDate();
  const fallback = dayjs(`${dateStr} ${timeStr}`);
  return fallback.isValid() ? fallback.toDate() : null;
}

module.exports = {
  AMPM_FORMAT,
  toAmPm,
  formatAttendanceDoc,
  formatAttendanceList,
  todayDateString,
  parseAmPmTimeOnDate,
  dayjs,
};
