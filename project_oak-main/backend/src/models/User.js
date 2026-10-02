const mongoose = require('mongoose');

// โครงสร้างบัญชีผู้ใช้ พร้อมรหัสผ่านที่เก็บเป็น hash และบทบาทในระบบ
const userSchema = new mongoose.Schema({
  identifier_code: { type: String, required: true, unique: true }, // รหัสนักศึกษา/บุคลากร หรือรหัสภายในบัญชีโทรศัพท์
  google_sub: { type: String, unique: true, sparse: true },
  full_name: { type: String, required: true },
  department: { type: String, default: 'เทคโนโลยีสารสนเทศ (DIT)' },
  phone: { type: String, default: '' },
  email: { type: String, default: '' }, // ปลดล็อก required และ unique ออกแล้ว
  password_hash: { type: String, required: true },
  role: { type: String, enum: ['admin', 'teacher', 'student', 'user'], default: 'student' }
}, { timestamps: true });

userSchema.index({ phone: 1 }, {
  unique: true,
  partialFilterExpression: { phone: { $type: 'string', $gt: '' } }
});

module.exports = mongoose.model('User', userSchema);