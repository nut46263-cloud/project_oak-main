require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// โหลด Models
const User = require('./src/models/User');
const Item = require('./src/models/Item');
const BorrowRequest = require('./src/models/BorrowRequest');

const seedData = async () => {
  try {
    if (!process.env.SEED_PASSWORD) {
      throw new Error('กรุณากำหนด SEED_PASSWORD ในไฟล์ .env ก่อนสร้างข้อมูลตัวอย่าง');
    }

    console.log('⏳ กำลังเชื่อมต่อไปยัง MongoDB Atlas...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ เชื่อมต่อ MongoDB Atlas สำเร็จ!');

    const resetDatabase = process.argv.includes('--reset');
    const hasExistingData = await Promise.all([
      User.exists({}),
      Item.exists({}),
      BorrowRequest.exists({})
    ]).then(results => results.some(Boolean));
    if (hasExistingData && !resetDatabase) {
      throw new Error('ฐานข้อมูลมีข้อมูลอยู่แล้ว หากต้องการล้างและสร้างใหม่ให้ใช้ npm run seed:reset');
    }
    if (resetDatabase) {
      await User.deleteMany({});
      await Item.deleteMany({});
      await BorrowRequest.deleteMany({});
      console.log('🧹 เคลียร์ข้อมูลเดิมตามคำสั่ง --reset เรียบร้อย');
    }

    // 2. เข้ารหัสผ่านตั้งต้น
    const salt = await bcrypt.genSalt(10);
    const defaultPasswordHash = await bcrypt.hash(process.env.SEED_PASSWORD, salt);

    // 3. สร้างข้อมูลผู้ใช้งานตั้งต้น (ครบทั้ง Admin, อาจารย์, นักศึกษา)
    const users = await User.insertMany([
      {
        identifier_code: 'ADMIN001',
        full_name: 'ผู้ดูแลระบบ พัสดุและคลังกลาง',
        department: 'งานพัสดุและเทคโนโลยีสารสนเทศ',
        phone: '0891112222',
        email: 'admin@inventory.local',
        password_hash: defaultPasswordHash,
        role: 'admin'
      },
      {
        identifier_code: 'TCH001',
        full_name: 'ดร.สมปอง อาจหาญ',
        department: 'เทคโนโลยีสารสนเทศ (DIT)',
        phone: '0812345678',
        email: 'sompong@university.ac.th',
        password_hash: defaultPasswordHash,
        role: 'teacher'
      },
      {
        identifier_code: '6840063534',
        full_name: 'นักศึกษา สมชาย สดใส',
        department: 'เทคโนโลยีสารสนเทศ (DIT)',
        phone: '0987654321',
        email: 'student@stu.university.ac.th',
        password_hash: defaultPasswordHash,
        role: 'student'
      },
      {
        identifier_code: 'PHONE-0991234567',
        full_name: 'ผู้ใช้ทดสอบ ระบบยืมอุปกรณ์',
        phone: '0991234567',
        password_hash: defaultPasswordHash,
        role: 'user'
      }
    ]);
    console.log(`👤 สร้างผู้ใช้งานเริ่มต้นสำเร็จ ${users.length} คน (ใช้รหัสผ่านจาก SEED_PASSWORD)`);
    console.log('🔐 บัญชีทดสอบ: Admin ADMIN001 และผู้ใช้ทั่วไป 0991234567 (ใช้รหัสผ่านจาก SEED_PASSWORD)');

    const adminUser = users[0];
    const studentUser = users[2];

    // 4. สร้างข้อมูลอุปกรณ์และพัสดุ (ครุภัณฑ์ และ วัสดุสิ้นเปลือง)
    const items = await Item.insertMany([
      // ครุภัณฑ์ (Durable Items)
      {
        item_code: 'EQ-001',
        name: 'Arduino Uno R3 Board',
        category: 'durable',
        total_qty: 20,
        available_qty: 18,
        borrowed_qty: 2,
        damaged_qty: 0,
        lost_qty: 0,
        image_url: 'https://placehold.co/400x300?text=Arduino+Uno',
        description: 'บอร์ดไมโครคอนโทรลเลอร์สำหรับโปรเจกต์ IoT และหุ่นยนต์'
      },
      {
        item_code: 'EQ-002',
        name: 'Digital Multimeter UNI-T UT33D+',
        category: 'durable',
        total_qty: 10,
        available_qty: 8,
        borrowed_qty: 1,
        damaged_qty: 1,
        lost_qty: 0,
        image_url: 'https://placehold.co/400x300?text=Multimeter',
        description: 'เครื่องวัดค่าแรงดันและกระแสไฟฟ้าแบบดิจิทัล'
      },
      {
        item_code: 'EQ-003',
        name: 'Raspberry Pi 4 Model B (4GB)',
        category: 'durable',
        total_qty: 15,
        available_qty: 15,
        borrowed_qty: 0,
        damaged_qty: 0,
        lost_qty: 0,
        image_url: 'https://placehold.co/400x300?text=Raspberry+Pi+4',
        description: 'มินิคอมพิวเตอร์สำหรับการประมวลผล Image Processing และ Server'
      },
      {
        item_code: 'EQ-004',
        name: 'ชุดเซนเซอร์ตรวจวัดสภาพแวดล้อม',
        category: 'durable',
        total_qty: 12,
        available_qty: 12,
        borrowed_qty: 0,
        damaged_qty: 0,
        lost_qty: 0,
        image_url: 'https://placehold.co/400x300?text=Sensor+Kit',
        description: 'ชุดเซนเซอร์สำหรับทดลองระบบ IoT และระบบอัตโนมัติ'
      },
      {
        item_code: 'EQ-005',
        name: 'ชุดไขควงซ่อมอุปกรณ์อิเล็กทรอนิกส์',
        category: 'durable',
        total_qty: 8,
        available_qty: 8,
        borrowed_qty: 0,
        damaged_qty: 0,
        lost_qty: 0,
        image_url: 'https://placehold.co/400x300?text=Repair+Kit',
        description: 'ชุดเครื่องมือสำหรับประกอบและซ่อมอุปกรณ์อิเล็กทรอนิกส์'
      },
      // วัสดุสิ้นเปลือง (Consumable Items)
      {
        item_code: 'CS-001',
        name: 'สายไฟ Jumper Wire (ผู้-เมีย 40 เส้น)',
        category: 'consumable',
        total_qty: 100,
        available_qty: 90,
        borrowed_qty: 0,
        damaged_qty: 0,
        lost_qty: 0,
        image_url: 'https://placehold.co/400x300?text=Jumper+Wires',
        description: 'สายจัมเปอร์สำหรับต่อบอร์ดทดลองขนาด 20cm'
      },
      {
        item_code: 'CS-002',
        name: 'ตะกั่วบัดกรี Ultracore 60/40 (0.5 ปอนด์)',
        category: 'consumable',
        total_qty: 30,
        available_qty: 25,
        borrowed_qty: 0,
        damaged_qty: 0,
        lost_qty: 0,
        image_url: 'https://placehold.co/400x300?text=Solder+Wire',
        description: 'ตะกั่วบัดกรีผสมฟลักซ์สำหรับงานวงจรอิเล็กทรอนิกส์'
      },
      {
        item_code: 'CS-003',
        name: 'ถ่านอัลคาไลน์ AA (แพ็ก 4 ก้อน)',
        category: 'consumable',
        total_qty: 40,
        available_qty: 40,
        borrowed_qty: 0,
        damaged_qty: 0,
        lost_qty: 0,
        image_url: 'https://placehold.co/400x300?text=AA+Batteries',
        description: 'วัสดุสิ้นเปลืองสำหรับชุดทดลองและอุปกรณ์พกพา'
      }
    ]);
    console.log(`📦 สร้างรายการอุปกรณ์เริ่มต้นสำเร็จ ${items.length} รายการ`);

    // 5. สร้างตัวอย่างประวัติ/คำขอยืม-คืน (Pending & Approved)
    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);

    await BorrowRequest.insertMany([
      {
        user: studentUser._id,
        group_name: 'Group 4 - Smart Farm',
        project_name: 'DIT204 IoT Architecture Project',
        purpose: 'ยืมเพื่อประกอบโครงงานระบบรดน้ำต้นไม้อัตโนมัติและตรวจวัดความชื้น',
        borrow_date: today,
        due_date: nextWeek,
        status: 'approved',
        approved_by: adminUser._id,
        items: [
          {
            item: items[0]._id, // Arduino
            requested_qty: 2,
            returned_qty: 0,
            damaged_qty: 0,
            lost_qty: 0
          },
          {
            item: items[1]._id, // Multimeter
            requested_qty: 1,
            returned_qty: 0,
            damaged_qty: 0,
            lost_qty: 0
          }
        ]
      },
      {
        user: studentUser._id,
        group_name: 'Group 4 - Smart Farm',
        project_name: 'DIT204 IoT Architecture Project',
        purpose: 'ขอเบิกอุปกรณ์เพิ่มเติมสำหรับทำเซนเซอร์อุณหภูมิ',
        borrow_date: today,
        due_date: nextWeek,
        status: 'pending',
        items: [
          {
            item: items[2]._id, // Raspberry Pi
            requested_qty: 1,
            returned_qty: 0,
            damaged_qty: 0,
            lost_qty: 0
          }
        ]
      }
    ]);
    console.log('📋 สร้างคำขอยืมตั้งต้นสำเร็จ 2 รายการ (Approved และ Pending)');

    console.log('\n🎉 สร้างฐานข้อมูลตั้งต้นบน MongoDB Atlas เรียบร้อยสมบูรณ์พร้อมใช้งาน!');
    process.exit(0);
  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาดในการ Seed Data:', error.message);
    process.exit(1);
  }
};

seedData();