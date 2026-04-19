const express  = require('express');
const MenuItem = require('../models/MenuItem');
const { authMiddleware, ownerOnly } = require('../middleware/auth');

const router = express.Router();

// ── GET ALL MENU ITEMS ────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const items = await MenuItem.find({}, '-_id -__v');
    res.json(items);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── ADD MENU ITEM (owner) ─────────────────────────────────────────────────────
router.post('/', authMiddleware, ownerOnly, async (req, res) => {
  try {
    const { name, category, price, prepTime, emoji } = req.body;
    if (!name || !category || !price || !prepTime)
      return res.status(400).json({ error: 'name, category, price, prepTime are required' });

    const item = await MenuItem.create({
      id: 'M' + Date.now().toString(36).toUpperCase(),
      name, category,
      price: Number(price),
      prepTime: Number(prepTime),
      emoji: emoji || '🍽️',
      available: true
    });
    res.status(201).json(item);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── TOGGLE AVAILABILITY (owner) ───────────────────────────────────────────────
router.patch('/:id/availability', authMiddleware, ownerOnly, async (req, res) => {
  try {
    const item = await MenuItem.findOneAndUpdate({ id: req.params.id }, { available: req.body.available }, { new: true });
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE MENU ITEM (owner) ──────────────────────────────────────────────────
router.delete('/:id', authMiddleware, ownerOnly, async (req, res) => {
  try {
    const item = await MenuItem.findOneAndDelete({ id: req.params.id });
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json({ message: 'Item deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
