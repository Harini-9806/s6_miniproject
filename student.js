// ── STUDENT DASHBOARD ────────────────────────────────────────────────────────

const currentUser = Auth.requireRole('student');
if (!currentUser) throw new Error('Not authenticated');

let cart = [];
let selectedSlot = null;
let selectedPayment = 'online';
let activeCategory = 'All';
let pendingOrderData = null;
let allOrders = [];
let _shownNotifIds = new Set();

// ── INIT ──────────────────────────────────────────────────────────────────────
document.getElementById('nav-user').textContent = '👋 ' + currentUser.name;

(async () => {
  await loadMenu();
  await loadOrders();
  await pollNotifications();
  // Preload owner UPI ID for online payment
  try {
    const owner = await api('GET', '/auth/owner/info');
    const upiId = owner?.upiId || 'ravi@upi';
    document.getElementById('owner-upi').textContent = upiId;
    document.getElementById('modal-upi').textContent = upiId;
  } catch { 
    document.getElementById('owner-upi').textContent = 'ravi@upi';
    document.getElementById('modal-upi').textContent = 'ravi@upi';
  }
  setInterval(pollNotifications, 5000);
  setInterval(async () => {
    if (document.getElementById('tab-content-orders').style.display !== 'none') await loadOrders();
  }, 5000);
})();

// ── TABS ──────────────────────────────────────────────────────────────────────
function showTab(tab) {
  ['menu','cart','orders','profile'].forEach(t => {
    document.getElementById('tab-content-' + t).style.display = t === tab ? '' : 'none';
    document.getElementById('tab-' + t).classList.toggle('active', t === tab);
  });
  if (tab === 'cart')    { renderCart(); renderSlots(); }
  if (tab === 'orders')  loadOrders();
  if (tab === 'profile') renderProfile();
}

// ── MENU ──────────────────────────────────────────────────────────────────────
let menuItems = [];

async function loadMenu() {
  try {
    menuItems = await api('GET', '/menu');
    renderCategoryPills();
    renderMenu();
  } catch (e) { toast('Failed to load menu: ' + e.message, 'error'); }
}

function renderCategoryPills() {
  const cats = ['All', ...new Set(menuItems.map(i => i.category))];
  document.getElementById('category-pills').innerHTML = cats.map(c =>
    `<button class="pill ${c === activeCategory ? 'active' : ''}" onclick="filterCategory('${c}')">${c}</button>`
  ).join('');
}

function filterCategory(cat) {
  activeCategory = cat;
  renderCategoryPills();
  renderMenu();
}

function renderMenu() {
  const search = (document.getElementById('search-input')?.value || '').toLowerCase();
  const filtered = menuItems.filter(item => {
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

// ── CART ──────────────────────────────────────────────────────────────────────
function addToCart(id) {
  const item = menuItems.find(m => m.id === id);
  if (!item) return;
  const existing = cart.find(c => c.id === id);
  if (existing) existing.qty++;
  else cart.push({ id: item.id, name: item.name, price: item.price, qty: 1 });
  updateCartBadge();
  renderMenu();
  toast(item.name + ' added!', 'success', 1400);
}

function changeQty(id, delta) {
  const idx = cart.findIndex(c => c.id === id);
  if (idx === -1) return;
  cart[idx].qty += delta;
  if (cart[idx].qty <= 0) cart.splice(idx, 1);
  updateCartBadge(); renderMenu(); renderCart();
}

function clearCart() {
  cart = []; selectedSlot = null;
  const btn = document.getElementById('place-order-btn');
  if (btn) btn.disabled = true;
  updateCartBadge(); renderCart(); renderMenu();
}

function updateCartBadge() {
  const total = cart.reduce((s, c) => s + c.qty, 0);
  const badge = document.getElementById('cart-badge');
  badge.textContent = total;
  badge.style.display = total > 0 ? 'inline-flex' : 'none';
}

function cartTotal() { return cart.reduce((s, c) => s + c.price * c.qty, 0); }

function renderCart() {
  const list    = document.getElementById('cart-items-list');
  const totalEl = document.getElementById('cart-total-display');
  const placeBtn = document.getElementById('place-order-btn');

  if (!cart.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">🛒</div><p>Cart is empty. Go to Menu!</p></div>';
    totalEl.textContent = '₹0'; placeBtn.disabled = true; return;
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
    </div>`).join('');
  totalEl.textContent = '₹' + cartTotal();
  placeBtn.disabled = !selectedSlot;
}

// ── SLOTS ─────────────────────────────────────────────────────────────────────
let liveSlotCounts = {};

function drawSlots() {
  const slots = getTimeSlots(liveSlotCounts);
  const grid = document.getElementById('slot-grid');
  if (!grid) return;
  grid.innerHTML = '';
  slots.forEach(s => {
    const remaining = 5 - s.count;
    const btn = document.createElement('button');
    btn.className = 'slot-btn' + (s.full ? ' full' : remaining <= 2 ? ' limited' : '') + (selectedSlot === s.label ? ' selected' : '');
    btn.dataset.slot = s.label;
    btn.disabled = s.full;
    btn.innerHTML = `<strong>${s.label}</strong><br><small>${s.full ? '🚫 Full' : remaining === 1 ? '⚠️ 1 left' : remaining <= 2 ? `⚠️ ${remaining} left` : `${remaining}/5 left`}</small>`;
    if (!s.full) btn.addEventListener('click', () => selectSlot(s.label));
    grid.appendChild(btn);
  });
}

async function renderSlots() {
  drawSlots();
  try { liveSlotCounts = await api('GET', '/orders/slots'); } catch { liveSlotCounts = {}; }
  drawSlots();
}

function selectSlot(label) {
  selectedSlot = label;
  document.querySelectorAll('#slot-grid .slot-btn').forEach(b => {
    b.classList.toggle('selected', b.dataset.slot === label);
  });
  const btn = document.getElementById('place-order-btn');
  if (btn && cart.length) btn.disabled = false;
  document.getElementById('slot-warning').style.display = 'none';
}

// ── PAYMENT ───────────────────────────────────────────────────────────────────
function selectPayment(type) {
  selectedPayment = type;
  document.getElementById('pay-online').classList.toggle('selected', type === 'online');
  document.getElementById('pay-offline').classList.toggle('selected', type === 'offline');
  document.getElementById('upi-details').style.display = type === 'online' ? 'block' : 'none';
}

// ── PLACE ORDER ───────────────────────────────────────────────────────────────
async function placeOrder() {
  if (!cart.length) { toast('Cart is empty!', 'error'); return; }
  if (!selectedSlot) {
    document.getElementById('slot-warning').style.display = 'block';
    document.getElementById('slot-grid').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  if (selectedPayment === 'online') {
    const upiId = document.getElementById('modal-upi').textContent || 'ravi@upi';
    const amount = cartTotal();
    document.getElementById('modal-amount').textContent = '₹' + amount;
    document.getElementById('payment-modal').classList.remove('hidden');
    // Generate QR code
    const qrDiv = document.getElementById('upi-qr');
    qrDiv.innerHTML = '';
    document.getElementById('payment-status-msg').style.display = 'none';
    const upiUrl = `upi://pay?pa=${upiId}&pn=SmartCanteen&am=${amount}&cu=INR`;
    new QRCode(qrDiv, { text: upiUrl, width: 180, height: 180, colorDark: '#1C1917', colorLight: '#ffffff' });
  } else {
    await finalizeOrder();
  }
}

async function confirmPayment() {
  closeModal('payment-modal');
  await finalizeOrder();
}

async function handlePaymentConfirm(paid) {
  const msg = document.getElementById('payment-status-msg');
  if (!paid) {
    msg.style.display = 'block';
    msg.style.color = 'var(--danger)';
    msg.innerHTML = '❌ Payment Not Completed. Please scan the QR and pay first.';
    return;
  }

  // Place the order first, then wait for owner to verify payment
  const btns = document.querySelectorAll('#payment-modal .btn');
  btns.forEach(b => b.disabled = true);
  msg.style.display = 'block';
  msg.style.color = 'var(--info)';
  msg.innerHTML = '⏳ Placing order and waiting for payment verification...';

  try {
    // Place the order
    const order = await api('POST', '/orders', {
      items: cart.map(c => ({ name: c.name, qty: c.qty, price: c.price })),
      total: cartTotal(),
      payment: 'online',
      slot: selectedSlot
    });

    // Poll every 3 seconds to check if owner verified payment (max 60 seconds)
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const orders = await api('GET', '/orders/my');
        const placed = orders.find(o => o.id === order.id);
        if (placed && placed.paymentVerified) {
          clearInterval(interval);
          msg.style.color = 'var(--success)';
          msg.innerHTML = '✅ Payment Completed! Your order has been confirmed.';
          setTimeout(async () => {
            closeModal('payment-modal');
            msg.style.display = 'none';
            btns.forEach(b => b.disabled = false);
            cart = []; selectedSlot = null;
            updateCartBadge(); renderMenu();
            document.getElementById('modal-token').textContent = placed.token || '⏳ Pending';
            document.getElementById('modal-pickup').innerHTML = `
              <div>⏰ Pickup Slot: <strong>${placed.slot}</strong></div>
              <div style="margin-top:6px">💳 Payment: <strong>Online — Verified</strong></div>
              <div style="margin-top:6px">📋 Order ID: <strong>${placed.id}</strong></div>`;
            document.getElementById('token-modal').classList.remove('hidden');
            toast('Order confirmed!', 'success');
            await loadOrders();
          }, 1500);
        } else if (attempts >= 20) {
          clearInterval(interval);
          msg.style.color = 'var(--warning)';
          msg.innerHTML = '⚠️ Payment not yet verified by owner. Your order is placed — token will be assigned after verification.';
          btns.forEach(b => b.disabled = false);
          setTimeout(async () => {
            closeModal('payment-modal');
            msg.style.display = 'none';
            cart = []; selectedSlot = null;
            updateCartBadge(); renderMenu();
            await loadOrders();
          }, 3000);
        }
      } catch {}
    }, 3000);
  } catch (e) {
    msg.style.color = 'var(--danger)';
    msg.innerHTML = '❌ ' + e.message;
    btns.forEach(b => b.disabled = false);
  }
}

async function finalizeOrder() {
  try {
    const order = await api('POST', '/orders', {
      items: cart.map(c => ({ name: c.name, qty: c.qty, price: c.price })),
      total: cartTotal(),
      payment: selectedPayment,
      slot: selectedSlot
    });

    cart = []; selectedSlot = null;
    updateCartBadge(); renderMenu();

    document.getElementById('modal-token').textContent = order.token || '⏳ Pending';
    document.getElementById('modal-pickup').innerHTML = `
      <div>⏰ Pickup Slot: <strong>${order.slot}</strong></div>
      <div style="margin-top:6px">💳 Payment: <strong>${order.payment === 'online' ? 'Online — Awaiting Verification' : 'Cash at Counter'}</strong></div>
      <div style="margin-top:6px">📋 Order ID: <strong>${order.id}</strong></div>
      ${order.payment === 'offline' ? '<div style="margin-top:6px;color:var(--warning)">🎟️ Token will be assigned by owner</div>' : ''}
    `;
    document.getElementById('token-modal').classList.remove('hidden');
    toast('Order placed successfully!', 'success');
    await loadOrders();
  } catch (e) {
    if (e.message && e.message.toLowerCase().includes('slot')) {
      toast('⚠️ This time slot is now full! Please choose another slot.', 'error');
      selectedSlot = null;
      const btn = document.getElementById('place-order-btn');
      if (btn) btn.disabled = true;
      await renderSlots();
      document.getElementById('slot-grid').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      toast('Order failed: ' + e.message, 'error');
    }
  }
}

// ── ORDERS ────────────────────────────────────────────────────────────────────
async function loadOrders() {
  try {
    allOrders = await api('GET', '/orders/my');
    renderOrders();
  } catch (e) { console.error('Orders load failed:', e.message); }
}

function renderOrders() {
  const list = document.getElementById('orders-list');
  if (!allOrders.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div><p>No orders yet. Go to Menu!</p></div>';
    return;
  }
  list.innerHTML = allOrders.map(o => `
    <div class="order-card ${o.status}">
      <div class="order-header">
        <span class="order-token">${o.token || '⏳ Token Pending'}</span>
        <span class="badge badge-${o.status}">${statusLabel(o.status)}</span>
        <span class="badge badge-${o.payment}">${o.payment === 'online' ? '📱 Online' : '💵 Cash'}</span>
      </div>
      <div class="order-items">${o.items.map(i => `${i.name} ×${i.qty}`).join(' · ')}</div>
      <div class="order-footer">
        <span class="order-total">₹${o.total}</span>
        <span class="order-time">⏰ ${o.slot} · ${formatDate(o.createdAt)}</span>
      </div>
      ${o.status === 'ready' ? `<div style="margin-top:10px;background:#D1FAE5;border-radius:8px;padding:10px;font-size:0.85rem;color:#065F46;font-weight:700;border:1px solid #6EE7B7">🔔 Your order is READY! Collect at the counter.</div>` : ''}
      ${o.payment === 'online' && !o.paymentVerified ? `<div style="margin-top:10px;background:#FFF7ED;border-radius:8px;padding:10px;font-size:0.85rem;color:#9A3412;border:1px solid #FED7AA">⏳ Waiting for payment verification by owner</div>` : ''}
      ${o.payment === 'offline' && !o.tokenGenerated ? `<div style="margin-top:10px;background:#FFF7ED;border-radius:8px;padding:10px;font-size:0.85rem;color:#9A3412;border:1px solid #FED7AA">⏳ Waiting for owner to generate your token</div>` : ''}
    </div>`).join('');
}

// ── PROFILE ───────────────────────────────────────────────────────────────────
function renderProfile() {
  const spent = allOrders.filter(o => o.status === 'completed').reduce((s, o) => s + o.total, 0);
  document.getElementById('profile-card').innerHTML = `
    <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1rem">
      <div style="width:56px;height:56px;border-radius:50%;background:rgba(255,255,255,0.3);display:flex;align-items:center;justify-content:center;font-size:1.8rem">👤</div>
      <div>
        <div class="p-name">${currentUser.name}</div>
        <div class="p-email">${currentUser.email}</div>
        ${currentUser.rollno ? `<div style="font-size:0.8rem;opacity:0.8;margin-top:2px">Roll: ${currentUser.rollno}</div>` : ''}
      </div>
    </div>
    <div class="p-stats">
      <div class="p-stat"><div class="val">${allOrders.length}</div><div class="lbl">Total Orders</div></div>
      <div class="p-stat"><div class="val">${allOrders.filter(o=>o.status==='completed').length}</div><div class="lbl">Completed</div></div>
      <div class="p-stat"><div class="val">₹${spent}</div><div class="lbl">Total Spent</div></div>
    </div>`;
}

// ── NOTIFICATIONS ─────────────────────────────────────────────────────────────
let _notifInitialized = false;

async function pollNotifications() {
  try {
    const notifs = await api('GET', '/notifications');
    const unread = notifs.filter(n => !n.read).length;
    const badge = document.getElementById('notif-count');
    badge.textContent = unread;
    badge.style.display = unread > 0 ? 'flex' : 'none';

    if (!_notifInitialized) {
      // On first load, only skip already-read notifications
      // Unread ones will still show as popups
      notifs.filter(n => n.read).forEach(n => _shownNotifIds.add(n.id));
      _notifInitialized = true;
    }

    // Show popup for unread notifications
    notifs.filter(n => !n.read && !_shownNotifIds.has(n.id)).forEach(n => {
      _shownNotifIds.add(n.id);
      if (n.type === 'ready' || n.type === 'info' || n.type === 'success') showNotifAlert(n);
    });
  } catch {}
}

function showNotifAlert(n) {
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  const titles = { success:'✅ Order Update', error:'❌ Alert', warning:'⚠️ Notice', order:'🛒 New Order', ready:'🔔 Order Ready!', info:'👨🍳 Food is Preparing!' };
  const el = document.createElement('div');
  el.className = `notif-alert type-${n.type || 'info'}`;
  el.id = 'nalert-' + n.id;
  el.innerHTML = `
    <div class="notif-alert-body">
      <div class="notif-alert-title">${titles[n.type] || 'ℹ️ Notification'}</div>
      <div class="notif-alert-msg">${n.message}</div>
      <div class="notif-alert-time">${formatTime(n.time)}</div>
    </div>
    <div class="notif-alert-footer">
      <button class="notif-done-btn" onclick="dismissNotifAlert('${n.id}')">Done</button>
    </div>`;
  panel.appendChild(el);
  // Auto-dismiss after 6 seconds
  setTimeout(() => dismissNotifAlert(n.id), 6000);
}

async function dismissNotifAlert(id) {
  const el = document.getElementById('nalert-' + id);
  if (el) { el.classList.add('hide'); setTimeout(() => el.remove(), 260); }
  try { await api('PATCH', `/notifications/${id}/read`); } catch {}
  await pollNotifications();
}

function toggleNotifHistory() {
  const dd = document.getElementById('notif-dropdown');
  dd.classList.toggle('hidden');
  if (!dd.classList.contains('hidden')) loadNotifHistory();
}

async function loadNotifHistory() {
  try {
    const notifs = await api('GET', '/notifications');
    const list = document.getElementById('notif-list');
    if (!notifs.length) { list.innerHTML = '<div style="padding:1.2rem;text-align:center;color:var(--muted);font-size:0.85rem">No notifications yet</div>'; return; }
    list.innerHTML = notifs.slice(0,15).map(n => `
      <div class="notif-history-item ${n.read ? '' : 'unread'}">
        <div>${n.message}</div>
        <div class="nh-time">${formatTime(n.time)}</div>
      </div>`).join('');
  } catch {}
}

async function clearNotifs() {
  try { await api('PATCH', '/notifications/read-all'); } catch {}
  await pollNotifications();
  loadNotifHistory();
}

// ── MODAL ─────────────────────────────────────────────────────────────────────
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

document.addEventListener('click', e => {
  const dd = document.getElementById('notif-dropdown');
  const btn = document.getElementById('notif-btn');
  if (btn && dd && !btn.contains(e.target) && !dd.contains(e.target)) dd.classList.add('hidden');
});
