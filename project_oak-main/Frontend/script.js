// ==========================================
// 1. Global Configurations & States
// ==========================================
const API_BASE_URL = "http://localhost:3000/api";
let equipmentData = []; 
let cart = [];
let currentUser = null;

// เชื่อมต่อ Socket.io กับ Backend
const socket = io("http://localhost:3000");

// DOM Elements
const equipmentGrid = document.getElementById("equipment-grid");
const searchInput = document.getElementById("search-input");
const categoryFilter = document.getElementById("category-filter");
const statusFilter = document.getElementById("status-filter");
const cartBtn = document.getElementById("cart-btn");
const closeCartBtn = document.getElementById("close-cart-btn");
const cartSidebar = document.getElementById("cart-sidebar");
const cartOverlay = document.getElementById("cart-overlay");
const cartBadge = document.getElementById("cart-badge");
const cartItemsContainer = document.getElementById("cart-items-container");
const submitRequestBtn = document.getElementById("submit-request-btn");
const successModal = document.getElementById("success-modal");
const closeModalBtn = document.getElementById("close-modal-btn");
const itemsCountLabel = document.getElementById("items-count-label");

// Auth Elements
const openAuthBtn = document.getElementById("open-auth-btn");
const authModal = document.getElementById("auth-modal");
const closeAuthModalBtn = document.getElementById("close-auth-modal");
const authTabBtns = document.querySelectorAll(".auth-tab-btn");
const authForms = document.querySelectorAll(".auth-form");
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const userProfileBadge = document.getElementById("user-profile-badge");
const userNameDisplay = document.getElementById("user-name-display");
const logoutBtn = document.getElementById("logout-btn");

// ==========================================
// 2. Fetch Data from MongoDB Backend
// ==========================================
async function fetchEquipments() {
  try {
    const res = await fetch(`${API_BASE_URL}/items`);
    if (!res.ok) throw new Error("ไม่สามารถโหลดข้อมูลอุปกรณ์ได้");
    const data = await res.json();

    // แปลงฟิลด์จากฐานข้อมูลให้เป็นรูปแบบที่การ์ดและตัวกรองหน้าเว็บใช้
    equipmentData = data.map(item => ({
      id: item._id,
      name: item.name,
      category: item.category,
      categoryLabel: item.category === "durable" ? "ครุภัณฑ์" : "วัสดุสิ้นเปลือง",
      image: item.image_url || "https://placehold.co/400x300?text=No+Image",
      description: item.description,
      stock: item.available_qty,
      status: item.available_qty > 0 ? "available" : "unavailable"
    }));

    renderEquipment(equipmentData);
  } catch (error) {
    console.error("Error fetching data:", error);
    if (itemsCountLabel) itemsCountLabel.innerText = "ไม่สามารถเชื่อมต่อฐานข้อมูลได้";
  }
}

// ==========================================
// 3. Socket.io Real-time Listener
// ==========================================
socket.on("stock_updated", () => {
  // โหลดรายการใหม่เมื่อมีการเปลี่ยนสต็อกจากผู้ใช้อื่น
  fetchEquipments();
});

// ==========================================
// 4. Render Equipment Cards
// ==========================================
function renderEquipment(items) {
  if (!equipmentGrid) return;
  equipmentGrid.innerHTML = "";

  if (!items || items.length === 0) {
    equipmentGrid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: #888;">
        <i class="fa-solid fa-box-open" style="font-size: 3rem; margin-bottom: 1rem;"></i>
        <p>ไม่พบรายการอุปกรณ์ในระบบ</p>
      </div>
    `;
    if (itemsCountLabel) itemsCountLabel.innerText = "พบ 0 รายการ";
    return;
  }

  if (itemsCountLabel) itemsCountLabel.innerText = `กำลังแสดง ${items.length} รายการ`;

  items.forEach(item => {
    const isAvailable = item.status === "available" && item.stock > 0;

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="card-img-wrapper">
        <img src="${item.image}" alt="${item.name}">
        <span class="status-badge ${isAvailable ? "available" : "unavailable"}">
          ${isAvailable ? "พร้อมยืม" : "ถูกยืมหมด"}
        </span>
      </div>
      <div class="card-body">
        <span class="card-category">${item.categoryLabel}</span>
        <h3 class="card-title">${item.name}</h3>
        <p class="card-desc">${item.description}</p>
        <div class="card-footer">
          <div class="stock-info">คงเหลือ: <b>${item.stock}</b> ชิ้น</div>
          <button class="add-to-cart-btn" onclick="addToCart('${item.id}')" ${!isAvailable ? "disabled" : ""} title="เพิ่มลงตะกร้า">
            <i class="fa-solid fa-cart-plus"></i>
          </button>
        </div>
      </div>
    `;
    equipmentGrid.appendChild(card);
  });
}

// ==========================================
// 5. Filters & Search
// ==========================================
function filterEquipment() {
  const searchTerm = searchInput.value.toLowerCase();
  const selectedCategory = categoryFilter.value;
  const selectedStatus = statusFilter.value;

  const filtered = equipmentData.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm) ||
                          item.description.toLowerCase().includes(searchTerm);
    const matchesCategory = selectedCategory === "all" || item.category === selectedCategory;
    const matchesStatus = selectedStatus === "all" || item.status === selectedStatus;

    return matchesSearch && matchesCategory && matchesStatus;
  });

  renderEquipment(filtered);
}

// ==========================================
// 6. Cart Functions
// ==========================================
function addToCart(id) {
  const item = equipmentData.find(prod => prod.id === id);
  if (!item) return;

  const existingItem = cart.find(cartItem => cartItem.id === id);

  // จำกัดจำนวนในตะกร้าไม่ให้มากกว่ายอดพร้อมยืมที่โหลดไว้
  if (existingItem) {
    if (existingItem.qty < item.stock) {
      existingItem.qty += 1;
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: `เพิ่มจำนวน ${item.name} ในตะกร้าแล้ว`,
        showConfirmButton: false,
        timer: 1500
      });
    } else {
      Swal.fire({
        icon: 'warning',
        title: 'เกินจำนวนคงเหลือ',
        text: `ไม่สามารถเพิ่มได้เกินจำนวนสต็อกที่มีอยู่ (${item.stock} ชิ้น)`,
        confirmButtonColor: '#4a0e17'
      });
    }
  } else {
    cart.push({ ...item, qty: 1 });
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: `เพิ่ม ${item.name} ลงตะกร้าแล้ว`,
      showConfirmButton: false,
      timer: 1500
    });
  }

  updateCartUI();
}

function updateCartUI() {
  const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);
  if (cartBadge) cartBadge.innerText = totalItems;
  if (submitRequestBtn) submitRequestBtn.disabled = cart.length === 0;

  if (!cartItemsContainer) return;
  cartItemsContainer.innerHTML = "";

  if (cart.length === 0) {
    cartItemsContainer.innerHTML = `
      <div style="text-align: center; color: #888; padding: 3rem 1rem;">
        <i class="fa-solid fa-basket-shopping" style="font-size: 2.5rem; color: #ccc; margin-bottom: 0.5rem;"></i>
        <p>ยังไม่มีรายการอุปกรณ์ในตะกร้า</p>
      </div>
    `;
    return;
  }

  cart.forEach(item => {
    const cartItemEl = document.createElement("div");
    cartItemEl.className = "cart-item";
    cartItemEl.innerHTML = `
      <img src="${item.image}" alt="${item.name}" class="cart-item-img">
      <div class="cart-item-details">
        <div class="cart-item-title">${item.name}</div>
        <div class="cart-item-controls">
          <button class="qty-btn" onclick="changeQty('${item.id}', -1)">-</button>
          <span><b>${item.qty}</b></span>
          <button class="qty-btn" onclick="changeQty('${item.id}', 1)">+</button>
        </div>
      </div>
      <button class="remove-item-btn" onclick="removeFromCart('${item.id}')" title="ลบรายการ">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    `;
    cartItemsContainer.appendChild(cartItemEl);
  });
}

function changeQty(id, change) {
  const cartItem = cart.find(item => item.id === id);
  const stockItem = equipmentData.find(item => item.id === id);

  if (cartItem) {
    const newQty = cartItem.qty + change;
    if (newQty > 0 && newQty <= stockItem.stock) {
      cartItem.qty = newQty;
    } else if (newQty > stockItem.stock) {
      Swal.fire({
        icon: 'warning',
        title: 'เกินจำนวนสต็อก',
        text: `ยืมได้ไม่เกินจำนวนคงเหลือ (${stockItem.stock} ชิ้น)`,
        confirmButtonColor: '#4a0e17'
      });
    } else if (newQty <= 0) {
      removeFromCart(id);
      return;
    }
  }
  updateCartUI();
}

function removeFromCart(id) {
  cart = cart.filter(item => item.id !== id);
  updateCartUI();
}

function toggleCart() {
  if (cartSidebar) cartSidebar.classList.toggle("active");
  if (cartOverlay) cartOverlay.classList.toggle("active");
}

// ==========================================
// 7. Borrow Request Submission (แก้ไขจุดนี้)
// ==========================================
async function handleSubmitBorrow(e) {
  e.preventDefault();
  if (cart.length === 0) return;

  // ตรวจสอบข้อมูลผู้ใช้ทั้งจาก state และ localStorage
  const savedUser = JSON.parse(localStorage.getItem("currentUser") || "{}");
  const token = localStorage.getItem("token");
  const activeUser = currentUser || savedUser;
  const currentUserId = activeUser?.id || activeUser?._id;

  if (!currentUserId) {
    Swal.fire({
      icon: 'info',
      title: 'กรุณาเข้าสู่ระบบ',
      text: 'คุณต้องเข้าสู่ระบบก่อนทำการยื่นคำขอยืมอุปกรณ์',
      confirmButtonColor: '#4a0e17'
    });
    if (authModal) authModal.classList.add("active");
    return;
  }

  // รวมข้อมูลผู้ยืม รายละเอียดโครงการ และจำนวนอุปกรณ์เป็น payload ของ API
  const payload = {
    user_id: currentUserId,
    user: currentUserId,
    project_name: document.getElementById("project-name")?.value || "Project DIT",
    group_name: document.getElementById("group-name")?.value || "Group Default",
    purpose: document.getElementById("borrow-purpose")?.value || "การเรียนการสอน",
    borrow_date: document.getElementById("borrow-date")?.value || new Date(),
    due_date: document.getElementById("return-date")?.value,
    items: cart.map(item => ({
      item: item.id,
      requested_qty: item.qty
    }))
  };

  try {
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE_URL}/borrows`, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.message || result.error || "ส่งคำขอยืมไม่สำเร็จ");

    const totalCount = cart.reduce((sum, item) => sum + item.qty, 0);
    const modalReqId = document.getElementById("modal-req-id");
    const modalReqCount = document.getElementById("modal-req-count");

    if (modalReqId) modalReqId.innerText = result.data?._id || result.requestId || ("REQ-" + Math.floor(100000 + Math.random() * 900000));
    if (modalReqCount) modalReqCount.innerText = totalCount;

    cart = [];
    updateCartUI();
    toggleCart();

    const borrowFormEl = document.getElementById("borrow-form");
    if (borrowFormEl) borrowFormEl.reset();
    if (successModal) successModal.classList.add("active");

    fetchEquipments();
  } catch (err) {
    Swal.fire({
      icon: 'error',
      title: 'ไม่สามารถทำรายการได้',
      text: err.message === 'Failed to fetch' ? 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้' : err.message,
      confirmButtonColor: '#4a0e17'
    });
  }
}

// ==========================================
// 8. Authentication (Register & Login)
// ==========================================
authTabBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    const targetTab = btn.dataset.tab;
    authTabBtns.forEach(b => b.classList.remove("active"));
    authForms.forEach(f => f.classList.remove("active"));

    btn.classList.add("active");
    const targetForm = document.getElementById(`${targetTab}-form`);
    if (targetForm) targetForm.classList.add("active");
  });
});

if (openAuthBtn) openAuthBtn.addEventListener("click", () => authModal.classList.add("active"));
if (closeAuthModalBtn) closeAuthModalBtn.addEventListener("click", () => authModal.classList.remove("active"));

// สมัครสมาชิก (Register Form)
if (registerForm) {
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const identifierCode = document.getElementById("reg-identifier").value.trim();
    const fullName = document.getElementById("reg-fullname").value.trim();
    const email = document.getElementById("reg-email").value.trim();
    const password = document.getElementById("reg-password").value;
    const confirmPassword = document.getElementById("reg-confirm-password").value;

    if (password !== confirmPassword) {
      Swal.fire({
        icon: 'warning',
        title: 'รหัสผ่านไม่ตรงกัน',
        text: 'กรุณากรอกรหัสผ่านและยืนยันรหัสผ่านใหม่อีกครั้ง',
        confirmButtonColor: '#4a0e17'
      });
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier_code: identifierCode,
          full_name: fullName,
          email: email,
          password: password,
          role: "student"
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "สมัครสมาชิกไม่สำเร็จ");

      Swal.fire({
        icon: 'success',
        title: 'สมัครสมาชิกสำเร็จ!',
        text: 'คุณสามารถเข้าสู่ระบบด้วยรหัสนักศึกษาหรืออีเมลได้ทันที',
        confirmButtonColor: '#4a0e17'
      });

      const loginTabBtn = document.querySelector('[data-tab="login"]');
      if (loginTabBtn) loginTabBtn.click();
      registerForm.reset();
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'สมัครสมาชิกไม่สำเร็จ',
        text: err.message === 'Failed to fetch' 
          ? 'ไม่สามารถติดต่อเซิร์ฟเวอร์ได้ (กรุณาเปิด node server.js ใน Terminal ก่อน)' 
          : err.message,
        confirmButtonColor: '#4a0e17'
      });
    }
  });
}

// เข้าสู่ระบบ (Login Form)
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const credential = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;

    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier_code: credential,
          identifier_code_or_email: credential,
          password: password
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");

      localStorage.setItem("token", data.token);
      localStorage.setItem("currentUser", JSON.stringify(data.user));

      updateUserUI(data.user);
      if (authModal) authModal.classList.remove("active");
      loginForm.reset();

      Swal.fire({
        icon: 'success',
        title: 'เข้าสู่ระบบสำเร็จ!',
        text: `ยินดีต้อนรับคุณ ${data.user.full_name}`,
        timer: 1800,
        showConfirmButton: false
      });

    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'เข้าสู่ระบบไม่สำเร็จ',
        text: err.message === 'Failed to fetch' 
          ? 'ไม่สามารถติดต่อเซิร์ฟเวอร์ได้ (กรุณาเปิด node server.js ใน Terminal ก่อน)' 
          : err.message,
        confirmButtonColor: '#4a0e17'
      });
    }
  });
}

function updateUserUI(user) {
  currentUser = user;
  if (user) {
    if (userNameDisplay) userNameDisplay.innerText = user.full_name;
    if (openAuthBtn) openAuthBtn.style.display = "none";
    if (userProfileBadge) userProfileBadge.style.display = "flex";
  } else {
    if (userNameDisplay) userNameDisplay.innerText = "";
    if (openAuthBtn) openAuthBtn.style.display = "flex";
    if (userProfileBadge) userProfileBadge.style.display = "none";
  }
}

// ออกจากระบบ (Logout)
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("token");
    localStorage.removeItem("currentUser");
    updateUserUI(null);
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: 'ออกจากระบบเรียบร้อยแล้ว',
      showConfirmButton: false,
      timer: 1500
    });
  });
}

// ==========================================
// 9. Initializations
// ==========================================
if (searchInput) searchInput.addEventListener("input", filterEquipment);
if (categoryFilter) categoryFilter.addEventListener("change", filterEquipment);
if (statusFilter) statusFilter.addEventListener("change", filterEquipment);

if (cartBtn) cartBtn.addEventListener("click", toggleCart);
if (closeCartBtn) closeCartBtn.addEventListener("click", toggleCart);
if (cartOverlay) cartOverlay.addEventListener("click", toggleCart);

const borrowForm = document.getElementById("borrow-form");
if (borrowForm) borrowForm.addEventListener("submit", handleSubmitBorrow);
if (closeModalBtn) closeModalBtn.addEventListener("click", () => successModal.classList.remove("active"));

window.addEventListener("DOMContentLoaded", () => {
  const savedUser = localStorage.getItem("currentUser");
  if (savedUser) {
    try {
      updateUserUI(JSON.parse(savedUser));
    } catch (e) {
      console.error(e);
    }
  }

  fetchEquipments();

  const today = new Date().toISOString().split("T")[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
  const borrowDateInput = document.getElementById("borrow-date");
  const returnDateInput = document.getElementById("return-date");

  if (borrowDateInput) borrowDateInput.value = today;
  if (returnDateInput) returnDateInput.value = tomorrow;
});