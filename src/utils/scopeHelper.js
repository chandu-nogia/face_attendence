const Class = require('../models/Class');
const Student = require('../models/Student');

/** Admin / principal see everything. Teachers are scoped to assigned classes. */
function isElevated(user) {
  return user && ['admin', 'principal'].includes(user.role);
}

/**
 * Returns null = no filter (all classes), or ObjectId[] of allowed class IDs.
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
    const kids = await Student.find({
      $or: [
        { parentUserId: user._id },
        { _id: { $in: user.linkedStudents || [] } },
        { parentEmail: user.email },
      ],
    }).select('classId');
    return [...new Set(kids.map((k) => String(k.classId)).filter(Boolean))];
  }

  return [];
}

async function assertClassAccess(user, classId) {
  if (isElevated(user)) return true;
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

async function isClassTeacherOfStudent(user, student) {
  if (isElevated(user)) return true;
  if (user.role !== 'teacher') return false;
  const classId = student.classId?._id || student.classId;
  return assertClassAccess(user, classId);
}

module.exports = {
  isElevated,
  getScopedClassIds,
  assertClassAccess,
  assertStudentAccess,
  isClassTeacherOfStudent,
};
