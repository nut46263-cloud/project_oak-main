const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // เชื่อมต่อ MongoDB ด้วย URI จาก environment ก่อนให้ API ใช้งานข้อมูล
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB Atlas Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`MongoDB Connection Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;