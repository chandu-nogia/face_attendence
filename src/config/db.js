const mongoose = require('mongoose');
const logger = require('../utils/logger');

function isCloudHost() {
  return (
    process.env.RENDER === 'true' ||
    Boolean(process.env.RENDER_EXTERNAL_URL) ||
    process.env.NODE_ENV === 'production'
  );
}

async function connectDB() {
  const uri = process.env.MONGODB_URI || '';
  const isLocalhost = /127\.0\.0\.1|localhost/.test(uri);

  if (isCloudHost()) {
    if (!uri || isLocalhost || !uri.startsWith('mongodb')) {
      logger.error(
        'Render is missing a valid Atlas MONGODB_URI. ' +
          'Dashboard → your service → Environment → Add: ' +
          'MONGODB_URI=mongodb+srv://USER:PASS@cluster0....mongodb.net/face_attendance_pro?appName=Cluster0 ' +
          'Also set NODE_ENV=production. Then Manual Deploy.'
      );
      throw new Error(
        'MONGODB_URI must be a MongoDB Atlas mongodb+srv://... string on Render (not 127.0.0.1).'
      );
    }
  }

  const finalUri = uri || 'mongodb://127.0.0.1:27017/face_attendance_pro';
  mongoose.set('strictQuery', true);
  await mongoose.connect(finalUri);
  logger.info('MongoDB connected');
}

module.exports = connectDB;
