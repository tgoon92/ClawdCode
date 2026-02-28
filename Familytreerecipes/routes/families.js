const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authenticate, requireFamilyMember } = require('../middleware/auth');

const router = express.Router();

function generateInviteCode() {
  return uuidv4().replace(/-/g, '').substring(0, 8).toUpperCase();
}

// List user's families
router.get('/', authenticate, (req, res) => {
  const families = db.prepare(`
    SELECT f.*, uf.role,
      (SELECT COUNT(*) FROM user_families WHERE family_id = f.id) as member_count,
      (SELECT COUNT(*) FROM recipes WHERE family_id = f.id) as recipe_count
    FROM families f
    JOIN user_families uf ON uf.family_id = f.id
    WHERE uf.user_id = ?
    ORDER BY f.created_at DESC
  `).all(req.user.id);
  res.json(families);
});

// Create family
router.post('/', authenticate, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Family name is required' });

  const invite_code = generateInviteCode();
  const result = db.prepare(
    'INSERT INTO families (name, invite_code, created_by) VALUES (?, ?, ?)'
  ).run(name, invite_code, req.user.id);

  db.prepare(
    'INSERT INTO user_families (user_id, family_id, role) VALUES (?, ?, ?)'
  ).run(req.user.id, result.lastInsertRowid, 'admin');

  const family = db.prepare('SELECT * FROM families WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(family);
});

// Get family details
router.get('/:id', authenticate, requireFamilyMember, (req, res) => {
  const family = db.prepare(`
    SELECT f.*,
      (SELECT COUNT(*) FROM user_families WHERE family_id = f.id) as member_count,
      (SELECT COUNT(*) FROM recipes WHERE family_id = f.id) as recipe_count,
      (SELECT COUNT(*) FROM family_members WHERE family_id = f.id) as tree_member_count
    FROM families f WHERE f.id = ?
  `).get(req.params.id);
  if (!family) return res.status(404).json({ error: 'Family not found' });
  family.role = req.familyRole;
  res.json(family);
});

// Update family
router.put('/:id', authenticate, requireFamilyMember, (req, res) => {
  if (req.familyRole !== 'admin') {
    return res.status(403).json({ error: 'Only admins can update family details' });
  }
  const { name } = req.body;
  if (name) {
    db.prepare('UPDATE families SET name = ? WHERE id = ?').run(name, req.params.id);
  }
  const family = db.prepare('SELECT * FROM families WHERE id = ?').get(req.params.id);
  res.json(family);
});

// Delete family
router.delete('/:id', authenticate, requireFamilyMember, (req, res) => {
  if (req.familyRole !== 'admin') {
    return res.status(403).json({ error: 'Only admins can delete a family' });
  }
  db.prepare('DELETE FROM user_families WHERE family_id = ?').run(req.params.id);
  db.prepare('DELETE FROM families WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Join family with invite code
router.post('/join', authenticate, (req, res) => {
  const { invite_code } = req.body;
  if (!invite_code) return res.status(400).json({ error: 'Invite code is required' });

  const family = db.prepare('SELECT * FROM families WHERE invite_code = ?').get(invite_code.toUpperCase());
  if (!family) return res.status(404).json({ error: 'Invalid invite code' });

  const existing = db.prepare(
    'SELECT * FROM user_families WHERE user_id = ? AND family_id = ?'
  ).get(req.user.id, family.id);
  if (existing) return res.status(409).json({ error: 'Already a member of this family' });

  db.prepare(
    'INSERT INTO user_families (user_id, family_id, role) VALUES (?, ?, ?)'
  ).run(req.user.id, family.id, 'member');

  res.json(family);
});

// Regenerate invite code
router.post('/:id/regenerate-code', authenticate, requireFamilyMember, (req, res) => {
  if (req.familyRole !== 'admin') {
    return res.status(403).json({ error: 'Only admins can regenerate invite codes' });
  }
  const invite_code = generateInviteCode();
  db.prepare('UPDATE families SET invite_code = ? WHERE id = ?').run(invite_code, req.params.id);
  res.json({ invite_code });
});

// Get family members (users who joined)
router.get('/:id/users', authenticate, requireFamilyMember, (req, res) => {
  const members = db.prepare(`
    SELECT u.id, u.email, u.display_name, uf.role, uf.joined_at
    FROM users u
    JOIN user_families uf ON uf.user_id = u.id
    WHERE uf.family_id = ?
    ORDER BY uf.joined_at
  `).all(req.params.id);
  res.json(members);
});

module.exports = router;
