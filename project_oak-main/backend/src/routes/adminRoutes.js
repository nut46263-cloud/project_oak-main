const express = require('express');
const router = express.Router();
const BorrowRequest = require('../models/BorrowRequest');
const Item = require('../models/Item');

// ชุด endpoint จัดการคำขอแบบเดิม; app.js ปัจจุบัน mount borrowRoutes แทน
// ==========================================
// 1. API ดึงรายการยืมทั้งหมดสำหรับหน้าแอดมิน
// ==========================================
router.get('/dashboard/borrows', async (req, res) => {
  try {
    const { role, status } = req.query;
    let filter = {};

    if (status) {
      filter.status = status;
    }

    // ดึงข้อมูลการยืม พร้อมดึงข้อมูล User และ Item ที่เชื่อมโยงไว้
    let query = BorrowRequest.find(filter)
      .populate('user', 'identifier_code full_name department role email phone')
      .populate('items.item', 'item_code name category')
      .populate('approved_by', 'full_name')
      .sort({ createdAt: -1 });

    let borrows = await query;

    // ถ้ามีการกรองตาม role ของ User (เช่น student หรือ teacher)
    if (role) {
      borrows = borrows.filter(b => b.user && b.user.role === role);
    }

    res.status(200).json({
      success: true,
      count: borrows.length,
      data: borrows
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 2. API แอดมินกดอนุมัติคำขอยืม (pending -> approved)
// ==========================================
router.put('/borrows/:id/approve', async (req, res) => {
  try {
    const { admin_id } = req.body;
    const borrowId = req.params.id;

    const borrowReq = await BorrowRequest.findById(borrowId);
    if (!borrowReq) {
      return res.status(404).json({ success: false, message: 'ไม่พบคำขอยืมนี้' });
    }

    if (borrowReq.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'รายการนี้ถูกจัดการไปแล้ว' });
    }

    // อัปเดตสถานะเป็น approved
    borrowReq.status = 'approved';
    borrowReq.approved_by = admin_id;
    await borrowReq.save();

    // ตัดสต็อกอุปกรณ์ในตลัง (ลด available_qty, เพิ่ม borrowed_qty)
    for (let entry of borrowReq.items) {
      await Item.findByIdAndUpdate(entry.item, {
        $inc: { 
          available_qty: -entry.requested_qty, 
          borrowed_qty: entry.requested_qty 
        }
      });
    }

    res.status(200).json({ success: true, message: 'อนุมัติคำขอยืมเรียบร้อย', data: borrowReq });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 3. API แอดมินกดรับคืนอุปกรณ์ (approved -> returned)
// ==========================================
router.put('/borrows/:id/return', async (req, res) => {
  try {
    const borrowId = req.params.id;

    const borrowReq = await BorrowRequest.findById(borrowId);
    if (!borrowReq) {
      return res.status(404).json({ success: false, message: 'ไม่พบรายการยืมนี้' });
    }

    // คืนสต็อกสินค้ากลับเข้าคลัง
    for (let entry of borrowReq.items) {
      entry.returned_qty = entry.requested_qty;
      await Item.findByIdAndUpdate(entry.item, {
        $inc: { 
          available_qty: entry.requested_qty, 
          borrowed_qty: -entry.requested_qty 
        }
      });
    }

    borrowReq.status = 'returned';
    await borrowReq.save();

    res.status(200).json({ success: true, message: 'รับคืนอุปกรณ์เรียบร้อยแล้ว', data: borrowReq });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;