const localPreview = window.location.protocol === 'file:' || window.location.port === '5501';
const SERVER_URL = window.APP_CONFIG?.serverUrl || (localPreview ? 'http://localhost:3000' : window.location.origin);
const API_BASE_URL = window.APP_CONFIG?.apiBaseUrl || `${SERVER_URL}/api`;
const state = { items: [], loans: [], user: null, token: null };
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

function toast(message, isError = false) {
  const element = document.createElement('div');
  element.className = `toast-message${isError ? ' error' : ''}`;
  element.innerHTML = `<i class="fa-solid ${isError ? 'fa-circle-exclamation' : 'fa-circle-check'}"></i><span>${escapeHtml(message)}</span>`;
  $('#toast-container').appendChild(element);
  window.setTimeout(() => element.remove(), 3600);
}

function showLogin() {
  state.user = null;
  state.token = null;
  $('#admin-app').classList.add('is-hidden');
  $('#admin-login').classList.remove('is-hidden');
}

async function api(path, options = {}) {
  const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}), ...options.headers };
  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  const result = await response.json().catch(() => ({}));
  if (response.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('currentUser');
    showLogin();
  }
  if (!response.ok) throw new Error(result.message || result.error || 'ไม่สามารถดำเนินการได้');
  return result;
}

function setAuthenticated(user, token) {
  state.user = user;
  state.token = token;
  localStorage.setItem('token', token);
  localStorage.setItem('currentUser', JSON.stringify(user));
  $('#admin-name').textContent = user.full_name || user.identifier_code;
  $('#admin-login').classList.add('is-hidden');
  $('#admin-app').classList.remove('is-hidden');
  loadData();
}

function formatDate(date) {
  if (!date) return '-';
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
}

function localDateValue(date) {
  if (!date) return '';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '';
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

const statusLabels = { pending: 'รออนุมัติ', approved: 'กำลังยืม', returned: 'คืนครบแล้ว', rejected: 'ไม่อนุมัติ', overdue: 'เกินกำหนด' };

async function loadData() {
  try {
    const [items, loans] = await Promise.all([api('/items'), api('/borrows')]);
    state.items = items;
    state.loans = loans;
    renderAll();
  } catch (error) {
    if (state.token) toast(error.message, true);
  }
}

function getOutstandingLines(loan) {
  return (loan.items || []).map(line => {
    const item = line.item || {};
    const accounted = Number(line.returned_qty || 0) + Number(line.damaged_qty || 0) + Number(line.lost_qty || 0);
    return { line, item, remaining: item.category === 'durable' ? Math.max(0, Number(line.requested_qty) - accounted) : 0 };
  }).filter(entry => entry.remaining > 0);
}

function renderAll() {
  renderSummary();
  renderInventory();
  renderLoans();
  renderOverviewLists();
}

function renderSummary() {
  $('#metric-products').textContent = state.items.length;
  $('#metric-available').textContent = state.items.reduce((sum, item) => sum + (Number(item.available_qty) || 0), 0);
  $('#metric-pending').textContent = state.loans.filter(loan => loan.status === 'pending').length;
  const outstanding = state.loans.filter(loan => loan.status === 'approved' && getOutstandingLines(loan).length);
  $('#metric-outstanding').textContent = outstanding.length;
  $('#nav-item-count').textContent = state.items.length;
  $('#nav-loan-count').textContent = outstanding.length;
}

function renderOverviewLists() {
  const lowStock = state.items.filter(item => Number(item.available_qty) <= 3).sort((a, b) => a.available_qty - b.available_qty).slice(0, 5);
  $('#low-stock-list').innerHTML = lowStock.length ? lowStock.map(item => `<div class="low-stock-row"><div><div class="low-stock-name">${escapeHtml(item.name)}</div><span class="low-stock-code">${escapeHtml(item.item_code)}</span></div><span class="low-stock-qty">เหลือ ${Number(item.available_qty) || 0}</span></div>`).join('') : '<div class="empty-row">ไม่มีสินค้าใกล้หมด</div>';
  const latest = [...state.loans].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 4);
  $('#recent-loans').innerHTML = latest.length ? latest.map(loan => `<div class="recent-row"><div><div class="recent-name">${escapeHtml(loan.user?.full_name || 'ไม่พบข้อมูลผู้ยืม')}</div><div class="recent-detail">${escapeHtml(loan.project_name || '-')} · ${formatDate(loan.createdAt)}</div></div><span class="status-pill ${escapeHtml(loan.status)}">${statusLabels[loan.status] || escapeHtml(loan.status)}</span></div>`).join('') : '<div class="empty-row">ยังไม่มีรายการยืม</div>';
}

function renderInventory() {
  const term = $('#inventory-search').value.trim().toLowerCase();
  const category = $('#inventory-category').value;
  const items = state.items.filter(item => `${item.name} ${item.item_code}`.toLowerCase().includes(term) && (category === 'all' || item.category === category));
  const tbody = $('#inventory-body');
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-row"><i class="fa-solid fa-box-open"></i>ไม่พบสินค้าในคลัง</td></tr>';
    return;
  }
  tbody.innerHTML = items.map(item => {
    const total = Number(item.total_qty) || 0;
    const available = Number(item.available_qty) || 0;
    const percent = total > 0 ? Math.min(100, Math.round(available / total * 100)) : 0;
    const image = item.image_url || 'https://placehold.co/100x100/f4e8ea/8b2637?text=Item';
    return `<tr>
      <td data-label="สินค้า"><div class="product-cell"><img class="product-thumb" src="${escapeHtml(image)}" alt="" onerror="this.src='https://placehold.co/100x100/f4e8ea/8b2637?text=Item'"><div><div class="product-title">${escapeHtml(item.name)}</div><div class="product-code">${escapeHtml(item.item_code)}</div></div></div></td>
      <td data-label="หมวดหมู่"><span class="category-tag">${item.category === 'durable' ? 'ครุภัณฑ์' : 'วัสดุสิ้นเปลือง'}</span></td>
      <td data-label="จำนวนรวม"><span class="stock-number">${total}</span><div class="cell-muted">ยืม ${Number(item.borrowed_qty) || 0} · ชำรุด ${Number(item.damaged_qty) || 0}</div></td>
      <td data-label="พร้อมยืม"><span class="stock-number ${available <= 3 ? 'low' : ''}">${available}</span><div class="stock-track"><span class="${available <= 3 ? 'low' : ''}" style="width:${percent}%"></span></div></td>
      <td data-label="สถานะคลัง"><span class="status-pill ${available > 0 ? 'approved' : 'overdue'}">${available > 0 ? 'พร้อมยืม' : 'หมดชั่วคราว'}</span></td>
      <td data-label="จัดการ"><button class="table-action" data-edit-item="${escapeHtml(item._id)}"><i class="fa-solid fa-pen"></i>แก้ไข</button></td>
    </tr>`;
  }).join('');
}

function renderLoans() {
  const term = $('#loan-search').value.trim().toLowerCase();
  const status = $('#loan-status').value;
  const role = $('#loan-role').value;
  const loans = state.loans.filter(loan => {
    const user = loan.user || {};
    const matchesTerm = `${user.full_name || ''} ${user.identifier_code || ''} ${loan.project_name || ''} ${loan.purpose || ''}`.toLowerCase().includes(term);
    return matchesTerm && (status === 'all' || loan.status === status) && (role === 'all' || user.role === role);
  });
  const tbody = $('#loans-body');
  if (!loans.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-row"><i class="fa-regular fa-clipboard"></i>ไม่มีรายการตามตัวกรอง</td></tr>';
    return;
  }
  tbody.innerHTML = loans.map(loan => {
    const user = loan.user || {};
    const roleLabel = user.role === 'teacher' ? 'อาจารย์' : user.role === 'user' ? 'ผู้ใช้ทั่วไป' : user.role === 'admin' ? 'ผู้ดูแล' : 'นักศึกษา';
    const overdue = loan.status === 'approved' && loan.due_date && new Date(loan.due_date) < new Date();
    const lines = (loan.items || []).map(entry => {
      const item = entry.item || {};
      const remaining = item.category === 'durable' ? Math.max(0, entry.requested_qty - (entry.returned_qty || 0) - (entry.damaged_qty || 0) - (entry.lost_qty || 0)) : 0;
      return `<div class="loan-item-line"><span class="loan-item-name">${escapeHtml(item.name || 'อุปกรณ์')}</span><span class="${remaining ? 'loan-item-remaining' : 'cell-muted'}">${remaining ? `ค้าง ${remaining} / ${entry.requested_qty}` : `${entry.requested_qty} ชิ้น`}</span></div>`;
    }).join('');
    const statusClass = overdue ? 'overdue' : loan.status;
    const statusLabel = overdue ? 'เกินกำหนด' : (statusLabels[loan.status] || loan.status);
    const action = loan.status === 'pending'
      ? `<button class="table-action primary-action" data-approve-loan="${escapeHtml(loan._id)}"><i class="fa-solid fa-check"></i>อนุมัติ</button>`
      : loan.status === 'approved'
        ? `<button class="table-action" data-edit-loan="${escapeHtml(loan._id)}"><i class="fa-solid fa-pen-to-square"></i>แก้ / รับคืน</button>`
        : '<span class="cell-muted">เสร็จสิ้น</span>';
    return `<tr>
      <td data-label="ผู้ยืม"><div class="product-title">${escapeHtml(user.full_name || 'ไม่พบข้อมูล')}</div><div class="product-code">${escapeHtml(user.role === 'user' ? user.phone : user.identifier_code || user.phone || '-')} · ${roleLabel}</div></td>
      <td data-label="โครงการ"><div class="product-title">${escapeHtml(loan.project_name || '-')}</div><div class="item-description">${escapeHtml(loan.purpose || '')}</div></td>
      <td data-label="อุปกรณ์"><div class="loan-items">${lines || '<span class="cell-muted">ไม่มีรายการ</span>'}</div></td>
      <td data-label="กำหนดคืน"><span class="due-date ${overdue ? 'overdue' : ''}">${formatDate(loan.due_date)}</span></td>
      <td data-label="สถานะ"><span class="status-pill ${statusClass}">${statusLabel}</span></td>
      <td data-label="จัดการ">${action}</td>
    </tr>`;
  }).join('');
}

function openItemDialog(item = null) {
  $('#item-form').reset();
  $('#item-id').value = item?._id || '';
  $('#item-dialog-title').textContent = item ? 'แก้ไขสินค้า' : 'เพิ่มสินค้า';
  $('#item-code').value = item?.item_code || '';
  $('#item-name').value = item?.name || '';
  $('#item-category').value = item?.category || 'durable';
  $('#item-quantity').value = item?.total_qty ?? 1;
  $('#item-image').value = item?.image_url || '';
  $('#item-description').value = item?.description || '';
  $('#item-category').disabled = Boolean(item && Number(item.borrowed_qty) > 0);
  $('#item-dialog').showModal();
}

function openLoanDialog(loan) {
  $('#loan-form').reset();
  $('#loan-id').value = loan._id;
  $('#loan-project').value = loan.project_name || '';
  $('#loan-group').value = loan.group_name || '';
  $('#loan-due-date').value = localDateValue(loan.due_date);
  $('#loan-purpose').value = loan.purpose || '';
  const editor = $('#return-editor');
  if (loan.status !== 'approved') {
    editor.innerHTML = '<p>คำขอนี้ยังไม่ผ่านการอนุมัติ จึงยังบันทึกการคืนไม่ได้</p>';
  } else {
    const durableItems = (loan.items || []).filter(entry => entry.item?.category === 'durable');
    editor.innerHTML = `<h3>บันทึกรับคืนรอบนี้</h3><p>กรอกเฉพาะจำนวนที่รับคืน ชำรุด หรือสูญหายในรอบนี้ ระบบจะเก็บยอดสะสมจนกว่าจะปิดรายการครบ</p>${(loan.items || []).map(entry => {
      const item = entry.item || {};
      const accounted = Number(entry.returned_qty || 0) + Number(entry.damaged_qty || 0) + Number(entry.lost_qty || 0);
      const remaining = Math.max(0, Number(entry.requested_qty) - accounted);
      if (item.category !== 'durable') return `<div class="return-line consumable"><div class="return-line-name">${escapeHtml(item.name || 'วัสดุสิ้นเปลือง')}<small>วัสดุสิ้นเปลือง · ไม่ต้องรับคืน</small></div></div>`;
      return `<div class="return-line" data-item="${escapeHtml(item._id || entry.item)}" data-remaining="${remaining}"><div class="return-line-name">${escapeHtml(item.name || 'อุปกรณ์')}<small>ยืม ${entry.requested_qty} · บันทึกแล้ว ${accounted} · ค้าง ${remaining}</small></div><label>คืนดี<input type="number" min="0" max="${remaining}" step="1" value="0" data-returned></label><label>ชำรุด<input type="number" min="0" max="${remaining}" step="1" value="0" data-damaged></label><label>สูญหาย<input type="number" min="0" max="${remaining}" step="1" value="0" data-lost></label></div>`;
    }).join('')}${durableItems.length ? '<div class="return-summary">จำนวนที่กรอกในแต่ละแถวรวมกันต้องไม่เกินยอดค้าง</div>' : '<p>รายการนี้มีแต่วัสดุสิ้นเปลือง ไม่มีอุปกรณ์ที่ต้องรับคืน</p>'}`;
  }
  $('#loan-dialog').showModal();
}

async function approveLoan(loanId) {
  if (!window.confirm('อนุมัติคำขอนี้และตัดจำนวนออกจากสต็อกหรือไม่?')) return;
  try {
    await api(`/borrows/${encodeURIComponent(loanId)}/approve`, { method: 'PUT', body: JSON.stringify({}) });
    toast('อนุมัติคำขอและปรับสต็อกแล้ว');
    await loadData();
  } catch (error) { toast(error.message, true); }
}

async function saveItem(event) {
  event.preventDefault();
  const id = $('#item-id').value;
  const payload = {
    item_code: $('#item-code').value.trim(),
    name: $('#item-name').value.trim(),
    category: $('#item-category').value,
    total_qty: Number($('#item-quantity').value),
    image_url: $('#item-image').value.trim(),
    description: $('#item-description').value.trim()
  };
  try {
    await api(id ? `/items/${encodeURIComponent(id)}` : '/items', { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
    $('#item-dialog').close();
    toast(id ? 'บันทึกข้อมูลสินค้าแล้ว' : 'เพิ่มสินค้าเข้าคลังแล้ว');
    await loadData();
  } catch (error) { toast(error.message, true); }
}

async function saveLoan(event) {
  event.preventDefault();
  const loanId = $('#loan-id').value;
  const loan = state.loans.find(entry => entry._id === loanId);
  if (!loan) return;
  const details = {
    project_name: $('#loan-project').value.trim(),
    group_name: $('#loan-group').value.trim(),
    due_date: $('#loan-due-date').value,
    purpose: $('#loan-purpose').value.trim()
  };
  try {
    await api(`/borrows/${encodeURIComponent(loanId)}`, { method: 'PUT', body: JSON.stringify(details) });
    if (loan.status === 'approved') {
      const return_records = $$('.return-line[data-item]').map(row => ({
        item_id: row.dataset.item,
        returned_qty: Number(row.querySelector('[data-returned]').value || 0),
        damaged_qty: Number(row.querySelector('[data-damaged]').value || 0),
        lost_qty: Number(row.querySelector('[data-lost]').value || 0)
      })).filter(record => record.returned_qty + record.damaged_qty + record.lost_qty > 0);
      if (return_records.length) {
        await api(`/borrows/${encodeURIComponent(loanId)}/return`, { method: 'PUT', body: JSON.stringify({ return_records }) });
      }
    }
    $('#loan-dialog').close();
    toast('บันทึกการแก้ไขรายการยืมแล้ว');
    await loadData();
  } catch (error) { toast(error.message, true); }
}

function setView(viewName) {
  $$('.admin-view').forEach(view => view.classList.toggle('active', view.id === `view-${viewName}`));
  $$('.side-link').forEach(link => link.classList.toggle('active', link.dataset.view === viewName));
}

$('#admin-login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier_code: $('#admin-identifier').value.trim(), password: $('#admin-password').value })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'เข้าสู่ระบบไม่สำเร็จ');
    if (result.user.role !== 'admin') throw new Error('บัญชีนี้ไม่มีสิทธิ์ผู้ดูแลระบบ');
    setAuthenticated(result.user, result.token);
    event.currentTarget.reset();
  } catch (error) { toast(error.message, true); }
  finally { button.disabled = false; }
});

$('#logout-admin').addEventListener('click', () => {
  localStorage.removeItem('token');
  localStorage.removeItem('currentUser');
  showLogin();
});
$('#item-form').addEventListener('submit', saveItem);
$('#loan-form').addEventListener('submit', saveLoan);
$('#add-item-button').addEventListener('click', () => openItemDialog());
$('#refresh-all').addEventListener('click', loadData);
$('#refresh-loans').addEventListener('click', loadData);
$('#inventory-search').addEventListener('input', renderInventory);
$('#inventory-category').addEventListener('change', renderInventory);
$('#loan-search').addEventListener('input', renderLoans);
$('#loan-status').addEventListener('change', renderLoans);
$('#loan-role').addEventListener('change', renderLoans);
$$('[data-close-dialog]').forEach(button => button.addEventListener('click', () => $(`#${button.dataset.closeDialog}`).close()));
$$('.side-link').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
$$('[data-go-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.goView)));
$('#inventory-body').addEventListener('click', event => {
  const button = event.target.closest('[data-edit-item]');
  if (button) openItemDialog(state.items.find(item => item._id === button.dataset.editItem));
});
$('#loans-body').addEventListener('click', event => {
  const approveButton = event.target.closest('[data-approve-loan]');
  const editButton = event.target.closest('[data-edit-loan]');
  if (approveButton) approveLoan(approveButton.dataset.approveLoan);
  if (editButton) openLoanDialog(state.loans.find(loan => loan._id === editButton.dataset.editLoan));
});

if (window.io) {
  const socket = io(SERVER_URL);
  const status = $('#socket-status');
  socket.on('connect', () => {
    status.classList.add('connected');
    status.classList.remove('disconnected');
    status.querySelector('span').textContent = 'ออนไลน์';
  });
  socket.on('disconnect', () => {
    status.classList.remove('connected');
    status.classList.add('disconnected');
    status.querySelector('span').textContent = 'ออฟไลน์';
  });
  ['new_borrow_request', 'request_status_changed', 'stock_updated'].forEach(eventName => socket.on(eventName, () => {
    if (state.token) loadData();
  }));
}

try {
  const savedUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
  const savedToken = localStorage.getItem('token');
  if (savedUser?.role === 'admin' && savedToken) setAuthenticated(savedUser, savedToken);
  else showLogin();
} catch (error) {
  localStorage.removeItem('currentUser');
  showLogin();
}
