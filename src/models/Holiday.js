const mongoose = require('mongoose');

const holidaySchema = new mongoose.Schema(
  {
    date: { type: String, required: true, unique: true }, // YYYY-MM-DD
    name: { type: String, required: true },
    type: { type: String, enum: ['holiday', 'exam', 'event'], default: 'holiday' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Holiday', holidaySchema);
