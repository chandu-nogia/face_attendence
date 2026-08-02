const Joi = require('joi');
const Student = require('../models/Student');
const Class = require('../models/Class');
const { cloudinary, isCloudinaryConfigured } = require('../config/cloudinary');

const createSchema = Joi.object({
  name: Joi.string().required(),
  rollNo: Joi.string().required(),
  classId: Joi.string().required(),
  parentContact: Joi.string().allow('', null),
  faceEmbedding: Joi.array().items(Joi.number()).optional(),
  photoUrls: Joi.array().items(Joi.string()).optional(),
});

async function createStudent(req, res, next) {
  try {
    const { error, value } = createSchema.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.message });

    const klass = await Class.findById(value.classId);
    if (!klass) return res.status(404).json({ success: false, message: 'Class not found' });

    const student = await Student.create(value);
    klass.students.push(student._id);
    await klass.save();

    res.status(201).json({ success: true, data: student });
  } catch (err) {
    next(err);
  }
}

async function listStudents(req, res, next) {
  try {
    const filter = {};
    if (req.query.classId) filter.classId = req.query.classId;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.search) {
      filter.$or = [
        { name: new RegExp(req.query.search, 'i') },
        { rollNo: new RegExp(req.query.search, 'i') },
      ];
    }
    const students = await Student.find(filter)
      .populate('classId', 'name section')
      .select('-faceEmbedding')
      .sort({ rollNo: 1 });
    res.json({ success: true, data: students });
  } catch (err) {
    next(err);
  }
}

async function updateStudent(req, res, next) {
  try {
    const allowed = ['name', 'rollNo', 'parentContact', 'status', 'classId', 'faceEmbedding', 'photoUrls'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const existing = await Student.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Student not found' });

    const oldClassId = existing.classId?.toString();
    const newClassId = updates.classId ? String(updates.classId) : null;

    if (newClassId) {
      const klass = await Class.findById(newClassId);
      if (!klass) return res.status(404).json({ success: false, message: 'Class not found' });
    }

    const student = await Student.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    })
      .populate('classId', 'name section')
      .select('-faceEmbedding');

    if (newClassId && oldClassId && newClassId !== oldClassId) {
      await Class.findByIdAndUpdate(oldClassId, { $pull: { students: student._id } });
      await Class.findByIdAndUpdate(newClassId, { $addToSet: { students: student._id } });
    }

    res.json({ success: true, data: student });
  } catch (err) {
    next(err);
  }
}

async function deleteStudent(req, res, next) {
  try {
    const hard = req.query.hard === 'true' || req.body?.hard === true;
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

    if (hard) {
      await Class.updateMany({ students: student._id }, { $pull: { students: student._id } });
      await Student.findByIdAndDelete(student._id);
      return res.json({ success: true, message: 'Student permanently deleted' });
    }

    student.status = 'inactive';
    await student.save();
    res.json({ success: true, message: 'Student deactivated', data: student });
  } catch (err) {
    next(err);
  }
}

async function enrollFace(req, res, next) {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

    let embedding = req.body.faceEmbedding;
    if (typeof embedding === 'string') {
      try {
        embedding = JSON.parse(embedding);
      } catch (_) {
        /* keep as-is */
      }
    }
    if (!Array.isArray(embedding) || embedding.length === 0) {
      return res.status(400).json({ success: false, message: 'faceEmbedding array is required' });
    }

    student.faceEmbedding = embedding.map(Number);

    if (req.file) {
      if (isCloudinaryConfigured()) {
        const uploaded = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: 'face_attendance/enrollments' },
            (err, result) => (err ? reject(err) : resolve(result))
          );
          stream.end(req.file.buffer);
        });
        student.photoUrls.push(uploaded.secure_url);
      } else {
        const b64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
        student.photoUrls.push(b64.slice(0, 200) + '...[stored_locally_placeholder]');
      }
    }

    if (Array.isArray(req.body.photoUrls)) {
      student.photoUrls.push(...req.body.photoUrls);
    }

    await student.save();
    res.json({
      success: true,
      message: 'Face enrolled successfully',
      data: {
        id: student._id,
        name: student.name,
        embeddingLength: student.faceEmbedding.length,
        photoCount: student.photoUrls.length,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function bulkImport(req, res, next) {
  try {
    const students = req.body.students;
    if (!Array.isArray(students) || !students.length) {
      return res.status(400).json({ success: false, message: 'students array required' });
    }
    const created = [];
    const errors = [];
    for (const item of students) {
      try {
        const student = await Student.create(item);
        if (item.classId) {
          await Class.findByIdAndUpdate(item.classId, { $addToSet: { students: student._id } });
        }
        created.push(student);
      } catch (e) {
        errors.push({ item, error: e.message });
      }
    }
    res.status(201).json({ success: true, data: { created: created.length, errors } });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createStudent,
  listStudents,
  updateStudent,
  deleteStudent,
  enrollFace,
  bulkImport,
};
