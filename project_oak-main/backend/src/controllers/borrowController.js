const mongoose = require('mongoose');
const BorrowRequest = require('../models/BorrowRequest');
const Item = require('../models/Item');
const socket = require('../socket');

// 1. ดึงรายการคำขอยืมทั้งหมด (สำหรับแสดงผลบนตารางหน้า admin.html)
exports.getAllRequests = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    // เติมข้อมูลผู้ยืมและอุปกรณ์ที่อ้างอิง เพื่อให้หน้าแอดมินแสดงผลได้ในคำขอเดียว
    let requests = await BorrowRequest.find(filter)
      .populate('user', 'identifier_code full_name department role phone')
      .populate('items.item', 'name item_code category available_qty borrowed_qty')
      .sort({ createdAt: -1 });

    if (req.query.role) {
      requests = requests.filter(request => request.user?.role === req.query.role);
    }

    res.json(requests);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getMyRequests = async (req, res) => {
  try {
    const requests = await BorrowRequest.find({ user: req.user.id })
      .populate('items.item', 'name item_code category')
      .sort({ createdAt: -1 });
    res.json(requests);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 2. นักศึกษาส่งคำขอยืม (บันทึกข้อมูลและส่ง Socket ไปยังหน้า Admin)
exports.createRequest = async (req, res) => {
  try {
    const { group_name, project_name, purpose, borrow_date, due_date, items } = req.body;
    // บันทึกคำขอ แล้วส่งข้อมูลที่ populate แล้วให้ผู้เรียกและหน้าแอดมิน
    const userId = req.user.id;
    if (!project_name || !purpose || !due_date || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'กรุณาระบุโครงการ วัตถุประสงค์ วันคืน และรายการอุปกรณ์' });
    }

    const newRequest = await BorrowRequest.create({
      user: userId,
      group_name,
      project_name,
      purpose,
      borrow_date: borrow_date || new Date(),
      due_date,
      items
    });

    const populatedRequest = await BorrowRequest.findById(newRequest._id)
      .populate('user', 'identifier_code full_name department')
      .populate('items.item', 'name item_code category available_qty');

    // ส่งสัญญาณ Real-time ไปแจ้งเตือนหน้าจอ Admin ทันที
    try {
      socket.getIO().emit('new_borrow_request', populatedRequest);
    } catch (sErr) {
      console.warn('Socket emit warning:', sErr.message);
    }

    res.status(201).json({ 
      message: 'ส่งคำขอยืมสำเร็จเรียบร้อย', 
      data: populatedRequest 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateRequest = async (req, res) => {
  try {
    const request = await BorrowRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'ไม่พบคำขอยืม' });
    if (!['pending', 'approved'].includes(request.status)) {
      return res.status(400).json({ message: 'แก้ไขได้เฉพาะคำขอที่ยังรอดำเนินการหรือกำลังยืม' });
    }

    const { group_name, project_name, purpose, due_date } = req.body;
    if (group_name !== undefined) request.group_name = group_name;
    if (project_name !== undefined) request.project_name = project_name;
    if (purpose !== undefined) request.purpose = purpose;
    if (due_date !== undefined) request.due_date = due_date;

    await request.save();
    res.json({ message: 'บันทึกการแก้ไขคำขอเรียบร้อยแล้ว', data: request });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// 3. Admin อนุมัติการยืม (ตัดสต็อกอุปกรณ์ด้วย Transaction)
exports.approveRequest = async (req, res) => {
  // ใช้ transaction เพื่อให้การเปลี่ยนสต็อกและสถานะสำเร็จหรือย้อนกลับพร้อมกัน
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const adminId = req.user?.id || req.body.admin_id;

    const request = await BorrowRequest.findById(id).session(session);
    if (!request || request.status !== 'pending') {
      throw new Error('ไม่พบคำขอยืม หรือคำขอนี้ถูกประมวลผลไปแล้ว');
    }

    const updatedItems = [];

    for (const lineItem of request.items) {
      const item = await Item.findById(lineItem.item).session(session);
      if (!item || item.available_qty < lineItem.requested_qty) {
        throw new Error(`อุปกรณ์ ${item ? item.name : lineItem.item} มีจำนวนคงเหลือไม่เพียงพอ`);
      }

      // ตัดจำนวนที่สามารถยืมได้
      item.available_qty -= lineItem.requested_qty;
      if (item.category === 'durable') {
        item.borrowed_qty += lineItem.requested_qty;
      }
      await item.save({ session });
      updatedItems.push(item);
    }

    request.status = 'approved';
    if (adminId) request.approved_by = adminId;
    await request.save({ session });

    await session.commitTransaction();

    // ส่งสัญญาณอัปเดตสต็อกและสถานะคำขอไปยัง Client ทุกคนแบบ Real-time
    try {
      socket.getIO().emit('stock_updated', updatedItems);
      socket.getIO().emit('request_status_changed', {
        requestId: request._id,
        status: 'approved'
      });
    } catch (sErr) {
      console.warn('Socket emit warning:', sErr.message);
    }

    res.json({ message: 'อนุมัติคำขอยืมและตัดสต็อกเรียบร้อยแล้ว', request });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ error: error.message });
  } finally {
    session.endSession();
  }
};

// 4. บันทึกการคืนอุปกรณ์ (เพิ่มสต็อกกลับเข้าคลัง)
exports.returnItems = async (req, res) => {
  // ครอบการปรับยอดคืนและสถานะคำขอไว้ใน transaction เดียว
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { return_records } = req.body;
    
    const request = await BorrowRequest.findById(id).session(session);
    if (!request || request.status !== 'approved') {
      throw new Error('คำขอนี้ไม่อยู่ในสถานะที่สามารถบันทึกการคืนได้');
    }
    if (!Array.isArray(return_records) || return_records.length === 0) {
      throw new Error('กรุณาระบุจำนวนอุปกรณ์ที่รับคืน');
    }

    const updatedStockList = [];
    const seenItems = new Set();
    const itemIds = request.items.map(lineItem => lineItem.item);
    const stockItems = await Item.find({ _id: { $in: itemIds } }).session(session);
    const stockById = new Map(stockItems.map(item => [String(item._id), item]));

    for (const record of return_records) {
      const itemId = String(record.item_id);
      const lineItem = request.items.find(entry => String(entry.item) === itemId);
      const item = stockById.get(itemId);
      if (!lineItem || !item || seenItems.has(itemId)) {
        throw new Error('พบรายการอุปกรณ์ที่ไม่ถูกต้องหรือซ้ำกัน');
      }
      seenItems.add(itemId);

      const returned = Number(record.returned_qty || 0);
      const damaged = Number(record.damaged_qty || 0);
      const lost = Number(record.lost_qty || 0);
      const quantities = [returned, damaged, lost];
      if (quantities.some(quantity => !Number.isInteger(quantity) || quantity < 0)) {
        throw new Error('จำนวนคืน ชำรุด และสูญหายต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป');
      }
      if (returned + damaged + lost === 0) continue;
      if (item.category !== 'durable') {
        throw new Error(`วัสดุสิ้นเปลือง ${item.name} ไม่ต้องบันทึกรับคืน`);
      }
      if (lineItem.returned_qty + lineItem.damaged_qty + lineItem.lost_qty + returned + damaged + lost > lineItem.requested_qty) {
        throw new Error(`จำนวนที่บันทึกเกินยอดยืมของ ${item.name}`);
      }

      lineItem.returned_qty += returned;
      lineItem.damaged_qty += damaged;
      lineItem.lost_qty += lost;
      item.borrowed_qty -= returned + damaged + lost;
      item.available_qty += returned;
      item.damaged_qty += damaged;
      item.lost_qty += lost;
      await item.save({ session });
      updatedStockList.push(item);
    }

    const fullyAccounted = request.items.every(lineItem => {
      const item = stockById.get(String(lineItem.item));
      return item?.category !== 'durable' ||
        lineItem.returned_qty + lineItem.damaged_qty + lineItem.lost_qty >= lineItem.requested_qty;
    });
    if (fullyAccounted) {
      request.status = 'returned';
      request.return_date = new Date();
    }
    await request.save({ session });

    await session.commitTransaction();

    // แจ้งเตือน Real-time ว่าสต็อกกลับเข้าสู่ระบบแล้ว
    try {
      socket.getIO().emit('stock_updated', updatedStockList);
      socket.getIO().emit('request_status_changed', { 
        requestId: request._id, 
        status: request.status
      });
    } catch (sErr) {
      console.warn('Socket emit warning:', sErr.message);
    }

    res.json({ message: 'บันทึกการคืนอุปกรณ์และคืนสต็อกสำเร็จ' });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ error: error.message });
  } finally {
    session.endSession();
  }
};