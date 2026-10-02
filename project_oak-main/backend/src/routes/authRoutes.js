const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// ส่ง endpoint สมัครสมาชิกและเข้าสู่ระบบไปยัง controller ด้านบัญชีผู้ใช้
router.post('/register/phone', authController.registerPhoneUser);
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/google', authController.googleLogin);

module.exports = router;