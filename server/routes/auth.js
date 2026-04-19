const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const Student  = require('../models/Student');
const Owner    = require('../models/Owner');
const { SECRET } = require('../middleware/auth');

const router = express.Router();

// ── STUDENT REGISTER ──────────────────────────────────────────────────────────
router.post('/student/register', async (req, res) => {
  try {
    const { name, email, phone, rollno, password } = req.body;
    if (!name || !email || !phone || !rollno || !password)
      return res.status(400).json({ error: 'All fields are required' });

    if (await Student.findOne({ email: email.toLowerCase() }))
      return res.status(409).json({ error: 'Email already registered' });

    const student = await Student.create({
      id: 'S' + Date.now().toString(36).toUpperCase(),
      name, phone, rollno,
      email: email.toLowerCase(),
      password: await bcrypt.hash(password, 10)
    });

    const token = jwt.sign({ id: student.id, name: student.name, role: 'student' }, SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: { id: student.id, name: student.name, email: student.email, role: 'student' } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── STUDENT LOGIN ─────────────────────────────────────────────────────────────
router.post('/student/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const student = await Student.findOne({ email: email?.toLowerCase() });
    if (!student || !await bcrypt.compare(password, student.password))
      return res.status(401).json({ error: 'Invalid email or password' });

    const token = jwt.sign({ id: student.id, name: student.name, role: 'student' }, SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: student.id, name: student.name, email: student.email, rollno: student.rollno, phone: student.phone, role: 'student' } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── OWNER LOGIN ───────────────────────────────────────────────────────────────
router.post('/owner/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const owner = await Owner.findOne({ email: email?.toLowerCase() });
    if (!owner || !await bcrypt.compare(password, owner.password))
      return res.status(401).json({ error: 'Invalid owner credentials' });

    const token = jwt.sign({ id: owner.id, name: owner.name, role: 'owner' }, SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: owner.id, name: owner.name, email: owner.email, upiId: owner.upiId, phone: owner.phone, role: 'owner' } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── OWNER UPDATE SETTINGS ─────────────────────────────────────────────────────
router.put('/owner/settings', require('../middleware/auth').authMiddleware, require('../middleware/auth').ownerOnly, async (req, res) => {
  try {
    const { name, upiId, phone, password } = req.body;
    const owner = await Owner.findOne({ id: req.user.id });
    if (name)     owner.name  = name;
    if (upiId)    owner.upiId = upiId;
    if (phone)    owner.phone = phone;
    if (password) owner.password = await bcrypt.hash(password, 10);
    await owner.save();
    res.json({ message: 'Settings updated', owner: { name: owner.name, upiId: owner.upiId, phone: owner.phone } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── OWNER PUBLIC INFO ─────────────────────────────────────────────────────────
router.get('/owner/info', require('../middleware/auth').authMiddleware, async (req, res) => {
  try {
    const owner = await Owner.findOne({ id: 'o1' });
    res.json({ upiId: owner.upiId, name: owner.name, phone: owner.phone });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
