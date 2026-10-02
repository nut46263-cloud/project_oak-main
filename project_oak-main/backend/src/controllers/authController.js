const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');

const googleClient = new OAuth2Client();
const normalizePhone = value => String(value || '').replace(/[\s()-]/g, '');

function createSessionToken(user) {
  return jwt.sign(
    { id: user._id, identifier_code: user.identifier_code, role: user.role, department: user.department },
    process.env.JWT_SECRET || 'fallback_secret_key',
    { expiresIn: '1d' }
  );
}

// 1. ลงทะเบียนผู้ใช้ใหม่ (ใช้เฉพาะรหัสนักศึกษา/บุคลากร)
exports.register = async (req, res) => {
  try {
    // ตรวจข้อมูลซ้ำและสิทธิ์ก่อนแฮชรหัสผ่าน แล้วจึงสร้างผู้ใช้
    const { 
  identifier_code, 
  full_name, 
  department = 'เทคโนโลยีสารสนเทศ (DIT)', // กำหนดค่าเริ่มต้นไว้ตรงนี้ถ้าหน้าบ้านไม่ส่งมา
  phone, 
  email, 
  password, 
  role = 'student', 
  admin_secret 
} = req.body;
    if (!identifier_code || !password || !full_name) {
      return res.status(400).json({ message: 'กรุณากรอกรหัสประจำตัว ชื่อ-นามสกุล และรหัสผ่าน' });
    }

    // ตรวจสอบเฉพาะรหัสประจำตัวว่าซ้ำหรือไม่ (ปลดล็อกเงื่อนไขอีเมลออก)
    const existingUser = await User.findOne({ identifier_code });
    if (existingUser) {
      return res.status(400).json({ message: 'รหัสนักศึกษา/บุคลากรนี้ถูกลงทะเบียนไว้แล้ว' });
    }

    // ตรวจสอบสิทธิ์สำหรับ Admin / Teacher
    let assignedRole = 'student';
    if (role === 'admin') {
      if (!admin_secret || admin_secret !== process.env.ADMIN_SECRET_KEY) {
        return res.status(403).json({ message: 'รหัสลับ Admin ไม่ถูกต้อง' });
      }
      assignedRole = 'admin';
    } else if (role === 'teacher') {
      if (!admin_secret || admin_secret !== process.env.ADMIN_SECRET_KEY) {
        return res.status(403).json({ message: 'รหัสลับ Teacher ไม่ถูกต้อง' });
      }
      assignedRole = 'teacher';
    }

    // เข้ารหัสผ่าน
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const newUser = await User.create({
      identifier_code,
      full_name,
      department,
      phone,
      email: email || undefined, // บันทึกเฉพาะเมื่อมีส่งมา
      password_hash,
      role: assignedRole
    });

    res.status(201).json({
      message: `ลงทะเบียนสำเร็จในบทบาท ${assignedRole}`,
      userId: newUser._id
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 2. เข้าสู่ระบบ (ตรวจสอบจากรหัสนักศึกษา/บุคลากรเป็นหลัก)
exports.login = async (req, res) => {
  try {
    // ตรวจข้อมูลเข้าสู่ระบบ จากนั้นออก JWT และส่งข้อมูลผู้ใช้ที่จำเป็นกลับไป
    const { phone, identifier_code, identifier_code_or_email, password } = req.body;
    const loginIdentifier = phone || identifier_code || identifier_code_or_email;

    if (!loginIdentifier || !password) {
      return res.status(400).json({ message: 'กรุณากรอกรหัสประจำตัวและรหัสผ่าน' });
    }

    // ค้นหาผู้ใช้จาก identifier_code (รองรับ email สำรองสำหรับ seed data)
    const user = await User.findOne({
      $or: [
        { identifier_code: loginIdentifier },
        { phone: normalizePhone(loginIdentifier) },
        { email: loginIdentifier }
      ]
    });

    if (!user) {
      return res.status(400).json({ message: 'รหัสประจำตัวหรือรหัสผ่านไม่ถูกต้อง' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ message: 'รหัสประจำตัวหรือรหัสผ่านไม่ถูกต้อง' });
    }

    const token = createSessionToken(user);

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        identifier_code: user.identifier_code,
        phone: user.phone,
        full_name: user.full_name,
        role: user.role,
        department: user.department
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.registerPhoneUser = async (req, res) => {
  try {
    const { phone, full_name, password } = req.body;
    const normalizedPhone = normalizePhone(phone);
    if (!/^[+]?[0-9]{9,15}$/.test(normalizedPhone)) {
      return res.status(400).json({ message: 'กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง' });
    }
    if (!full_name?.trim() || !password || password.length < 8) {
      return res.status(400).json({ message: 'กรุณากรอกชื่อ-นามสกุลและรหัสผ่านอย่างน้อย 8 ตัวอักษร' });
    }

    const existingUser = await User.findOne({ phone: normalizedPhone });
    if (existingUser) return res.status(409).json({ message: 'เบอร์โทรศัพท์นี้มีบัญชีแล้ว' });

    const user = await User.create({
      identifier_code: `PHONE-${normalizedPhone}`,
      full_name: full_name.trim(),
      phone: normalizedPhone,
      password_hash: await bcrypt.hash(password, 10),
      role: 'user'
    });

    res.status(201).json({
      message: 'สมัครบัญชีผู้ใช้ทั่วไปสำเร็จ',
      token: createSessionToken(user),
      user: {
        id: user._id,
        phone: user.phone,
        full_name: user.full_name,
        role: user.role,
        department: user.department
      }
    });
  } catch (error) {
    const status = error.code === 11000 ? 409 : 500;
    res.status(status).json({ message: error.code === 11000 ? 'เบอร์โทรศัพท์นี้มีบัญชีแล้ว' : error.message });
  }
};

exports.normalizePhone = normalizePhone;

exports.googleLogin = async (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(503).json({ message: 'ยังไม่ได้ตั้งค่า Google Sign-In' });
  }

  const { credential, identifier_code, full_name } = req.body;
  if (!credential) return res.status(400).json({ message: 'ไม่พบข้อมูลยืนยันจาก Google' });

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    const profile = ticket.getPayload();
    if (!profile?.sub || !profile.email || !profile.email_verified) {
      return res.status(401).json({ message: 'บัญชี Google ยังยืนยันอีเมลไม่สำเร็จ' });
    }

    let user = await User.findOne({ google_sub: profile.sub });
    if (!user && (!identifier_code?.trim() || !full_name?.trim())) {
      return res.json({ requiresProfile: true, email: profile.email, suggestedName: profile.name || '' });
    }

    if (!user) {
      const normalizedCode = identifier_code.trim();
      const existingCode = await User.findOne({ identifier_code: normalizedCode });
      if (existingCode) {
        return res.status(409).json({ message: 'รหัสนักศึกษานี้มีบัญชีแล้ว กรุณาเข้าสู่ระบบด้วยบัญชีเดิม' });
      }

      const normalizedEmail = profile.email.toLowerCase();
      const existingEmail = await User.findOne({ email: normalizedEmail });
      if (existingEmail) {
        return res.status(409).json({ message: 'อีเมลนี้มีบัญชีอยู่แล้ว กรุณาเข้าสู่ระบบด้วยบัญชีเดิมก่อน' });
      }

      user = await User.create({
        identifier_code: normalizedCode,
        full_name: full_name.trim(),
        email: normalizedEmail,
        google_sub: profile.sub,
        department: 'เทคโนโลยีสารสนเทศ (DIT)',
        password_hash: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10),
        role: 'student'
      });
    }

    res.json({
      token: createSessionToken(user),
      user: {
        id: user._id,
        identifier_code: user.identifier_code,
        full_name: user.full_name,
        role: user.role,
        department: user.department
      }
    });
  } catch (error) {
    res.status(401).json({ message: 'ยืนยันตัวตน Google ไม่สำเร็จ กรุณาลองอีกครั้ง' });
  }
};