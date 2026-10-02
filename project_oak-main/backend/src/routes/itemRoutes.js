const express = require('express');
const router = express.Router();
const Item = require('../models/Item');
const socket = require('../socket');
const { authenticate, requireAdmin } = require('../middleware/authMiddleware');

// เปิด endpoint อ่านรายการอุปกรณ์จากฐานข้อมูลสำหรับหน้าแสดงรายการ
router.get('/', async (req, res) => {
  try {
    const items = await Item.find().sort({ name: 1 });
    res.json(items);
  } catch (error) {
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูลอุปกรณ์', error: error.message });
  }
});

router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { item_code, name, category, total_qty, image_url = '', description = '' } = req.body;
    const quantity = Number(total_qty);

    if (!item_code?.trim() || !name?.trim() || !['durable', 'consumable'].includes(category)) {
      return res.status(400).json({ message: 'กรุณากรอกรหัส ชื่อ และหมวดหมู่สินค้าให้ครบ' });
    }
    if (!Number.isInteger(quantity) || quantity < 0) {
      return res.status(400).json({ message: 'จำนวนสินค้าเริ่มต้นต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป' });
    }

    const item = await Item.create({
      item_code: item_code.trim(),
      name: name.trim(),
      category,
      total_qty: quantity,
      available_qty: quantity,
      image_url: image_url.trim(),
      description: description.trim()
    });

    socket.getIO().emit('stock_updated', [item]);
    res.status(201).json({ message: 'เพิ่มสินค้าเรียบร้อยแล้ว', data: item });
  } catch (error) {
    const status = error.code === 11000 ? 409 : 500;
    res.status(status).json({ message: error.code === 11000 ? 'รหัสสินค้านี้มีอยู่แล้ว' : error.message });
  }
});

router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'ไม่พบสินค้า' });

    const { item_code, name, category, total_qty, image_url, description } = req.body;
    const occupied = item.borrowed_qty + item.damaged_qty + item.lost_qty;

    if (total_qty !== undefined) {
      const quantity = Number(total_qty);
      if (!Number.isInteger(quantity) || quantity < occupied) {
        return res.status(400).json({ message: `จำนวนรวมต้องไม่น้อยกว่าจำนวนที่ถูกยืม ชำรุด หรือสูญหาย (${occupied})` });
      }
      item.total_qty = quantity;
      item.available_qty = quantity - occupied;
    }
    if (item_code !== undefined) item.item_code = item_code.trim();
    if (name !== undefined) item.name = name.trim();
    if (category !== undefined) {
      if (!['durable', 'consumable'].includes(category)) {
        return res.status(400).json({ message: 'หมวดหมู่สินค้าไม่ถูกต้อง' });
      }
      if (item.borrowed_qty > 0 && category !== item.category) {
        return res.status(400).json({ message: 'เปลี่ยนหมวดหมู่ไม่ได้ขณะที่สินค้ายังถูกยืมอยู่' });
      }
      item.category = category;
    }
    if (image_url !== undefined) item.image_url = image_url.trim();
    if (description !== undefined) item.description = description.trim();

    await item.save();
    socket.getIO().emit('stock_updated', [item]);
    res.json({ message: 'บันทึกข้อมูลสินค้าเรียบร้อยแล้ว', data: item });
  } catch (error) {
    const status = error.code === 11000 ? 409 : 500;
    res.status(status).json({ message: error.code === 11000 ? 'รหัสสินค้านี้มีอยู่แล้ว' : error.message });
  }
});

module.exports = router;