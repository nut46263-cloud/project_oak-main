const mongoose = require('mongoose');

// ข้อมูลอุปกรณ์และยอดคงคลังแยกตามสถานะการใช้งาน
const itemSchema = new mongoose.Schema({
  item_code: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  category: { type: String, enum: ['durable', 'consumable'], required: true }, // ครุภัณฑ์ / วัสดุสิ้นเปลือง
  total_qty: { type: Number, required: true, min: 0 },
  available_qty: { type: Number, required: true, min: 0 },
  borrowed_qty: { type: Number, default: 0, min: 0 },
  damaged_qty: { type: Number, default: 0, min: 0 },
  lost_qty: { type: Number, default: 0, min: 0 },
  image_url: { type: String, default: '' },
  description: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Item', itemSchema);