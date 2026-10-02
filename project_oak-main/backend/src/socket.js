const { Server } = require('socket.io');

let io;

module.exports = {
  // ผูก Socket.IO กับ HTTP Server เพื่อส่งเหตุการณ์แบบเรียลไทม์
  init: (httpServer) => {
    io = new Server(httpServer, {
      cors: {
        origin: '*', // กำหนด Domain Frontend ภายหลังได้
        methods: ['GET', 'POST', 'PUT', 'DELETE']
      }
    });

    io.on('connection', (socket) => {
      console.log(`Client connected: ${socket.id}`);
      
      socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
      });
    });

    return io;
  },
  // คืน instance ที่เริ่มต้นแล้ว; แจ้งข้อผิดพลาดหากเรียกก่อน init
  getIO: () => {
    if (!io) {
      throw new Error('Socket.io is not initialized!');
    }
    return io;
  }
};