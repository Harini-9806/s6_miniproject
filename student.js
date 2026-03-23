// ── STUDENT DASHBOARD LOGIC ─────────────────────────────────────────────────

const session = Auth.requireRole('student');
let cart = [];
let selectedSlot = null;
let selectedPayment = 'online';
let activeCategory = 'All';
let pendingOrderData = null;
let _shownNotifIds = new Set();

// ── INIT ─────────────────────────────────────────────────────────────────────

document.getElementById('nav-user').textContent = '👋 ' + session.userName;
const owner = DB.get('owner');
document.getElementById('owner-upi').textContent = owner.upiId;

renderMenu();
renderCategoryPills();
renderSlots();
renderProfile();
updateNotifBadge();
setInterval(updateNotifBadge, 4000);
setInterval(() => { if (document.getElementById('tab-content-orders').style.display !== 'none') renderOrders(); }, 4000);

// ── TABS ─────────────────────────────────────────────────────────────────────

function showTab(tab) {
  ['menu', 'cart', 'orders', 'profile'].forEach(t => {
    document.getElementById('tab-content-' + t).style.display = t === tab ? '' : 'none';
    document.getElementById('tab-' + t).classList.toggle('active', t === tab);
  });
  if (tab === 'cart') { renderCart(); renderSlots(); }
  if (tab === 'orders') renderOrders();
  if (tab === 'profile') renderProfile();
}

// ── CATEGORY PILLS ────────────────────────────────────────────────────────────

function renderCategoryPills() {
  const menu = DB.get('menu') || [];
  const cats = ['All', ...new Set(menu.map(i => i.category))];
  const container = document.getElementById('category-pills');
  container.innerHTML = cats.map(c =>
    `<button class="pill ${c === activeCategory ? 'active' : ''}" onclick="filterCategory('${c}')">${c}</button>`
  ).join('');
}

function filterCategory(cat) {
  activeCategory = cat;
  renderCategoryPills();
  renderMenu();
}

// ── MENU ─────────────────────────────────────────────────────────────────────

function renderMenu() {
  const menu = DB.get('menu') || [];
  const search = (document.getElementById('search-input')?.value || '').toLowerCase();
  const filtered = menu.filter(item => {
    const matchCat = activeCategory === 'All' || item.category === activeCategory;
    const matchSearch = item.name.toLowerCase().includes(search) || item.category.toLowerCase().includes(search);
    return matchCat && matchSearch;
  });

  const grid = document.getElementById('food-grid');
  if (!filtered.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🔍</div><p>No items found</p></div>';
    return;
  }

  grid.innerHTML = filtered.map(item => {
    const inCart = cart.find(c => c.id === item.id);
    return `
    <div class="food-card">
      <div class="food-img">${item.emoji}</div>
      <div class="food-body">
        <div class="food-name">${item.name}</div>
        <div class="food-category">${item.category} · ${item.prepTime} min</div>
        <div class="food-footer">
          <span class="food-price">₹${item.price}</span>
          <span class="food-avail ${item.available ? 'available' : 'unavailable'}">${item.available ? '● Available' : '● Unavailable'}</span>
        </div>
        ${item.available
          ? inCart
            ? `<div class="cart-qty" style="margin-top:10px;justify-content:center">
                <button class="qty-btn" onclick="changeQty('${item.id}',-1)">−</button>
                <span style="font-weight:700">${inCart.qty}</span>
                <button class="qty-btn" onclick="changeQty('${item.id}',1)">+</button>
               </div>`
            : `<button class="btn btn-primary btn-full btn-sm" style="margin-top:10px" onclick="addToCart('${item.id}')">+ Add to Cart</button>`
          : `<button class="btn btn-full btn-sm" disabled style="margin-top:10px;background:var(--bg);color:var(--muted)">Unavailable</button>`
        }
      </div>
    </div>`;
  }).join('');
}

// ── CART ─────────────────────────────────────────────────────────────────────

function addToCart(id) {
  const menu = DB.get('menu') || [];
  const item = menu.find(m => m.id === id);
  if (!item) return;
  const existing = cart.find(c => c.id === id);
  if (existing) existing.qty++;
  else cart.push({ id: item.id, name: item.name, price: item.price, qty: 1 });
  updateCartBadge();
  renderMenu();
  toast(item.name + ' added to cart!', 'success', 1500);
}

function changeQty(id, delta) {
  const idx = cart.findIndex(c => c.id === id);
  if (idx === -1) return;
  cart[idx].qty += delta;
  if (cart[idx].qty <= 0) cart.splice(idx, 1);
  updateCartBadge();
  renderMenu();
  renderCart();
}

function clearCart() {
  cart = [];
  selectedSlot = null;
  updateCartBadge();
  renderCart();
  renderMenu();
}

function updateCartBadge() {
  const total = cart.reduce((s, c) => s + c.qty, 0);
  const badge = document.getElementById('cart-badge');
  badge.textContent = total;
  badge.style.display = total > 0 ? 'inline-flex' : 'none';
}

function cartTotal() {
  return cart.reduce((s, c) => s + c.price * c.qty, 0);
}

function renderCart() {
  const list = document.getElementById('cart-items-list');
  const totalEl = document.getElementById('cart-total-display');
  const placeBtn = document.getElementById('place-order-btn');

  if (!cart.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">🛒</div><p>Your cart is empty.<br>Go to Menu to add items!</p></div>';
    totalEl.textContent = '₹0';
    placeBtn.disabled = true;
    return;
  }

  list.innerHTML = cart.map(item => `
    <div class="cart-item">
      <div>
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">₹${item.price} × ${item.qty} = ₹${item.price * item.qty}</div>
      </div>
      <div class="cart-qty">
        <button class="qty-btn" onclick="changeQty('${item.id}',-1)">−</button>
        <span style="font-weight:700">${item.qty}</span>
        <button class="qty-btn" onclick="changeQty('${item.id}',1)">+</button>
      </div>
    </div>
  `).join('');

  totalEl.textContent = '₹' + cartTotal();
  placeBtn.disabled = false;
}

// ── SLOTS ─────────────────────────────────────────────────────────────────────

function renderSlots() {
  const slots = getTimeSlots();
  const grid = document.getElementById('slot-grid');
  grid.innerHTML = slots.map(s => `
    <button class="slot-btn ${s.full ? 'full' : ''} ${selectedSlot === s.label ? 'selected' : ''}"
      onclick="${s.full ? '' : `selectSlot('${s.label}')`}"
      ${s.full ? 'disabled' : ''}>
      ${s.label}<br><small>${s.full ? 'Full' : s.count + '/5'}</small>
    </button>
  `).join('');
}

function selectSlot(label) {
  selectedSlot = label;
  renderSlots();
}

// ── PAYMENT ──────────────────────────────────────────────────────────────────

function selectPayment(type) {
  selectedPayment = type;
  document.getElementById('pay-online').classList.toggle('selected', type === 'online');
  document.getElementById('pay-offline').classList.toggle('selected', type === 'offline');
  document.getElementById('upi-details').style.display = type === 'online' ? 'block' : 'none';
}

// ── PLACE ORDER ───────────────────────────────────────────────────────────────

function placeOrder() {
  if (!cart.length) { toast('Cart is empty!', 'error'); return; }
  if (!selectedSlot) { toast('Please select a pickup time slot', 'warning'); return; }

  const orderId = 'ORD' + Date.now().toString().slice(-6);
  const tokenNum = DB.get('nextToken') || 103;
  const token = '#' + tokenNum;

  pendingOrderData = {
    id: orderId, token,
    studentId: session.userId,
    studentName: session.userName,
    items: cart.map(c => ({ name: c.name, qty: c.qty, price: c.price })),
    total: cartTotal(),
    payment: selectedPayment,
    paymentVerified: selectedPayment === 'offline',
    status: 'pending',
    slot: selectedSlot,
    createdAt: new Date().toISOString(),
    readyAt: null
  };

  if (selectedPayment === 'online') {
    document.getElementById('modal-upi').textContent = owner.upiId;
    document.getElementById('modal-amount').textContent = '₹' + cartTotal();
    document.getElementById('payment-modal').classList.remove('hidden');
  } else {
    finalizeOrder();
  }
}

function confirmPayment() {
  closeModal('payment-modal');
  finalizeOrder();
}

function finalizeOrder() {
  const order = pendingOrderData;
  DB.push('orders', order);
  DB.set('nextToken', (DB.get('nextToken') || 103) + 1);

  addNotification('o1', `New order ${order.token} from ${order.studentName} – ₹${order.total}`, 'order');

  cart = [];
  selectedSlot = null;
  updateCartBadge();
  renderMenu();

  document.getElementById('modal-token').textContent = order.token;
  document.getElementById('modal-pickup').innerHTML = `
    <div>⏰ Pickup Slot: <strong>${order.slot}</strong></div>
    <div style="margin-top:6px">💳 Payment: <strong>${order.payment === 'online' ? 'Online (Pending Verification)' : 'Cash at Counter'}</strong></div>
    <div style="margin-top:6px">📋 Order ID: <strong>${order.id}</strong></div>
  `;
  document.getElementById('token-modal').classList.remove('hidden');

  if (order.payment === 'offline') {
    addNotification(session.userId, `Order ${order.token} placed! Pay ₹${order.total} at counter. Slot: ${order.slot}`, 'success');
  } else {
    addNotification(session.userId, `Order ${order.token} placed! Waiting for payment verification.`, 'info');
  }
  updateNotifBadge();
}

// ── ORDERS ────────────────────────────────────────────────────────────────────

function renderOrders() {
  const orders = (DB.get('orders') || []).filter(o => o.studentId === session.userId).reverse();
  const list = document.getElementById('orders-list');

  if (!orders.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div><p>No orders yet.<br>Go to Menu to place your first order!</p></div>';
    return;
  }

  list.innerHTML = orders.map(o => `
    <div class="order-card ${o.status}">
      <div class="order-header">
        <span class="order-token">${o.token}</span>
        <span class="badge badge-${o.status}">${statusLabel(o.status)}</span>
        <span class="badge badge-${o.payment}">${o.payment === 'online' ? '📱 Online' : '💵 Cash'}</span>
      </div>
      <div class="order-items">${o.items.map(i => `${i.name} ×${i.qty}`).join(' · ')}</div>
      <div class="order-footer">
        <span class="order-total">₹${o.total}</span>
        <span class="order-time">⏰ ${o.slot} · ${formatDate(o.createdAt)}</span>
      </div>
      ${o.status === 'ready' ? `<div style="margin-top:10px;background:#d1fae5;border-radius:8px;padding:10px;font-size:0.85rem;color:#065f46;font-weight:700;border:1px solid #6ee7b7">🔔 Your order is ready! Please collect at the counter.</div>` : ''}
      ${o.payment === 'online' && !o.paymentVerified ? `<div style="margin-top:10px;background:#eef2ff;border-radius:8px;padding:10px;font-size:0.85rem;color:#3730a3;border:1px solid #c7d2fe">⏳ Waiting for payment verification by owner</div>` : ''}
    </div>
  `).join('');
}

// ── PROFILE ───────────────────────────────────────────────────────────────────

function renderProfile() {
  const students = DB.get('students') || [];
  const student = students.find(s => s.id === session.userId);
  const orders = (DB.get('orders') || []).filter(o => o.studentId === session.userId);
  const spent = orders.filter(o => o.status === 'completed').reduce((s, o) => s + o.total, 0);

  document.getElementById('profile-card').innerHTML = `
    <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1rem">
      <div style="width:56px;height:56px;border-radius:50%;background:rgba(255,255,255,0.3);display:flex;align-items:center;justify-content:center;font-size:1.8rem">👤</div>
      <div>
        <div class="p-name">${student?.name || session.userName}</div>
        <div class="p-email">${student?.email || ''}</div>
        ${student?.rollno ? `<div style="font-size:0.8rem;opacity:0.8;margin-top:2px">Roll: ${student.rollno}</div>` : ''}
      </div>
    </div>
    <div class="p-stats">
      <div class="p-stat"><div class="val">${orders.length}</div><div class="lbl">Total Orders</div></div>
      <div class="p-stat"><div class="val">${orders.filter(o=>o.status==='completed').length}</div><div class="lbl">Completed</div></div>
      <div class="p-stat"><div class="val">₹${spent}</div><div class="lbl">Total Spent</div></div>
    </div>
  `;
}

// ── NOTIFICATIONS (right-side alert popups) ───────────────────────────────────

function updateNotifBadge() {
  const notifs = getNotifications(session.userId);
  const unread = notifs.filter(n => !n.read).length;
  const badge = document.getElementById('notif-count');
  badge.textContent = unread;
  badge.style.display = unread > 0 ? 'flex' : 'none';

  // Pop up any new unread notifications as right-side alerts
  notifs.filter(n => !n.read && !_shownNotifIds.has(n.id)).forEach(n => {
    _shownNotifIds.add(n.id);
    showNotifAlert(n);
  });
}

function showNotifAlert(n) {
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  const titles = { success: '✅ Order Update', error: '❌ Alert', warning: '⚠️ Notice', order: '🛒 New Order', ready: '🔔 Order Ready', info: 'ℹ️ Notification' };
  const title = titles[n.type] || 'ℹ️ Notification';
  const el = document.createElement('div');
  el.className = `notif-alert type-${n.type || 'info'}`;
  el.id = 'nalert-' + n.id;
  el.innerHTML = `
    <div class="notif-alert-body">
      <div class="notif-alert-title">${title}</div>
      <div class="notif-alert-msg">${n.message}</div>
      <div class="notif-alert-time">${formatTime(n.time)}</div>
    </div>
    <div class="notif-alert-footer">
      <button class="notif-done-btn" onclick="dismissNotifAlert('${n.id}')">Done</button>
    </div>
  `;
  panel.appendChild(el);
}

function dismissNotifAlert(id) {
  const el = document.getElementById('nalert-' + id);
  if (el) {
    el.classList.add('hide');
    setTimeout(() => el.remove(), 260);
  }
  // Mark as read in DB
  const notifs = DB.get('notifications') || [];
  const n = notifs.find(x => x.id === id);
  if (n) { n.read = true; DB.set('notifications', notifs); }
  updateNotifBadge();
}

// Bell click → show history panel
function toggleNotifHistory() {
  const dd = document.getElementById('notif-dropdown');
  dd.classList.toggle('hidden');
  if (!dd.classList.contains('hidden')) renderNotifList();
}

function renderNotifList() {
  const notifs = getNotifications(session.userId);
  const list = document.getElementById('notif-list');
  if (!notifs.length) {
    list.innerHTML = '<div style="padding:1.2rem;text-align:center;color:var(--muted);font-size:0.85rem">No notifications yet</div>';
    return;
  }
  list.innerHTML = notifs.slice(0, 15).map(n => `
    <div class="notif-history-item ${n.read ? '' : 'unread'}">
      <div>${n.message}</div>
      <div class="nh-time">${formatTime(n.time)}</div>
    </div>
  `).join('');
}

function clearNotifs() {
  markAllRead(session.userId);
  updateNotifBadge();
  renderNotifList();
}

// ── MODAL ─────────────────────────────────────────────────────────────────────

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

// Close history panel when clicking outside
document.addEventListener('click', e => {
  const dd = document.getElementById('notif-dropdown');
  const btn = document.getElementById('notif-btn');
  if (btn && dd && !btn.contains(e.target) && !dd.contains(e.target)) {
    dd.classList.add('hidden');
  }
});
