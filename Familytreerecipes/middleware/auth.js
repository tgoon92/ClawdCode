const jwt = require('jsonwebtoken');

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const token = header.split(' ')[1];
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Middleware to verify user belongs to family
function requireFamilyMember(req, res, next) {
  const db = require('../db/database');
  const familyId = req.params.fid || req.params.id;
  const row = db.prepare(
    'SELECT role FROM user_families WHERE user_id = ? AND family_id = ?'
  ).get(req.user.id, familyId);
  if (!row) {
    return res.status(403).json({ error: 'Not a member of this family' });
  }
  req.familyRole = row.role;
  next();
}

module.exports = { authenticate, requireFamilyMember };
