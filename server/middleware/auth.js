const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'smartcanteen_secret_2024';

function authMiddleware(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ error: 'No token provided' });
  const token = header.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Invalid token format' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token expired or invalid' });
  }
}

function ownerOnly(req, res, next) {
  if (req.user?.role !== 'owner') return res.status(403).json({ error: 'Owner access only' });
  next();
}

function studentOnly(req, res, next) {
  if (req.user?.role !== 'student') return res.status(403).json({ error: 'Student access only' });
  next();
}

module.exports = { authMiddleware, ownerOnly, studentOnly, SECRET };
