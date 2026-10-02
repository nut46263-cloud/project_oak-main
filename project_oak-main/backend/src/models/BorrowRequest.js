const mongoose = require('mongoose');

// รายการอุปกรณ์ย่อยในคำขอ เก็บจำนวนที่ยืมและผลการคืนแยกเป็นรายการ
const borrowItemSchema = new mongoose.Schema({
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  requested_qty: { type: Number, required: true, min: 1 },
  returned_qty: { type: Number, default: 0 },
  damaged_qty: { type: Number, default: 0 },
  lost_qty: { type: Number, default: 0 }
}, { _id: false });

const borrowRequestSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  group_name: { type: String, default: '' },
  project_name: { type: String, required: true },
  purpose: { type: String, required: true },
  borrow_date: { type: Date, required: true },
  due_date: { type: Date, required: true },
  return_date: { type: Date, default: null },
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected', 'returned', 'overdue'], 
    default: 'pending' 
  },
  approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  items: [borrowItemSchema]
}, { timestamps: true });

module.exports = mongoose.model('BorrowRequest', borrowRequestSchema);