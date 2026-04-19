// ── API CONFIG ────────────────────────────────────────────────────────────────
const API = '/api';

// ── TOKEN STORAGE (JWT in sessionStorage) ────────────────────────────────────
const Auth = {
  getToken()  { return sessionStorage.getItem('token'); },
  getUser()   { return JSON.parse(sessionStorage.getItem('user') || 'null'); },
  setSession(token, user) {
    sessionStorage.setItem('token', token);
    sessionStorage.setItem('user', JSON.stringify(user));
  },
  logout() { sessionStorage.clear(); window.location.href = '/index.html'; },
  requireRole(role) {
    const user = Auth.getUser();
    if (!user || user.role !== role) {
      window.location.href = '/index.html';
      return null;
    }
    return user;
  }
};

// ── HTTP HELPER ───────────────────────────────────────────────────────────────
async function api(method, endpoint, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  const token = Auth.getToken();
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  if (body)  opts.body = JSON.stringify(body);

  const url = API + endpoint;
  const res  = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error('Server error: ' + res.status + ' — Is the server running?'); }
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ── TOAST ─────────────────────────────────────────────────────────────────────
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

// ── HELPERS ───────────────────────────────────────────────────────────────────
function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}
function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function statusLabel(s) {
  return { pending:'⏳ Pending', accepted:'✅ Accepted', preparing:'👨🍳 Preparing', ready:'🔔 Ready', completed:'✔️ Completed' }[s] || s;
}

// ── TIME SLOTS ────────────────────────────────────────────────────────────────
function getTimeSlots(counts = {}) {
  const starts = [
    '08:30','09:00','09:30','10:00','10:30',
    '11:00','11:30','12:00','12:30','13:00'
  ];
  return starts.map(start => {
    const [h, m] = start.split(':').map(Number);
    const em = m + 30, eh = em >= 60 ? h + 1 : h, em2 = em >= 60 ? em - 60 : em;
    const label = `${start}–${String(eh).padStart(2,'0')}:${String(em2).padStart(2,'0')}`;
    const count = counts[label] || 0;
    return { label, count, full: count >= 5 };
  });
}
