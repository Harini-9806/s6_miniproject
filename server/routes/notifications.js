const express      = require('express');
const Notification = require('../models/Notification');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// ── GET MY NOTIFICATIONS ──────────────────────────────────────────────────────
router.get('/', authMiddleware, async (req, res) => {
  try {
    const notifs = await Notification.find({ userId: req.user.id }, '-_id -__v').sort({ time: -1 });
    res.json(notifs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── MARK ALL READ ─────────────────────────────────────────────────────────────
router.patch('/read-all', authMiddleware, async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.user.id }, { read: true });
    res.json({ message: 'All marked as read' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── MARK ONE READ ─────────────────────────────────────────────────────────────
router.patch('/:id/read', authMiddleware, async (req, res) => {
  try {
    const n = await Notification.findOneAndUpdate({ id: req.params.id, userId: req.user.id }, { read: true }, { new: true });
    if (!n) return res.status(404).json({ error: 'Not found' });
    res.json(n);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
