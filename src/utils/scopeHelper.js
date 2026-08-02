const Class = require('../models/Class');
const Student = require('../models/Student');
const { getSettings } = require('../services/settingsService');

/** Admin / principal see everything. Teachers are scoped to assigned classes. */
function isElevated(user) {
  return user && ['admin', 'principal'].includes(user.role);
}

/**
 * Returns null = no filter (all classes), or string[] of allowed class IDs.
 */
async function getScopedClassIds(user) {
  if (!user) return [];
  if (isElevated(user)) return null;

  if (user.role === 'teacher') {
    const assigned = (user.classesAssigned || []).map((id) => String(id));
    const asClassTeacher = await Class.find({ teacherId: user._id }).select('_id');
    const ids = new Set([...assigned, ...asClassTeacher.map((c) => String(c._id))]);
    return [...ids];
  }

  if (user.role === 'student' && user.studentProfileId) {
    const student = await Student.findById(user.studentProfileId).select('classId');
    return student?.classId ? [String(student.classId)] : [];
  }

  if (user.role === 'parent') {
    const kids = await getLinkedStudents(user);
    return [...new Set(kids.map((k) => String(k.classId)).filter(Boolean))];
  }

  return [];
}

/** Linked / own students for parent & student roles. */
async function getLinkedStudents(user) {
  if (!user) return [];
  if (user.role === 'student' && user.studentProfileId) {
    const s = await Student.findById(user.studentProfileId).select('_id classId name rollNo');
    return s ? [s] : [];
  }
  if (user.role === 'parent') {
    return Student.find({
      $or: [
        { parentUserId: user._id },
        { _id: { $in: user.linkedStudents || [] } },
        { parentEmail: user.email },
      ],
    }).select('_id classId name rollNo');
  }
  return [];
}

/**
 * Returns null = no student filter, or string[] of allowed student IDs.
 * Parents/students get own/linked IDs only (not classmates).
 */
async function getScopedStudentIds(user) {
  if (!user) return [];
  if (isElevated(user)) return null;

  if (user.role === 'teacher') {
    const classIds = await getScopedClassIds(user);
    if (!classIds?.length) return [];
    const students = await Student.find({ classId: { $in: classIds } }).select('_id');
    return students.map((s) => String(s._id));
  }

  if (user.role === 'student' || user.role === 'parent') {
    const kids = await getLinkedStudents(user);
    return kids.map((k) => String(k._id));
  }

  return [];
}

async function assertClassAccess(user, classId) {
  if (isElevated(user)) return true;
  if (!classId) return false;
  const scoped = await getScopedClassIds(user);
  if (scoped === null) return true;
  return scoped.map(String).includes(String(classId));
}

async function assertStudentAccess(user, studentId) {
  if (isElevated(user)) return true;
  if (user.role === 'student') {
    return String(user.studentProfileId) === String(studentId);
  }
  if (user.role === 'parent') {
    const linked = (user.linkedStudents || []).map(String);
    if (linked.includes(String(studentId))) return true;
    const s = await Student.findById(studentId).select('parentUserId parentEmail');
    return (
      s &&
      (String(s.parentUserId) === String(user._id) || s.parentEmail === user.email)
    );
  }
  if (user.role === 'teacher') {
    const s = await Student.findById(studentId).select('classId');
    if (!s) return false;
    return assertClassAccess(user, s.classId);
  }
  return false;
}

async function assertAttendanceAccess(user, attendance) {
  if (isElevated(user)) return true;
  if (!attendance) return false;
  if (attendance.classId) {
    const ok = await assertClassAccess(user, attendance.classId);
    if (ok) return true;
  }
  return assertStudentAccess(user, attendance.studentId);
}

async function isClassTeacherOfStudent(user, student) {
  if (isElevated(user)) return true;
  if (user.role !== 'teacher') return false;
  const classId = student.classId?._id || student.classId;
  return assertClassAccess(user, classId);
}

/** Teachers may enroll students only when school setting allows it. */
async function canTeacherEnrollStudents(user) {
  if (isElevated(user)) return true;
  if (user?.role !== 'teacher') return false;
  const settings = await getSettings();
  return settings.allowTeacherEnrollStudents === true;
}

/**
 * Apply role scope onto an attendance Mongo filter (mutates filter).
 * For parents/students uses studentId list (not class classmates).
 */
async function applyAttendanceScope(user, filter) {
  if (isElevated(user)) return filter;

  if (user.role === 'student' || user.role === 'parent') {
    const ids = await getScopedStudentIds(user);
    filter.studentId = { $in: ids };
    delete filter.classId;
    return filter;
  }

  const scoped = await getScopedClassIds(user);
  if (scoped !== null) {
    if (filter.classId) {
      if (!scoped.map(String).includes(String(filter.classId))) {
        filter.classId = { $in: [] };
      }
    } else {
      filter.classId = { $in: scoped };
    }
  }
  return filter;
}

module.exports = {
  isElevated,
  getScopedClassIds,
  getScopedStudentIds,
  getLinkedStudents,
  assertClassAccess,
  assertStudentAccess,
  assertAttendanceAccess,
  isClassTeacherOfStudent,
  canTeacherEnrollStudents,
  applyAttendanceScope,
};
