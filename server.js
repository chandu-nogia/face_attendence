require('dotenv').config();
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
  await connectDB();
  await initRedis();

  const server = http.createServer(app);
  initSocket(server);
  startCronJobs();
  startMissingCheckoutCron();

  server.listen(PORT, () => {
    logger.info(`Face Attendance Pro API listening on port ${PORT}`);
  });
}

bootstrap().catch((err) => {
  logger.error('Failed to start server', err);
  process.exit(1);
});
