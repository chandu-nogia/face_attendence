let io = null;

function initSocket(server) {
  const { Server } = require('socket.io');
  io = new Server(server, {
    cors: {
      origin: process.env.CORS_ORIGIN === '*' ? true : process.env.CORS_ORIGIN?.split(',') || true,
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    socket.on('join:class', (classId) => {
      if (classId) socket.join(`class:${classId}`);
    });
    socket.on('join:dashboard', () => {
      socket.join('dashboard');
    });
  });

  return io;
}

function emitAttendanceEvent(event, payload) {
  if (!io) return;
  io.to('dashboard').emit(event, payload);
  if (payload?.attendance?.classId) {
    io.to(`class:${payload.attendance.classId}`).emit(event, payload);
  }
  if (payload?.student?.classId) {
    io.to(`class:${payload.student.classId}`).emit(event, payload);
  }
}

function getIO() {
  return io;
}

module.exports = { initSocket, emitAttendanceEvent, getIO };
