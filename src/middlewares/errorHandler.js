const logger = require('../utils/logger');

function errorHandler(err, _req, res, _next) {
  logger.error(err.message, err);

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: Object.values(err.errors)
        .map((e) => e.message)
        .join(', '),
    });
  }

  if (err.code === 11000) {
    return res.status(409).json({ success: false, message: 'Duplicate entry' });
  }

  const status = err.statusCode || 500;
  res.status(status).json({
    success: false,
    message: err.message || 'Internal server error',
  });
}

module.exports = errorHandler;
