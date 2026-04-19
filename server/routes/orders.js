const express      = require('express');
const Order        = require('../models/Order');
const Notification = require('../models/Notification');
const { authMiddleware, ownerOnly, studentOnly } = require('../middleware/auth');

const router = express.Router();

// ── PLACE ORDER (student) ─────────────────────────────────────────────────────
router.post('/', authMiddleware, studentOnly, async (req, res) => {
  try {
    const { items, total, payment, slot } = req.body;
    if (!items?.length || !total || !payment || !slot)
      return res.status(400).json({ error: 'items, total, payment, slot are required' });

    const slotCount = await Order.countDocuments({ slot, status: { $nin: ['completed', 'cancelled'] } });
    if (slotCount >= 5)
      return res.status(400).json({ error: 'This time slot is full. Please choose another slot.' });

    const order = await Order.create({
      id: 'ORD' + Date.now().toString().slice(-7),
      studentId: req.user.id, studentName: req.user.name,
      items, total: Number(total), payment, slot
    });

    await _notifyOwner(`New order from ${req.user.name} — ₹${total} (${payment})`);
    await _notifyStudent(order.studentId, `✅ Your order has been placed successfully! Order ID: ${order.id}. Slot: ${order.slot}`, 'success');
    res.status(201).json(order);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET SLOT AVAILABILITY (student) ─────────────────────────────────────────
router.get('/slots', authMiddleware, studentOnly, async (req, res) => {
  try {
    const orders = await Order.find({ status: { $nin: ['completed', 'cancelled'] } }, 'slot');
    const counts = {};
    orders.forEach(o => { counts[o.slot] = (counts[o.slot] || 0) + 1; });
    res.json(counts);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET STUDENT'S OWN ORDERS ──────────────────────────────────────────────────
router.get('/my', authMiddleware, studentOnly, async (req, res) => {
  try {
    const orders = await Order.find({ studentId: req.user.id }, '-_id -__v').sort({ createdAt: -1 });
    res.json(orders);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET ALL ORDERS (owner) ────────────────────────────────────────────────────
router.get('/all', authMiddleware, ownerOnly, async (req, res) => {
  try {
    const filter = {};
    if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;
    const orders = await Order.find(filter, '-_id -__v').sort({ createdAt: -1 });
    res.json(orders);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── VERIFY PAYMENT + GENERATE TOKEN (owner) ───────────────────────────────────
router.patch('/:id/verify-payment', authMiddleware, ownerOnly, async (req, res) => {
  try {
    const counter = await _nextToken();
    const order = await Order.findOneAndUpdate(
      { id: req.params.id, payment: 'online' },
      { paymentVerified: true, tokenGenerated: true, token: '#' + counter },
      { new: true }
    );
    if (!order) return res.status(404).json({ error: 'Order not found' });
    await _notifyStudent(order.studentId, `✅ Payment verified! Your token is ${order.token}. Slot: ${order.slot}`, 'success');
    res.json(order);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GENERATE TOKEN FOR OFFLINE ORDER (owner) ──────────────────────────────────
router.patch('/:id/generate-token', authMiddleware, ownerOnly, async (req, res) => {
  try {
    const existing = await Order.findOne({ id: req.params.id });
    if (!existing) return res.status(404).json({ error: 'Order not found' });
    if (existing.tokenGenerated) return res.status(400).json({ error: 'Token already generated' });

    const counter = await _nextToken();
    const order = await Order.findOneAndUpdate(
      { id: req.params.id },
      { token: '#' + counter, tokenGenerated: true, paymentVerified: true },
      { new: true }
    );
    // No student notification for token — only notify when food is ready
    await _notifyStudent(order.studentId, `🎟️ Your token ${order.token} has been generated! Pay ₹${order.total} at counter. Slot: ${order.slot}`, 'success');
    res.json(order);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── UPDATE ORDER STATUS (owner) ───────────────────────────────────────────────
router.patch('/:id/status', authMiddleware, ownerOnly, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['accepted', 'preparing', 'ready', 'completed'];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const update = { status };
    if (status === 'ready')     update.readyAt     = new Date();
    if (status === 'completed') update.completedAt = new Date();

    const order = await Order.findOneAndUpdate({ id: req.params.id }, update, { new: true });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Accept → notify student food is preparing
    if (status === 'accepted') {
      await _notifyStudent(order.studentId, `👨‍🍳 Your order ${order.token || order.id} has been accepted! Your food is being prepared.`, 'info');
    }
    // Complete → notify student order is ready
    if (status === 'completed') {
      await _notifyStudent(order.studentId, `🔔 Your order ${order.token || order.id} is READY! Please collect at the counter.`, 'ready');
    }
    res.json(order);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── STATS (owner) ─────────────────────────────────────────────────────────────
router.get('/stats', authMiddleware, ownerOnly, async (req, res) => {
  try {
    const orders = await Order.find({});
    const todayStr = new Date().toDateString();
    const todayOrders = orders.filter(o => new Date(o.createdAt).toDateString() === todayStr);
    res.json({
      total: orders.length,
      pending: orders.filter(o => o.status === 'pending').length,
      todayCount: todayOrders.length,
      todayRevenue: todayOrders.filter(o => o.status === 'completed').reduce((s, o) => s + o.total, 0),
      totalRevenue: orders.filter(o => o.status === 'completed').reduce((s, o) => s + o.total, 0),
      byStatus: {
        pending:   orders.filter(o => o.status === 'pending').length,
        accepted:  orders.filter(o => o.status === 'accepted').length,
        preparing: orders.filter(o => o.status === 'preparing').length,
        ready:     orders.filter(o => o.status === 'ready').length,
        completed: orders.filter(o => o.status === 'completed').length
      },
      byPayment: {
        online:  orders.filter(o => o.payment === 'online').length,
        offline: orders.filter(o => o.payment === 'offline').length
      },
      revenueByDay: _revenueByDay(orders),
      topItems: _topItems(orders),
      paymentRevenue: {
        online:  orders.filter(o => o.status === 'completed' && o.payment === 'online').reduce((s, o) => s + o.total, 0),
        offline: orders.filter(o => o.status === 'completed' && o.payment === 'offline').reduce((s, o) => s + o.total, 0)
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── HELPERS ───────────────────────────────────────────────────────────────────
async function _notifyStudent(studentId, message, type) {
  await Notification.create({ id: 'N' + Date.now().toString(36).toUpperCase(), userId: studentId, message, type });
}

async function _notifyOwner(message) {
  await Notification.create({ id: 'N' + Date.now().toString(36).toUpperCase(), userId: 'o1', message, type: 'order' });
}

async function _nextToken() {
  const last = await Order.findOne({ token: { $ne: null } }).sort({ createdAt: -1 });
  if (!last || !last.token) return 101;
  return parseInt(last.token.replace('#', '')) + 1;
}

function _revenueByDay(orders) {
  const result = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const label = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' });
    const dateStr = d.toDateString();
    const dayOrders = orders.filter(o => new Date(o.createdAt).toDateString() === dateStr);
    const revenue = dayOrders.filter(o => o.status === 'completed').reduce((s, o) => s + o.total, 0);
    const totalOrders = dayOrders.length;
    const completed = dayOrders.filter(o => o.status === 'completed').length;
    const pending = dayOrders.filter(o => o.status === 'pending').length;
    result.push({ label, revenue, totalOrders, completed, pending });
  }
  return result;
}

function _topItems(orders) {
  const count = {};
  orders.forEach(o => o.items.forEach(i => { count[i.name] = (count[i.name] || 0) + i.qty; }));
  return Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, qty]) => ({ name, qty }));
}

module.exports = router;
