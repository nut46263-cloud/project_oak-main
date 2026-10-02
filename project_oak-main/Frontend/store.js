const localPreview = window.location.protocol === 'file:' || window.location.port === '5501';
const SERVER_URL = window.APP_CONFIG?.serverUrl || (localPreview ? 'http://localhost:3000' : window.location.origin);
const API_BASE_URL = window.APP_CONFIG?.apiBaseUrl || `${SERVER_URL}/api`;
const state = { items: [], cart: [], user: null };
let pendingGoogleCredential = '';

const elements = {
  grid: document.getElementById('equipment-grid'),
  count: document.getElementById('items-count-label'),
  search: document.getElementById('search-input'),
  category: document.getElementById('category-filter'),
  status: document.getElementById('status-filter'),
  cart: document.getElementById('cart-sidebar'),
  overlay: document.getElementById('cart-overlay'),
  cartItems: document.getElementById('cart-items-container'),
  cartBadge: document.getElementById('cart-badge'),
  submit: document.getElementById('submit-request-btn'),
  authModal: document.getElementById('auth-modal'),
  profile: document.getElementById('user-profile-badge'),
  loginButton: document.getElementById('open-auth-btn'),
  myRequests: document.getElementById('my-requests-view'),
  myRequestsList: document.getElementById('my-requests-list'),
  catalog: document.querySelector('.items-section')
};

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

const authHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

function showToast(message, icon = 'success') {
  if (window.Swal) {
    Swal.fire({ toast: true, position: 'top-end', icon, title: message, showConfirmButton: false, timer: 2200 });
  }
}

async function fetchItems() {
  try {
    const response = await fetch(`${API_BASE_URL}/items`);
    if (!response.ok) throw new Error('ไม่สามารถโหลดรายการอุปกรณ์ได้');
    state.items = await response.json();
    renderEquipment();
  } catch (error) {
    elements.count.textContent = 'เชื่อมต่อคลังอุปกรณ์ไม่ได้';
    elements.grid.innerHTML = `<div class="empty-state"><div><i class="fa-solid fa-plug-circle-xmark"></i><p>${escapeHtml(error.message)}</p><small>ตรวจสอบว่า Backend เปิดอยู่ที่พอร์ต 3000</small></div></div>`;
  }
}

function renderEquipment() {
  const search = elements.search.value.trim().toLowerCase();
  const category = elements.category.value;
  const status = elements.status.value;
  const filtered = state.items.filter(item => {
    const available = Number(item.available_qty) > 0;
    const matchesText = `${item.name} ${item.item_code} ${item.description || ''}`.toLowerCase().includes(search);
    return matchesText && (category === 'all' || item.category === category) &&
      (status === 'all' || (status === 'available' ? available : !available));
  });

  elements.count.textContent = `แสดง ${filtered.length} จาก ${state.items.length} รายการ`;
  if (!filtered.length) {
    elements.grid.innerHTML = '<div class="empty-state"><div><i class="fa-solid fa-box-open"></i><p>ไม่พบอุปกรณ์ที่ตรงกับการค้นหา</p></div></div>';
    return;
  }

  elements.grid.innerHTML = filtered.map(item => {
    const available = Number(item.available_qty) > 0;
    const image = item.image_url || 'https://placehold.co/640x420/f3e9e9/8b2637?text=Equipment';
    return `<article class="card">
      <div class="card-img-wrapper">
        <img src="${escapeHtml(image)}" alt="${escapeHtml(item.name)}" loading="lazy" onerror="this.src='https://placehold.co/640x420/f3e9e9/8b2637?text=Equipment'">
        <span class="status-badge ${available ? 'available' : 'unavailable'}"><i class="fa-solid ${available ? 'fa-circle-check' : 'fa-circle-xmark'}"></i>${available ? 'พร้อมยืม' : 'สินค้าหมด'}</span>
      </div>
      <div class="card-body">
        <span class="card-category">${item.category === 'durable' ? 'ครุภัณฑ์' : 'วัสดุสิ้นเปลือง'} · ${escapeHtml(item.item_code)}</span>
        <h3 class="card-title">${escapeHtml(item.name)}</h3>
        <p class="card-desc">${escapeHtml(item.description || 'ไม่มีรายละเอียดสินค้า')}</p>
        <div class="card-footer"><span class="stock-info">คงเหลือ <b>${Number(item.available_qty) || 0}</b> ชิ้น</span>
          <button class="add-to-cart-btn" data-add-item="${escapeHtml(item._id)}" ${available ? '' : 'disabled'} aria-label="เพิ่ม ${escapeHtml(item.name)} ลงตะกร้า"><i class="fa-solid fa-plus"></i></button>
        </div>
      </div>
    </article>`;
  }).join('');
}

function renderCart() {
  const count = state.cart.reduce((sum, entry) => sum + entry.quantity, 0);
  elements.cartBadge.textContent = count;
  elements.submit.disabled = !state.cart.length;
  if (!state.cart.length) {
    elements.cartItems.innerHTML = '<div class="cart-empty"><i class="fa-solid fa-basket-shopping"></i><span>ยังไม่มีอุปกรณ์ในตะกร้า</span></div>';
    return;
  }

  elements.cartItems.innerHTML = state.cart.map(entry => `<div class="cart-item">
    <img class="cart-item-img" src="${escapeHtml(entry.image_url || 'https://placehold.co/100x100/f3e9e9/8b2637?text=Item')}" alt="">
    <div class="cart-item-details"><div class="cart-item-title">${escapeHtml(entry.name)}</div>
      <div class="cart-item-controls"><button class="qty-btn" data-quantity="-1" data-id="${escapeHtml(entry._id)}" aria-label="ลดจำนวน">−</button><b>${entry.quantity}</b><button class="qty-btn" data-quantity="1" data-id="${escapeHtml(entry._id)}" aria-label="เพิ่มจำนวน">+</button></div>
    </div>
    <button class="remove-item-btn" data-remove-item="${escapeHtml(entry._id)}" aria-label="นำออกจากตะกร้า"><i class="fa-regular fa-trash-can"></i></button>
  </div>`).join('');
}

function addToCart(itemId) {
  const item = state.items.find(entry => entry._id === itemId);
  if (!item) return;
  const existing = state.cart.find(entry => entry._id === itemId);
  if (existing) {
    if (existing.quantity >= item.available_qty) return showToast('จำนวนในตะกร้าเกินสต็อกคงเหลือ', 'warning');
    existing.quantity += 1;
  } else {
    state.cart.push({ ...item, quantity: 1 });
  }
  renderCart();
  showToast(`เพิ่ม ${item.name} ลงตะกร้าแล้ว`);
}

function changeQuantity(itemId, delta) {
  const entry = state.cart.find(item => item._id === itemId);
  const stockItem = state.items.find(item => item._id === itemId);
  if (!entry || !stockItem) return;
  const next = entry.quantity + delta;
  if (next > stockItem.available_qty) return showToast('จำนวนเกินสต็อกคงเหลือ', 'warning');
  if (next < 1) state.cart = state.cart.filter(item => item._id !== itemId);
  else entry.quantity = next;
  renderCart();
}

function setCartOpen(open) {
  elements.cart.classList.toggle('active', open);
  elements.overlay.classList.toggle('active', open);
}

async function submitBorrow(event) {
  event.preventDefault();
  if (!state.cart.length) return;
  if (!state.user || !localStorage.getItem('token')) {
    elements.authModal.classList.add('active');
    return showToast('เข้าสู่ระบบก่อนส่งคำขอยืม', 'info');
  }

  const payload = {
    project_name: document.getElementById('project-name').value.trim(),
    group_name: document.getElementById('group-name')?.value.trim() || 'ไม่ระบุกลุ่ม',
    purpose: document.getElementById('borrow-purpose').value.trim(),
    borrow_date: document.getElementById('borrow-date').value,
    due_date: document.getElementById('return-date').value,
    items: state.cart.map(item => ({ item: item._id, requested_qty: item.quantity }))
  };

  try {
    const response = await fetch(`${API_BASE_URL}/borrows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || result.error || 'ส่งคำขอไม่สำเร็จ');
    document.getElementById('modal-req-id').textContent = result.data?._id || '-';
    document.getElementById('modal-req-count').textContent = payload.items.reduce((sum, item) => sum + item.requested_qty, 0);
    state.cart = [];
    renderCart();
    setCartOpen(false);
    document.getElementById('borrow-form').reset();
    document.getElementById('success-modal').classList.add('active');
    setDefaultDates();
    fetchItems();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function setDefaultDates() {
  const dateValue = date => {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  };
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  document.getElementById('borrow-date').value = dateValue(today);
  document.getElementById('return-date').value = dateValue(tomorrow);
}

function updateProfile(user) {
  state.user = user;
  elements.loginButton.classList.toggle('is-hidden', Boolean(user));
  elements.profile.classList.toggle('is-hidden', !user);
  document.getElementById('user-name-display').textContent = user?.full_name || '';
}

function openCatalog() {
  elements.catalog.classList.remove('is-hidden');
  elements.myRequests.classList.add('is-hidden');
  document.getElementById('catalog-nav-btn').classList.add('active');
  document.getElementById('my-requests-btn').classList.remove('active');
}

async function openMyRequests() {
  if (!state.user || !localStorage.getItem('token')) {
    elements.authModal.classList.add('active');
    return showToast('เข้าสู่ระบบเพื่อดูคำขอยืมของคุณ', 'info');
  }
  elements.catalog.classList.add('is-hidden');
  elements.myRequests.classList.remove('is-hidden');
  document.getElementById('catalog-nav-btn').classList.remove('active');
  document.getElementById('my-requests-btn').classList.add('active');
  elements.myRequestsList.innerHTML = '<div class="empty-state"><p>กำลังโหลดคำขอ...</p></div>';

  try {
    const response = await fetch(`${API_BASE_URL}/borrows/mine`, { headers: authHeaders() });
    const requests = await response.json();
    if (!response.ok) throw new Error(requests.message || 'โหลดคำขอไม่สำเร็จ');
    if (!requests.length) {
      elements.myRequestsList.innerHTML = '<div class="empty-state"><div><i class="fa-regular fa-clipboard"></i><p>ยังไม่มีประวัติการยืม</p></div></div>';
      return;
    }
    const labels = { pending: 'รออนุมัติ', approved: 'กำลังยืม', returned: 'คืนครบแล้ว', rejected: 'ไม่อนุมัติ', overdue: 'เกินกำหนด' };
    elements.myRequestsList.innerHTML = requests.map(request => `<article class="request-card">
      <div class="request-card-head"><div><h3>${escapeHtml(request.project_name)}</h3><p>กำหนดคืน ${request.due_date ? new Date(request.due_date).toLocaleDateString('th-TH') : '-'}</p></div>
      <span class="request-status ${escapeHtml(request.status)}">${labels[request.status] || escapeHtml(request.status)}</span></div>
      <p>${escapeHtml(request.purpose)}</p><div class="request-items">${(request.items || []).map(line => `<span class="request-item-chip">${escapeHtml(line.item?.name || 'อุปกรณ์')} × ${line.requested_qty} · คืนแล้ว ${line.returned_qty || 0}</span>`).join('')}</div>
    </article>`).join('');
  } catch (error) {
    elements.myRequestsList.innerHTML = `<div class="empty-state"><p>${escapeHtml(error.message)}</p></div>`;
  }
}

async function submitAuth(form, endpoint) {
  const isLogin = endpoint === 'login';
  const phone = isLogin
    ? document.getElementById('login-phone').value.trim()
    : document.getElementById('reg-phone').value.trim();
  const values = isLogin ? {
    phone,
    identifier_code: phone,
    identifier_code_or_email: phone,
    password: document.getElementById('login-password').value
  } : {
    phone,
    full_name: document.getElementById('reg-fullname').value.trim(),
    password: document.getElementById('reg-password').value
  };

  if (!isLogin && values.password !== document.getElementById('reg-confirm-password').value) {
    return showToast('รหัสผ่านยืนยันไม่ตรงกัน', 'warning');
  }
  try {
    const response = await fetch(`${API_BASE_URL}/auth/${endpoint}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'ทำรายการไม่สำเร็จ');
    if (!isLogin) {
      localStorage.setItem('token', result.token);
      localStorage.setItem('currentUser', JSON.stringify(result.user));
      updateProfile(result.user);
      elements.authModal.classList.remove('active');
      form.reset();
      return showToast('สร้างบัญชีและเข้าสู่ระบบสำเร็จ');
    }
    localStorage.setItem('token', result.token);
    localStorage.setItem('currentUser', JSON.stringify(result.user));
    updateProfile(result.user);
    elements.authModal.classList.remove('active');
    form.reset();
    showToast(`ยินดีต้อนรับ ${result.user.full_name}`);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function restoreAuthMethods() {
  document.querySelector('.auth-tabs').classList.remove('is-hidden');
  document.querySelectorAll('.auth-form').forEach(form => form.classList.remove('is-hidden'));
  document.getElementById('google-signin-area').classList.remove('is-hidden');
  document.getElementById('google-profile-form').classList.remove('active');
  document.getElementById('login-form').classList.add('active');
  document.querySelector('[data-tab="login"]').classList.add('active');
  document.querySelector('[data-tab="register"]').classList.remove('active');
}

async function handleGoogleCredential(credential) {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'เข้าสู่ระบบด้วย Google ไม่สำเร็จ');

    if (result.requiresProfile) {
      pendingGoogleCredential = credential;
      document.querySelector('.auth-tabs').classList.add('is-hidden');
      document.querySelectorAll('.auth-form').forEach(form => form.classList.add('is-hidden'));
      document.getElementById('google-signin-area').classList.add('is-hidden');
      document.getElementById('google-profile-form').classList.remove('is-hidden');
      document.getElementById('google-profile-form').classList.add('active');
      document.getElementById('google-profile-email').value = result.email;
      document.getElementById('google-profile-name').value = '';
      document.getElementById('google-profile-id').value = '';
      return;
    }

    localStorage.setItem('token', result.token);
    localStorage.setItem('currentUser', JSON.stringify(result.user));
    updateProfile(result.user);
    document.getElementById('auth-modal').classList.remove('active');
    showToast(`ยินดีต้อนรับ ${result.user.full_name}`);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function completeGoogleProfile(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!pendingGoogleCredential) return showToast('กรุณาเข้าสู่ระบบ Google ใหม่', 'error');
  try {
    const response = await fetch(`${API_BASE_URL}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        credential: pendingGoogleCredential,
        full_name: document.getElementById('google-profile-name').value.trim(),
        identifier_code: document.getElementById('google-profile-id').value.trim()
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'บันทึกข้อมูลนักศึกษาไม่สำเร็จ');
    if (result.requiresProfile) throw new Error('กรุณากรอกชื่อและรหัสนักศึกษาให้ครบ');

    localStorage.setItem('token', result.token);
    localStorage.setItem('currentUser', JSON.stringify(result.user));
    pendingGoogleCredential = '';
    updateProfile(result.user);
    document.getElementById('auth-modal').classList.remove('active');
    form.reset();
    showToast('ยืนยันข้อมูลและเข้าสู่ระบบสำเร็จ');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function initializeGoogleSignIn() {
  const clientId = window.APP_CONFIG?.googleClientId;
  const button = document.getElementById('google-signin-button');
  const message = document.getElementById('google-config-message');
  if (!clientId) {
    button.innerHTML = '<button class="google-fallback-button" type="button" disabled><i class="fa-brands fa-google"></i>เข้าสู่ระบบด้วย Google</button>';
    message.textContent = 'ผู้ดูแลระบบต้องตั้งค่า GOOGLE_CLIENT_ID ก่อนเปิดใช้';
    return;
  }
  if (!window.google?.accounts?.id) {
    message.textContent = 'โหลด Google Sign-In ไม่สำเร็จ กรุณาลองใหม่';
    return;
  }
  google.accounts.id.initialize({ client_id: clientId, callback: response => handleGoogleCredential(response.credential) });
  google.accounts.id.renderButton(button, { type: 'standard', theme: 'outline', size: 'large', shape: 'rectangular', text: 'continue_with', width: 320, locale: 'th' });
}

// Events
 elements.grid.addEventListener('click', event => {
  const button = event.target.closest('[data-add-item]');
  if (button) addToCart(button.dataset.addItem);
});
elements.cartItems.addEventListener('click', event => {
  const quantityButton = event.target.closest('[data-quantity]');
  const removeButton = event.target.closest('[data-remove-item]');
  if (quantityButton) changeQuantity(quantityButton.dataset.id, Number(quantityButton.dataset.quantity));
  if (removeButton) {
    state.cart = state.cart.filter(item => item._id !== removeButton.dataset.removeItem);
    renderCart();
  }
});
[ elements.search, elements.category, elements.status ].forEach(element => {
  element.addEventListener(element === elements.search ? 'input' : 'change', renderEquipment);
});
document.getElementById('cart-btn').addEventListener('click', () => setCartOpen(true));
document.getElementById('close-cart-btn').addEventListener('click', () => setCartOpen(false));
elements.overlay.addEventListener('click', () => setCartOpen(false));
document.getElementById('borrow-form').addEventListener('submit', submitBorrow);
document.getElementById('close-modal-btn').addEventListener('click', () => document.getElementById('success-modal').classList.remove('active'));
document.getElementById('my-requests-btn').addEventListener('click', openMyRequests);
document.getElementById('catalog-nav-btn').addEventListener('click', openCatalog);
document.getElementById('back-to-catalog-btn').addEventListener('click', openCatalog);
document.getElementById('open-auth-btn').addEventListener('click', () => elements.authModal.classList.add('active'));
document.getElementById('close-auth-modal').addEventListener('click', () => elements.authModal.classList.remove('active'));
document.getElementById('logout-btn').addEventListener('click', () => {
  localStorage.removeItem('token');
  localStorage.removeItem('currentUser');
  updateProfile(null);
  showToast('ออกจากระบบแล้ว');
});
document.querySelectorAll('.auth-tab-btn').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.auth-tab-btn, .auth-form').forEach(element => element.classList.remove('active'));
  button.classList.add('active');
  document.getElementById(`${button.dataset.tab}-form`).classList.add('active');
}));
document.getElementById('login-form').addEventListener('submit', event => {
  event.preventDefault();
  submitAuth(event.currentTarget, 'login');
});
document.getElementById('register-form').addEventListener('submit', event => {
  event.preventDefault();
  submitAuth(event.currentTarget, 'register/phone');
});
document.getElementById('google-profile-form').addEventListener('submit', completeGoogleProfile);
document.getElementById('cancel-google-profile').addEventListener('click', () => {
  pendingGoogleCredential = '';
  document.getElementById('google-profile-form').reset();
  restoreAuthMethods();
});

try {
  const savedUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
  if (savedUser) updateProfile(savedUser);
} catch (error) {
  localStorage.removeItem('currentUser');
}
setDefaultDates();
renderCart();
fetchItems();
if (window.io) {
  const socket = io(SERVER_URL);
  socket.on('stock_updated', fetchItems);
}
const googleScript = document.createElement('script');
googleScript.src = 'https://accounts.google.com/gsi/client';
googleScript.async = true;
googleScript.onload = initializeGoogleSignIn;
googleScript.onerror = () => { document.getElementById('google-config-message').textContent = 'โหลด Google Sign-In ไม่สำเร็จ'; };
document.head.appendChild(googleScript);
