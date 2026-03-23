// ── OWNER DASHBOARD LOGIC ────────────────────────────────────────────────────

const session = Auth.requireRole('owner');
let orderFilter = 'all';
let deleteTargetId = null;
let revenueChart, itemsChart, statusChart, paymentChart;
let _shownNotifIds = new Set();

// ── INIT ─────────────────────────────────────────────────────────────────────

document.getElementById('nav-user').textContent = '👋 ' + session.userName;
document.getElementById('today-date').textContent = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long' });

renderStats();
renderOwnerOrders();
updateNotifBadge();
setInterval(() => { renderStats(); renderOwnerOrders(); updateNotifBadge(); }, 4000);

// ── TABS ─────────────────────────────────────────────────────────────────────

function showTab(tab) {
  ['orders', 'menu', 'analytics', 'settings'].forEach(t => {
    document.getElementById('tab-content-' + t).style.display = t === tab ? '' : 'none';
    document.getElementById('tab-' + t).classList.toggle('active', t === tab);
  });
  if (tab === 'menu') renderMenuItems();
  if (tab === 'analytics') renderCharts();
  if (tab === 'settings') loadSettings();
}

// ── STATS ─────────────────────────────────────────────────────────────────────

function renderStats() {
  const orders = DB.get('orders') || [];
  const owner = DB.get('owner');
  const todayStr = new Date().toDateString();
  const todayRevenue = orders
    .filter(o => new Date(o.createdAt).toDateString() === todayStr && o.status === 'completed')
    .reduce((s, o) => s + o.total, 0);
  const pending = orders.filter(o => o.status === 'pending').length;
  const totalRevenue = (owner.earnings || 0) + orders.filter(o => o.status === 'completed').reduce((s, o) => s + o.total, 0);
  const todayCount = orders.filter(o => new Date(o.createdAt).toDateString() === todayStr).length;

  document.getElementById('stats-grid').innerHTML = `
    <div class="stat-card purple">
      <div class="stat-icon">📦</div>
      <div class="stat-value">${orders.length}</div>
      <div class="stat-label">Total Orders</div>
    </div>
    <div class="stat-card orange">
      <div class="stat-icon">⏳</div>
      <div class="stat-value">${pending}</div>
      <div class="stat-label">Pending Now</div>
    </div>
    <div class="stat-card green">
      <div class="stat-icon">📅</div>
      <div class="stat-value">${todayCount}</div>
      <div class="stat-label">Today's Orders</div>
    </div>
    <div class="stat-card blue">
      <div class="stat-icon">💰</div>
      <div class="stat-value">₹${totalRevenue}</div>
      <div class="stat-label">Total Earnings</div>
    </div>
  `;
}

// ── ORDERS ────────────────────────────────────────────────────────────────────

function filterOrders(status, btn) {
  orderFilter = status;
  document.querySelectorAll('.filter-orders .pill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  renderOwnerOrders();
}

function renderOwnerOrders() {
  let orders = (DB.get('orders') || []).slice().reverse();
  if (orderFilter !== 'all') orders = orders.filter(o => o.status === orderFilter);

  const list = document.getElementById('owner-orders-list');
  if (!orders.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><p>No ${orderFilter === 'all' ? '' : orderFilter} orders found.</p></div>`;
    return;
  }
  list.innerHTML = orders.map(o => buildOrderCard(o)).join('');
}

function buildOrderCard(o) {
  const itemRows = o.items.map(i => `
    <tr>
      <td>${i.name}</td>
      <td style="text-align:center;color:var(--muted)">×${i.qty}</td>
      <td style="text-align:right;font-weight:700">₹${i.price * i.qty}</td>
    </tr>
  `).join('');

  // Offline: show token banner (token was pre-assigned on order placement)
  const offlineBanner = o.payment === 'offline' ? `
    <div class="offline-token-banner">
      <div class="big-token">${o.token}</div>
      <div class="token-info">
        <div class="t-label">Token — Cash Payment</div>
        <div class="t-note">Student pays ₹${o.total} at counter</div>
        <div class="t-note" style="margin-top:4px">Slot: <strong>${o.slot}</strong></div>
      </div>
    </div>
  ` : '';

  // Online: verify payment button or verified badge
  let onlineBar = '';
  if (o.payment === 'online') {
    onlineBar = !o.paymentVerified
      ? `<div class="payment-pending-bar">
           <span class="pp-text">⏳ UPI payment pending verification</span>
           <button class="pipe-btn verify" onclick="verifyPayment('${o.id}')">✅ Verify Payment</button>
         </div>`
      : `<div class="payment-verified-bar">✅ Payment verified — Token: <strong>${o.token}</strong></div>`;
  }

  // Pipeline action buttons
  let actions = '';
  if (o.status === 'pending') {
    actions = `<button class="pipe-btn accept" onclick="updateOrderStatus('${o.id}','accepted')">✅ Accept Order</button>`;
  } else if (o.status === 'accepted') {
    actions = `<button class="pipe-btn prepare" onclick="updateOrderStatus('${o.id}','preparing')">👨‍🍳 Start Preparing</button>`;
  } else if (o.status === 'preparing') {
    actions = `<button class="pipe-btn ready" onclick="updateOrderStatus('${o.id}','ready')">🔔 Mark Ready</button>`;
  } else if (o.status === 'ready') {
    actions = `<button class="pipe-btn complete" onclick="updateOrderStatus('${o.id}','completed')">✔️ Mark Completed</button>`;
  } else {
    actions = `<span style="font-size:0.8rem;color:var(--muted)">✔️ Completed</span>`;
  }

  return `
  <div class="o-order-card ${o.status}">
    <div class="o-order-head">
      <div>
        <div class="o-student-name">👤 ${o.studentName}</div>
        <div class="o-student-meta">ID: ${o.id} &nbsp;·&nbsp; ${formatDate(o.createdAt)} ${formatTime(o.createdAt)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span class="o-token">${o.token}</span>
        <span class="badge badge-${o.status}">${statusLabel(o.status)}</span>
        <span class="badge badge-${o.payment}">${o.payment === 'online' ? '📱 Online' : '💵 Cash'}</span>
      </div>
    </div>
    ${offlineBanner}
    ${onlineBar}
    <div class="o-order-body">
      <table class="o-items-table">
        <thead><tr><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Amount</th></tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
      <div class="o-total-row">
        <span>Total</span>
        <span style="color:var(--primary)">₹${o.total}</span>
      </div>
    </div>
    <div class="o-order-foot">
      <div class="o-meta-chips">
        <span class="o-chip slot">⏰ ${o.slot}</span>
        <span class="o-chip time">🕐 ${formatTime(o.createdAt)}</span>
      </div>
      <div class="pipeline">${actions}</div>
    </div>
  </div>`;
}

// ── ORDER STATUS UPDATE ───────────────────────────────────────────────────────

function updateOrderStatus(orderId, newStatus) {
  const orders = DB.get('orders') || [];
  const idx = orders.findIndex(o => o.id === orderId);
  if (idx === -1) return;
  orders[idx].status = newStatus;
  if (newStatus === 'ready') orders[idx].readyAt = new Date().toISOString();
  if (newStatus === 'completed') orders[idx].completedAt = new Date().toISOString();
  DB.set('orders', orders);

  const o = orders[idx];
  const msgs = {
    accepted:  `Your order ${o.token} has been accepted! Preparing soon.`,
    preparing: `Your order ${o.token} is being prepared. Slot: ${o.slot}`,
    ready:     `🔔 Your order ${o.token} is READY! Please collect at the counter.`,
    completed: `Order ${o.token} completed. Thank you!`
  };
  if (msgs[newStatus]) addNotification(o.studentId, msgs[newStatus], newStatus === 'ready' ? 'ready' : 'success');

  toast(`Order ${o.token} → ${statusLabel(newStatus)}`, 'success');
  renderOwnerOrders();
  renderStats();
}

// ── VERIFY PAYMENT ────────────────────────────────────────────────────────────

function verifyPayment(orderId) {
  const orders = DB.get('orders') || [];
  const idx = orders.findIndex(o => o.id === orderId);
  if (idx === -1) return;
  orders[idx].paymentVerified = true;
  DB.set('orders', orders);
  const o = orders[idx];
  addNotification(o.studentId, `✅ Payment verified for order ${o.token}! Token confirmed.`, 'success');
  toast(`Payment verified for ${o.token}`, 'success');
  renderOwnerOrders();
}

// ── MENU ─────────────────────────────────────────────────────────────────────

function renderMenuItems() {
  const menu = DB.get('menu') || [];
  document.getElementById('menu-count').textContent = menu.length + ' items';
  const list = document.getElementById('menu-items-list');
  if (!menu.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">🍽️</div><p>No menu items yet. Add items above.</p></div>';
    return;
  }
  list.innerHTML = menu.map(item => `
    <div class="menu-item-row">
      <span style="font-size:1.6rem">${item.emoji}</span>
      <div class="menu-item-info">
        <div class="item-name">${item.name}</div>
        <div class="item-meta">
          <span style="background:#FFF7ED;color:#9A3412;padding:2px 8px;border-radius:20px;font-size:0.72rem;font-weight:700">${item.category}</span>
          &nbsp;₹${item.price} &nbsp;·&nbsp; ${item.prepTime} min
        </div>
      </div>
      <label class="toggle-switch" title="${item.available ? 'Available' : 'Unavailable'}">
        <input type="checkbox" ${item.available ? 'checked' : ''} onchange="toggleAvailability('${item.id}',this.checked)" />
        <span class="toggle-slider"></span>
      </label>
      <button class="btn btn-danger btn-sm" onclick="deleteMenuItem('${item.id}')">🗑️</button>
    </div>
  `).join('');
}

function addMenuItem() {
  const name  = document.getElementById('new-name').value.trim();
  const cat   = document.getElementById('new-category').value;
  const price = parseInt(document.getElementById('new-price').value);
  const prep  = parseInt(document.getElementById('new-prep').value);
  const emoji = document.getElementById('new-emoji').value.trim() || '🍽️';

  if (!name || !price || !prep) { toast('Please fill all fields', 'warning'); return; }

  const menu = DB.get('menu') || [];
  menu.push({ id: genId('M'), name, category: cat, price, prepTime: prep, emoji, available: true });
  DB.set('menu', menu);

  ['new-name','new-price','new-prep','new-emoji'].forEach(id => document.getElementById(id).value = '');
  toast(name + ' added to menu!', 'success');
  renderMenuItems();
}

function toggleAvailability(id, val) {
  const menu = DB.get('menu') || [];
  const item = menu.find(m => m.id === id);
  if (item) { item.available = val; DB.set('menu', menu); }
  toast((val ? 'Available' : 'Unavailable') + ': ' + (item?.name || ''), val ? 'success' : 'warning');
}

function deleteMenuItem(id) {
  deleteTargetId = id;
  document.getElementById('delete-modal').classList.remove('hidden');
}

function confirmDelete() {
  const menu = (DB.get('menu') || []).filter(m => m.id !== deleteTargetId);
  DB.set('menu', menu);
  closeModal('delete-modal');
  toast('Item removed from menu', 'success');
  renderMenuItems();
}

// ── ANALYTICS ─────────────────────────────────────────────────────────────────

function renderCharts() {
  const orders = DB.get('orders') || [];

  const days = [], revenues = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const label = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' });
    const rev = orders
      .filter(o => new Date(o.createdAt).toDateString() === d.toDateString() && o.status === 'completed')
      .reduce((s, o) => s + o.total, 0);
    days.push(label); revenues.push(rev);
  }

  const itemCount = {};
  orders.forEach(o => o.items.forEach(i => { itemCount[i.name] = (itemCount[i.name] || 0) + i.qty; }));
  const topItems = Object.entries(itemCount).sort((a, b) => b[1] - a[1]).slice(0, 6);

  const statuses = ['pending','accepted','preparing','ready','completed'];
  const statusCounts = statuses.map(s => orders.filter(o => o.status === s).length);

  const onlineCount  = orders.filter(o => o.payment === 'online').length;
  const offlineCount = orders.filter(o => o.payment === 'offline').length;

  const palette = ['#4f46e5','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6'];

  if (revenueChart) revenueChart.destroy();
  revenueChart = new Chart(document.getElementById('revenue-chart'), {
    type: 'bar',
    data: { labels: days, datasets: [{ label: 'Revenue (₹)', data: revenues, backgroundColor: '#4f46e5', borderRadius: 6 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
  });

  if (itemsChart) itemsChart.destroy();
  itemsChart = new Chart(document.getElementById('items-chart'), {
    type: 'bar',
    data: { labels: topItems.map(i => i[0]), datasets: [{ label: 'Qty Sold', data: topItems.map(i => i[1]), backgroundColor: palette, borderRadius: 6 }] },
    options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } } }
  });

  if (statusChart) statusChart.destroy();
  statusChart = new Chart(document.getElementById('status-chart'), {
    type: 'doughnut',
    data: { labels: statuses.map(s => s.charAt(0).toUpperCase() + s.slice(1)), datasets: [{ data: statusCounts, backgroundColor: ['#f59e0b','#0ea5e9','#8b5cf6','#10b981','#94a3b8'] }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
  });

  if (paymentChart) paymentChart.destroy();
  paymentChart = new Chart(document.getElementById('payment-chart'), {
    type: 'pie',
    data: { labels: ['Online (UPI)', 'Cash at Counter'], datasets: [{ data: [onlineCount, offlineCount], backgroundColor: ['#4f46e5','#f59e0b'] }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
  });
}

// ── SETTINGS ─────────────────────────────────────────────────────────────────

function loadSettings() {
  const owner = DB.get('owner');
  document.getElementById('set-name').value  = owner.name  || '';
  document.getElementById('set-upi').value   = owner.upiId || '';
  document.getElementById('set-phone').value = owner.phone || '';
}

function saveSettings() {
  const owner = DB.get('owner');
  owner.name  = document.getElementById('set-name').value.trim()  || owner.name;
  owner.upiId = document.getElementById('set-upi').value.trim()   || owner.upiId;
  owner.phone = document.getElementById('set-phone').value.trim() || owner.phone;
  const newPw = document.getElementById('set-password').value;
  if (newPw) owner.password = newPw;
  DB.set('owner', owner);
  toast('Settings saved!', 'success');
}

// ── NOTIFICATIONS (right-side alert popups) ───────────────────────────────────

function updateNotifBadge() {
  const notifs = getNotifications('o1');
  const unread = notifs.filter(n => !n.read).length;
  const badge = document.getElementById('notif-count');
  badge.textContent = unread;
  badge.style.display = unread > 0 ? 'flex' : 'none';

  // Pop up new unread notifications as right-side alerts
  notifs.filter(n => !n.read && !_shownNotifIds.has(n.id)).forEach(n => {
    _shownNotifIds.add(n.id);
    showNotifAlert(n);
  });
}

function showNotifAlert(n) {
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  const titles = { success: '✅ Update', error: '❌ Alert', warning: '⚠️ Notice', order: '🛒 New Order', ready: '🔔 Ready', info: 'ℹ️ Info' };
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
  const notifs = getNotifications('o1');
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
  markAllRead('o1');
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
