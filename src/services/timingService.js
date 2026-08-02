const { dayjs } = require('./timeFormatService');

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatHm(hour, minute) {
  const h = ((hour % 24) + 24) % 24;
  const m = ((minute % 60) + 60) % 60;
  const d = dayjs().hour(h).minute(m).second(0);
  return d.format('h:mm A');
}

/**
 * Normalized school timing policy from AttendanceSettings / env defaults.
 */
function getTimingPolicy(settings = {}) {
  const startHour = num(settings.schoolStartHour, 8);
  const startMinute = num(settings.schoolStartMinute, 0);
  const endHour = num(settings.schoolEndHour, 14);
  const endMinute = num(settings.schoolEndMinute, 0);
  const lateAfterMinutes = num(settings.lateAfterMinutes, 15);
  const checkInOpensMinutesBefore = num(settings.checkInOpensMinutesBefore, 60);
  const earlyLeaveMinutes = num(settings.earlyLeaveMinutes, 60);
  const checkoutGraceMinutes = num(settings.checkoutGraceMinutes, 30);
  const halfDayAfterHours = num(settings.halfDayAfterHours, 4);
  const autoAbsentHour = num(settings.autoAbsentHour, 18);
  const autoAbsentMinute = num(settings.autoAbsentMinute, 0);
  const blockCheckInAfterLateMinutes = num(settings.blockCheckInAfterLateMinutes, 0);

  return {
    startHour,
    startMinute,
    endHour,
    endMinute,
    lateAfterMinutes,
    checkInOpensMinutesBefore,
    earlyLeaveMinutes,
    checkoutGraceMinutes,
    halfDayAfterHours,
    autoAbsentHour,
    autoAbsentMinute,
    blockCheckInAfterLateMinutes,
  };
}

function atTimeOnDate(dateLike, hour, minute) {
  return dayjs(dateLike).hour(hour).minute(minute).second(0).millisecond(0);
}

function getDayAnchors(settings, when = new Date()) {
  const p = getTimingPolicy(settings);
  const start = atTimeOnDate(when, p.startHour, p.startMinute);
  const end = atTimeOnDate(when, p.endHour, p.endMinute);
  const lateThreshold = start.add(p.lateAfterMinutes, 'minute');
  const checkInOpens = start.subtract(p.checkInOpensMinutesBefore, 'minute');
  const earlyLeaveCutoff = end.subtract(p.earlyLeaveMinutes, 'minute');
  const checkoutDeadline = end.add(p.checkoutGraceMinutes, 'minute');
  const hardCheckInCutoff =
    p.blockCheckInAfterLateMinutes > 0
      ? lateThreshold.add(p.blockCheckInAfterLateMinutes, 'minute')
      : null;
  const autoAbsentAt = atTimeOnDate(when, p.autoAbsentHour, p.autoAbsentMinute);

  return {
    policy: p,
    start,
    end,
    lateThreshold,
    checkInOpens,
    earlyLeaveCutoff,
    checkoutDeadline,
    hardCheckInCutoff,
    autoAbsentAt,
  };
}

/**
 * Decide present / late for a check-in instant.
 * Returns { status, reason, blocked?, message? }
 */
function resolveCheckInStatus(checkInTime, settings) {
  const anchors = getDayAnchors(settings, checkInTime);
  const t = dayjs(checkInTime);

  if (t.isBefore(anchors.checkInOpens)) {
    return {
      status: null,
      blocked: true,
      message: `Check-in opens at ${anchors.checkInOpens.format('h:mm A')}`,
      anchors,
    };
  }

  if (anchors.hardCheckInCutoff && t.isAfter(anchors.hardCheckInCutoff)) {
    return {
      status: null,
      blocked: true,
      message: `Check-in closed after ${anchors.hardCheckInCutoff.format('h:mm A')}. Mark manually or request regularization.`,
      anchors,
    };
  }

  const status = t.isAfter(anchors.lateThreshold) ? 'late' : 'present';
  return {
    status,
    blocked: false,
    reason:
      status === 'late'
        ? `Arrived after grace (${anchors.lateThreshold.format('h:mm A')})`
        : `On time (before ${anchors.lateThreshold.format('h:mm A')})`,
    anchors,
  };
}

/**
 * After checkout, may downgrade present/late → half-day if left too early
 * or stayed less than halfDayAfterHours.
 */
function resolveStatusAfterCheckout(attendance, checkoutTime, settings) {
  const anchors = getDayAnchors(settings, attendance.checkInTime || checkoutTime);
  const p = anchors.policy;
  const out = dayjs(checkoutTime);
  let status = attendance.status;
  let note = null;

  if (['present', 'late'].includes(status) && out.isBefore(anchors.earlyLeaveCutoff)) {
    status = 'half-day';
    note = `Early leave before ${anchors.earlyLeaveCutoff.format('h:mm A')}`;
  }

  if (attendance.checkInTime && p.halfDayAfterHours > 0) {
    const hours = out.diff(dayjs(attendance.checkInTime), 'minute') / 60;
    if (hours > 0 && hours < p.halfDayAfterHours && ['present', 'late'].includes(attendance.status)) {
      status = 'half-day';
      note = note || `Stayed under ${p.halfDayAfterHours}h (${hours.toFixed(1)}h)`;
    }
  }

  return { status, note, anchors };
}

function buildTimingSummary(settings) {
  const p = getTimingPolicy(settings);
  const startLabel = formatHm(p.startHour, p.startMinute);
  const endLabel = formatHm(p.endHour, p.endMinute);
  const lateHour = dayjs().hour(p.startHour).minute(p.startMinute).add(p.lateAfterMinutes, 'minute');
  const openHour = dayjs()
    .hour(p.startHour)
    .minute(p.startMinute)
    .subtract(p.checkInOpensMinutesBefore, 'minute');
  const earlyCut = dayjs()
    .hour(p.endHour)
    .minute(p.endMinute)
    .subtract(p.earlyLeaveMinutes, 'minute');

  return {
    schoolStart: startLabel,
    schoolEnd: endLabel,
    checkInOpens: openHour.format('h:mm A'),
    lateAfter: lateHour.format('h:mm A'),
    lateAfterMinutes: p.lateAfterMinutes,
    earlyLeaveBefore: earlyCut.format('h:mm A'),
    checkoutGraceMinutes: p.checkoutGraceMinutes,
    halfDayAfterHours: p.halfDayAfterHours,
    autoAbsent: formatHm(p.autoAbsentHour, p.autoAbsentMinute),
    blockCheckInAfterLateMinutes: p.blockCheckInAfterLateMinutes,
    label: `Day ${startLabel}–${endLabel} · Late after ${lateHour.format('h:mm A')} · Check-in from ${openHour.format('h:mm A')}`,
  };
}

module.exports = {
  getTimingPolicy,
  getDayAnchors,
  resolveCheckInStatus,
  resolveStatusAfterCheckout,
  buildTimingSummary,
  formatHm,
  pad2,
};
