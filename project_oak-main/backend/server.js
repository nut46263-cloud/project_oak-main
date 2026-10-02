const http = require('http');
require('dotenv').config();

if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || !process.env.ADMIN_SECRET_KEY)) {
  throw new Error('Production server requires JWT_SECRET and ADMIN_SECRET_KEY');
}

const app = require('./src/app');
const connectDB = require('./src/config/db');
const socketService = require('./src/socket');

const PORT = process.env.PORT || 3000;

async function startServer() {
  await connectDB();

  const server = http.createServer(app);
  // ผูก Socket.IO เข้ากับ HTTP Server หลังฐานข้อมูลพร้อมใช้งาน
  socketService.init(server);

  server.listen(PORT, () => {
    console.log(`Server & Real-Time Engine running on port ${PORT}`);
  });
}

startServer().catch(error => {
  console.error('Server startup failed:', error.message);
  process.exit(1);
});