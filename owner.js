// ── OWNER DASHBOARD ───────────────────────────────────────────────────────────

const currentUser = Auth.requireRole('owner');
if (!currentUser) throw new Error('Not authenticated');

let orderFilter = 'all';
let deleteTargetId = null;
let revenueChart, itemsChart, statusChart, paymentChart;
let _shownNotifIds = new Set();

// ── INIT ──────────────────────────────────────────────────────────────────────
document.getElementById('nav-user').textContent = '👋 ' + currentUser.name;
document.getElementById('today-date').textContent = new Date().toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'long' });

(async () => {
  await loadStats();
  await loadOrders();
  await pollNotifications();
  setInterval(async () => { await loadStats(); await loadOrders(); await pollNotifications(); }, 5000);
})();

// ── TABS ──────────────────────────────────────────────────────────────────────
function showTab(tab) {
  ['orders','menu','analytics','settings'].forEach(t => {
    document.getElementById('tab-content-' + t).style.display = t === tab ? '' : 'none';
    document.getElementById('tab-' + t).classList.toggle('active', t === tab);
  });
  if (tab === 'menu')      loadMenuItems();
  if (tab === 'analytics') loadCharts();
  if (tab === 'settings')  loadSettings();
}

// ── STATS ─────────────────────────────────────────────────────────────────────
async function loadStats() {
  try {
    const s = await api('GET', '/orders/stats');
    document.getElementById('stats-grid').innerHTML = `
      <div class="stat-card purple">
        <div class="stat-icon">📦</div>
        <div class="stat-value">${s.total}</div>
        <div class="stat-label">Total Orders</div>
      </div>
      <div class="stat-card orange">
        <div class="stat-icon">⏳</div>
        <div class="stat-value">${s.pending}</div>
        <div class="stat-label">Pending Now</div>
      </div>
      <div class="stat-card green">
        <div class="stat-icon">📅</div>
        <div class="stat-value">${s.todayCount}</div>
        <div class="stat-label">Today's Orders</div>
      </div>
      <div class="stat-card blue">
        <div class="stat-icon">💰</div>
        <div class="stat-value">₹${s.totalRevenue}</div>
        <div class="stat-label">Total Earnings</div>
      </div>`;
  } catch (e) { console.error('Stats error:', e.message); }
}

// ── ORDERS ────────────────────────────────────────────────────────────────────
function filterOrders(status, btn) {
  orderFilter = status;
  document.querySelectorAll('.filter-orders .pill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  loadOrders();
}

async function loadOrders() {
  try {
    const orders = await api('GET', `/orders/all?status=${orderFilter}`);
    renderOrders(orders);
  } catch (e) { console.error('Orders error:', e.message); }
}

function renderOrders(orders) {
  const list = document.getElementById('owner-orders-list');
  if (!orders.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><p>No ${orderFilter === 'all' ? '' : orderFilter} orders.</p></div>`;
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
    </tr>`).join('');

  // Offline: show generate token button if not yet generated
  let offlineSection = '';
  if (o.payment === 'offline') {
    if (!o.tokenGenerated) {
      offlineSection = `
        <div class="payment-pending-bar">
          <span class="pp-text">💵 Cash order — Generate token for student</span>
          <button class="pipe-btn verify" onclick="generateToken('${o.id}')">🎟️ Generate Token</button>
        </div>`;
    } else {
      offlineSection = `
        <div class="offline-token-banner">
          <div class="big-token">${o.token}</div>
          <div class="token-info">
            <div class="t-label">Token — Cash Payment</div>
            <div class="t-note">Student pays ₹${o.total} at counter</div>
            <div class="t-note" style="margin-top:4px">Slot: <strong>${o.slot}</strong></div>
          </div>
        </div>`;
    }
  }

  // Online: verify payment button
  let onlineSection = '';
  if (o.payment === 'online') {
    onlineSection = !o.paymentVerified
      ? `<div class="payment-pending-bar">
           <span class="pp-text">⏳ UPI payment pending verification</span>
           <button class="pipe-btn verify" onclick="verifyPayment('${o.id}')">✅ Verify & Generate Token</button>
         </div>`
      : `<div class="payment-verified-bar">✅ Payment verified — Token: <strong>${o.token}</strong></div>`;
  }

  // Pipeline buttons — Accept only after payment verified, then Complete
  let actions = '';
  const paymentOk = o.paymentVerified;
  if (o.status === 'pending') {
    actions = paymentOk
      ? `<button class="pipe-btn accept" onclick="updateStatus('${o.id}','accepted')">✅ Accept</button>`
      : `<span style="font-size:0.8rem;color:var(--warning);font-weight:600">⏳ Verify payment first</span>`;
  } else if (o.status === 'accepted') {
    actions = `<span style="font-size:0.8rem;color:var(--info);font-weight:600">👨🍳 Food is Preparing...</span>
      <button class="pipe-btn complete" onclick="updateStatus('${o.id}','completed')" style="margin-left:8px">✔️ Complete</button>`;
  } else if (o.status === 'preparing' || o.status === 'ready') {
    actions = `<button class="pipe-btn complete" onclick="updateStatus('${o.id}','completed')">✔️ Complete</button>`;
  } else {
    actions = `<span style="font-size:0.8rem;color:var(--muted)">✔️ Completed</span>`;
  }

  return `
  <div class="o-order-card ${o.status}">
    <div class="o-order-head">
      <div>
        <div class="o-student-name">👤 ${o.studentName}</div>
        <div class="o-student-meta">ID: ${o.id} · ${formatDate(o.createdAt)} ${formatTime(o.createdAt)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span class="o-token">${o.token || '—'}</span>
        <span class="badge badge-${o.status}">${statusLabel(o.status)}</span>
        <span class="badge badge-${o.payment}">${o.payment === 'online' ? '📱 Online' : '💵 Cash'}</span>
      </div>
    </div>
    ${offlineSection}${onlineSection}
    <div class="o-order-body">
      <table class="o-items-table">
        <thead><tr><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Amount</th></tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
      <div class="o-total-row"><span>Total</span><span style="color:var(--primary)">₹${o.total}</span></div>
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

async function updateStatus(orderId, status) {
  try {
    await api('PATCH', `/orders/${orderId}/status`, { status });
    toast(`Order → ${statusLabel(status)}`, 'success');
    await loadOrders(); await loadStats();
  } catch (e) { toast(e.message, 'error'); }
}

async function verifyPayment(orderId) {
  try {
    await api('PATCH', `/orders/${orderId}/verify-payment`);
    toast('Payment verified & token generated!', 'success');
    await loadOrders();
  } catch (e) { toast(e.message, 'error'); }
}

async function generateToken(orderId) {
  try {
    await api('PATCH', `/orders/${orderId}/generate-token`);
    toast('Token generated!', 'success');
    await loadOrders();
  } catch (e) { toast(e.message, 'error'); }
}

// ── MENU ──────────────────────────────────────────────────────────────────────
async function loadMenuItems() {
  try {
    const menu = await api('GET', '/menu');
    document.getElementById('menu-count').textContent = menu.length + ' items';
    const list = document.getElementById('menu-items-list');
    if (!menu.length) {
      list.innerHTML = '<div class="empty-state"><div class="empty-icon">🍽️</div><p>No items yet. Add above.</p></div>';
      return;
    }
    list.innerHTML = menu.map(item => `
      <div class="menu-item-row">
        <span style="font-size:1.6rem">${item.emoji}</span>
        <div class="menu-item-info">
          <div class="item-name">${item.name}</div>
          <div class="item-meta">
            <span style="background:#FFF7ED;color:#9A3412;padding:2px 8px;border-radius:20px;font-size:0.72rem;font-weight:700">${item.category}</span>
            &nbsp;₹${item.price} · ${item.prepTime} min
          </div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" ${item.available ? 'checked' : ''} onchange="toggleAvail('${item.id}',this.checked)" />
          <span class="toggle-slider"></span>
        </label>
        <button class="btn btn-danger btn-sm" onclick="deleteMenuItem('${item.id}')">🗑️</button>
      </div>`).join('');
  } catch (e) { toast('Menu load failed: ' + e.message, 'error'); }
}

async function addMenuItem() {
  const name     = document.getElementById('new-name').value.trim();
  const category = document.getElementById('new-category').value;
  const price    = parseInt(document.getElementById('new-price').value);
  const prepTime = parseInt(document.getElementById('new-prep').value);
  const emoji    = document.getElementById('new-emoji').value.trim() || '🍽️';

  if (!name || !price || !prepTime) { toast('Fill all fields', 'warning'); return; }
  try {
    await api('POST', '/menu', { name, category, price, prepTime, emoji });
    ['new-name','new-price','new-prep','new-emoji'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('emoji-preview').textContent = '🍽️';
    document.querySelectorAll('.emoji-pick.selected').forEach(b => b.classList.remove('selected'));
    toast(name + ' added to menu!', 'success');
    loadMenuItems();
  } catch (e) { toast(e.message, 'error'); }
}

function pickEmoji(emoji) {
  document.getElementById('new-emoji').value = emoji;
  document.getElementById('emoji-preview').textContent = emoji;
  document.querySelectorAll('.emoji-pick').forEach(b => b.classList.remove('selected'));
  event.target.classList.add('selected');
  document.getElementById('emoji-picker').style.display = 'none';
}

function toggleEmojiPicker() {
  const picker = document.getElementById('emoji-picker');
  picker.style.display = picker.style.display === 'none' ? 'block' : 'none';
}

async function toggleAvail(id, val) {
  try {
    await api('PATCH', `/menu/${id}/availability`, { available: val });
    toast(val ? 'Marked Available' : 'Marked Unavailable', val ? 'success' : 'warning');
  } catch (e) { toast(e.message, 'error'); }
}

function deleteMenuItem(id) {
  deleteTargetId = id;
  document.getElementById('delete-modal').classList.remove('hidden');
}

async function confirmDelete() {
  try {
    await api('DELETE', `/menu/${deleteTargetId}`);
    closeModal('delete-modal');
    toast('Item deleted', 'success');
    loadMenuItems();
  } catch (e) { toast(e.message, 'error'); }
}

// ── ANALYTICS ─────────────────────────────────────────────────────────────────
async function loadCharts() {
  try {
    const s = await api('GET', '/orders/stats');
    const palette = ['#F97316','#EAB308','#16A34A','#0284C7','#DC2626','#9333EA'];

    if (revenueChart) revenueChart.destroy();
    revenueChart = new Chart(document.getElementById('revenue-chart'), {
      type: 'bar',
      data: { labels: s.revenueByDay.map(d => d.label), datasets: [{ label: 'Revenue (₹)', data: s.revenueByDay.map(d => d.revenue), backgroundColor: '#F97316', borderRadius: 6 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });

    if (itemsChart) itemsChart.destroy();
    itemsChart = new Chart(document.getElementById('items-chart'), {
      type: 'bar',
      data: { labels: s.topItems.map(i => i.name), datasets: [{ label: 'Qty Sold', data: s.topItems.map(i => i.qty), backgroundColor: palette, borderRadius: 6 }] },
      options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } } }
    });

    const statuses = ['pending','accepted','preparing','ready','completed'];
    if (statusChart) statusChart.destroy();
    statusChart = new Chart(document.getElementById('status-chart'), {
      type: 'doughnut',
      data: { labels: statuses.map(s => s.charAt(0).toUpperCase()+s.slice(1)), datasets: [{ data: statuses.map(k => s.byStatus[k]), backgroundColor: ['#EAB308','#0284C7','#F97316','#16A34A','#78716C'] }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });

    if (paymentChart) paymentChart.destroy();
    paymentChart = new Chart(document.getElementById('payment-chart'), {
      type: 'pie',
      data: { labels: ['Online (UPI)', 'Cash at Counter'], datasets: [{ data: [s.byPayment.online, s.byPayment.offline], backgroundColor: ['#F97316','#EAB308'] }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });

  } catch (e) { toast('Analytics error: ' + e.message, 'error'); }
}

// ── SETTINGS ──────────────────────────────────────────────────────────────────
function loadSettings() {
  document.getElementById('set-name').value  = currentUser.name  || '';
  document.getElementById('set-upi').value   = currentUser.upiId || '';
  document.getElementById('set-phone').value = currentUser.phone || '';
}

async function saveSettings() {
  const body = {
    name:  document.getElementById('set-name').value.trim(),
    upiId: document.getElementById('set-upi').value.trim(),
    phone: document.getElementById('set-phone').value.trim()
  };
  const pw = document.getElementById('set-password').value;
  if (pw) body.password = pw;
  try {
    await api('PUT', '/auth/owner/settings', body);
    toast('Settings saved!', 'success');
  } catch (e) { toast(e.message, 'error'); }
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
      notifs.forEach(n => _shownNotifIds.add(n.id));
      _notifInitialized = true;
      return;
    }

    // Show popup only for NEW order notifications
    notifs.filter(n => !n.read && !_shownNotifIds.has(n.id)).forEach(n => {
      _shownNotifIds.add(n.id);
      if (n.type === 'order') showNotifAlert(n);
    });
  } catch {}
}

function showNotifAlert(n) {
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  const titles = { success:'✅ Update', error:'❌ Alert', warning:'⚠️ Notice', order:'🛒 New Order', ready:'🔔 Ready', info:'ℹ️ Info' };
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
