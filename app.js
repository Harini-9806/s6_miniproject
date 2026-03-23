// ── DATA LAYER (localStorage) ──────────────────────────────────────────────

const DB = {
  get: k => JSON.parse(localStorage.getItem(k) || 'null'),
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
  push: (k, v) => { const a = DB.get(k) || []; a.push(v); DB.set(k, a); return v; },
};

// ── SEED DEFAULT DATA ───────────────────────────────────────────────────────
// Only seeds auth data. Menu is empty — owner must upload items.
// Token is null until owner generates it after payment confirmation.

function seedData() {
  if (DB.get('seeded')) return;

  DB.set('students', [
    { id: 's1', name: 'Arjun Kumar', email: 'arjun@college.edu', phone: '9876543210', password: 'student123' }
  ]);

  DB.set('owner', {
    id: 'o1', name: 'Ravi Canteen', email: 'owner@canteen.com', password: 'owner123',
    upiId: 'ravi@upi', phone: '9000000001'
  });

  // Menu starts EMPTY — owner must add items via Menu tab
  DB.set('menu', []);

  // Two sample orders: one completed (token assigned), one pending (no token yet)
  DB.set('orders', [
    {
      id: 'ORD001', token: '#101',
      studentId: 's1', studentName: 'Arjun Kumar',
      items: [{ name: 'Masala Dosa', qty: 2, price: 40 }, { name: 'Cold Coffee', qty: 1, price: 50 }],
      total: 130, payment: 'online', paymentVerified: true, tokenGenerated: true,
      status: 'completed', slot: '10:30–10:45',
      createdAt: new Date(Date.now() - 86400000).toISOString(), completedAt: new Date(Date.now() - 82800000).toISOString()
    },
    {
      id: 'ORD002', token: null,
      studentId: 's1', studentName: 'Arjun Kumar',
      items: [{ name: 'Veg Fried Rice', qty: 1, price: 60 }],
      total: 60, payment: 'offline', paymentVerified: false, tokenGenerated: false,
      status: 'pending', slot: '11:00–11:15',
      createdAt: new Date(Date.now() - 3600000).toISOString(), completedAt: null
    }
  ]);

  DB.set('notifications', []);
  DB.set('nextToken', 103);
  DB.set('orderHistory', []);
  DB.set('seeded', true);
}

// ── AUTH ────────────────────────────────────────────────────────────────────

const Auth = {
  loginStudent(email, password) {
    const students = DB.get('students') || [];
    return students.find(s => s.email === email && s.password === password) || null;
  },
  loginOwner(email, password) {
    const owner = DB.get('owner');
    return (owner && owner.email === email && owner.password === password) ? owner : null;
  },
  setSession(role, user) {
    sessionStorage.setItem('role', role);
    sessionStorage.setItem('userId', user.id);
    sessionStorage.setItem('userName', user.name);
  },
  getSession() {
    return {
      role: sessionStorage.getItem('role'),
      userId: sessionStorage.getItem('userId'),
      userName: sessionStorage.getItem('userName'),
    };
  },
  logout() { sessionStorage.clear(); window.location.href = 'index.html'; },
  requireRole(role) {
    const s = Auth.getSession();
    if (s.role !== role) window.location.href = 'index.html';
    return s;
  }
};

// ── TOAST ───────────────────────────────────────────────────────────────────

function toast(msg, type = 'default', duration = 3200) {
  let c = document.getElementById('toast-container');
  if (!c) { c = document.createElement('div'); c.id = 'toast-container'; document.body.appendChild(c); }
  const t = document.createElement('div');
  const icons = { success: '✅', error: '❌', warning: '⚠️', default: 'ℹ️' };
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${icons[type] || icons.default}</span><span>${msg}</span>`;
  c.appendChild(t);
  setTimeout(() => t.remove(), duration);
}

// ── HELPERS ─────────────────────────────────────────────────────────────────

function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}
function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function genId(prefix) { return prefix + Date.now().toString(36).toUpperCase(); }
function statusLabel(s) {
  return { pending:'⏳ Pending', accepted:'✅ Accepted', preparing:'👨‍🍳 Preparing', ready:'🔔 Ready', completed:'✔️ Completed' }[s] || s;
}

// ── NOTIFICATIONS ───────────────────────────────────────────────────────────

function addNotification(userId, message, type = 'info') {
  const notifs = DB.get('notifications') || [];
  notifs.unshift({ id: genId('N'), userId, message, type, read: false, time: new Date().toISOString() });
  DB.set('notifications', notifs);
}
function getNotifications(userId) {
  return (DB.get('notifications') || []).filter(n => n.userId === userId);
}
function markAllRead(userId) {
  const notifs = DB.get('notifications') || [];
  notifs.forEach(n => { if (n.userId === userId) n.read = true; });
  DB.set('notifications', notifs);
}

// ── TIME SLOTS ──────────────────────────────────────────────────────────────

function getTimeSlots() {
  const slots = [];
  const orders = DB.get('orders') || [];
  let h = 8, m = 0;
  while (h < 17) {
    const start = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    m += 15; if (m >= 60) { m = 0; h++; }
    const end = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    const label = `${start}–${end}`;
    const count = orders.filter(o => o.slot === label && !['completed','cancelled'].includes(o.status)).length;
    slots.push({ label, count, full: count >= 5 });
  }
  return slots;
}

// ── HISTORY HELPER ──────────────────────────────────────────────────────────
// Adds a completed order snapshot to history when owner marks completed

function addToHistory(order) {
  const history = DB.get('orderHistory') || [];
  if (!history.find(h => h.id === order.id)) {
    history.unshift({ ...order, completedAt: new Date().toISOString() });
    DB.set('orderHistory', history);
  }
}

seedData();
