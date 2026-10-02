const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/authRoutes');
const itemRoutes = require('./routes/itemRoutes');
const borrowRoutes = require('./routes/borrowRoutes'); // ปลดคอมเมนต์บรรทัดนี้

const app = express();

// เปิด CORS และแปลง JSON ก่อนส่งคำขอไปยัง route ที่รับผิดชอบ
app.use(cors());
app.use(express.json());

// แยกเส้นทาง API ตามงาน: บัญชีผู้ใช้, รายการอุปกรณ์ และคำขอยืม
app.use('/api/auth', authRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/borrows', borrowRoutes); // ปลดคอมเมนต์บรรทัดนี้

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/config.js', (req, res) => {
	res.type('application/javascript').send(`window.APP_CONFIG = Object.freeze(${JSON.stringify({ googleClientId: process.env.GOOGLE_CLIENT_ID || '' })});`);
});
app.use(express.static(path.resolve(__dirname, '../../Frontend')));

module.exports = app;