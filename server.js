// On Render, use Dashboard env vars only — never a committed .env with localhost
if (!process.env.RENDER && !process.env.RENDER_EXTERNAL_URL) {
  require('dotenv').config();
}
const http = require('http');
const app = require('./src/app');
const connectDB = require('./src/config/db');
const { initRedis } = require('./src/config/redis');
const { initSocket } = require('./src/socket/socketHandler');
const { startCronJobs } = require('./src/jobs/autoAbsentCron');
const { startMissingCheckoutCron } = require('./src/jobs/missingCheckoutCron');
const logger = require('./src/utils/logger');

const PORT = process.env.PORT || 5000;

async function bootstrap() {
  const mongoHint = process.env.MONGODB_URI
    ? process.env.MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@').slice(0, 80)
    : '(not set — will fail on Render)';
  logger.info(`Starting… PORT=${PORT} MONGODB_URI=${mongoHint}`);

  await connectDB();
  await initRedis();

  const server = http.createServer(app);
  initSocket(server);
  startCronJobs();
  startMissingCheckoutCron();

  // Bind 0.0.0.0 so Render (and other hosts) can detect the open port
  server.listen(PORT, '0.0.0.0', () => {
    logger.info(`Face Attendance Pro API listening on 0.0.0.0:${PORT}`);
  });
}

bootstrap().catch((err) => {
  logger.error('Failed to start server', err);
  process.exit(1);
});
