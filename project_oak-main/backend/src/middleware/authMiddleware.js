const jwt = require('jsonwebtoken');

const authenticate = (req, res, next) => {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'กรุณาเข้าสู่ระบบก่อนทำรายการ' });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_key');
    next();
  } catch (error) {
    res.status(401).json({ message: 'เซสชันหมดอายุหรือไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่' });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'เฉพาะผู้ดูแลระบบเท่านั้นที่ทำรายการนี้ได้' });
  }

  next();
};

module.exports = { authenticate, requireAdmin };