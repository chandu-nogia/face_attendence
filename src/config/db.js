const mongoose = require('mongoose');
const logger = require('../utils/logger');

async function connectDB() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/face_attendance_pro';
  const isProd = process.env.NODE_ENV === 'production';
  const isLocalhost = /127\.0\.0\.1|localhost/.test(uri);

  if (isProd && (!process.env.MONGODB_URI || isLocalhost)) {
    throw new Error(
      'MONGODB_URI must be set to your MongoDB Atlas connection string on Render. ' +
        'Dashboard → Environment → add MONGODB_URI (mongodb+srv://...). ' +
        'Local 127.0.0.1 is not available on Render.'
    );
  }

  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  logger.info('MongoDB connected');
}

module.exports = connectDB;
