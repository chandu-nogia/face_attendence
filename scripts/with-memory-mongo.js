/**
 * Boots an in-memory MongoDB on 127.0.0.1:27017 when the system mongod
 * is unavailable, then runs seed + server (or whatever script is passed).
 *
 * Usage:
 *   node scripts/with-memory-mongo.js seed
 *   node scripts/with-memory-mongo.js dev
 */
const { spawn } = require('child_process');
const path = require('path');
const net = require('net');

function canConnect(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port }, () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.setTimeout(1500, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function main() {
  const mode = process.argv[2] || 'dev';
  let memoryServer = null;
  let uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/face_attendance_pro';

  const alreadyUp = await canConnect(27017);
  if (!alreadyUp) {
    console.log('Local MongoDB not reachable — starting mongodb-memory-server…');
    const { MongoMemoryServer } = require('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create({
      instance: { port: 27017, dbName: 'face_attendance_pro' },
    });
    uri = memoryServer.getUri('face_attendance_pro');
    console.log(`Memory Mongo ready: ${uri}`);
  } else {
    console.log('Using existing MongoDB on port 27017');
  }

  const env = { ...process.env, MONGODB_URI: uri };

  const run = (cmd, args) =>
    new Promise((resolve, reject) => {
      const child = spawn(cmd, args, {
        cwd: path.join(__dirname, '..'),
        env,
        stdio: 'inherit',
        shell: true,
      });
      child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
    });

  try {
    if (mode === 'seed') {
      await run('npm', ['run', 'seed']);
    } else if (mode === 'dev') {
      await run('npm', ['run', 'seed']);
      await run('npx', ['nodemon', 'server.js']);
    } else if (mode === 'start') {
      await run('node', ['server.js']);
    } else {
      throw new Error(`Unknown mode: ${mode}`);
    }
  } finally {
    if (memoryServer) {
      // keep memory mongo alive while nodemon runs — only stop on process exit
    }
  }
}

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
