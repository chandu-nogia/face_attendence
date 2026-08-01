const jwt = require('jsonwebtoken');

function generateAccessToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET || 'dev_secret', {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

function generateRefreshToken(payload) {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret', {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET || 'dev_secret');
}

function verifyRefreshToken(token) {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret');
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
};
