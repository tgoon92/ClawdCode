const express = require('express');
const db = require('../db/database');
const { authenticate, requireFamilyMember } = require('../middleware/auth');

const router = express.Router();

const VALID_TYPES = ['parent_of', 'spouse_of', 'sibling_of', 'step_sibling_of', 'half_sibling_of', 'ex_spouse_of'];
const SYMMETRIC_TYPES = ['spouse_of', 'sibling_of', 'step_sibling_of', 'half_sibling_of', 'ex_spouse_of'];

// Get all family tree members
router.get('/:fid/members', authenticate, requireFamilyMember, (req, res) => {
  const members = db.prepare(`
    SELECT fm.*, u.display_name as linked_user_name, u.email as linked_user_email
    FROM family_members fm
    LEFT JOIN users u ON u.id = fm.user_id
    WHERE fm.family_id = ?
    ORDER BY fm.birth_year ASC, fm.first_name ASC
  `).all(req.params.fid);
  res.json(members);
});

// Get a single family member with relationships and attributed recipes
router.get('/:fid/members/:id', authenticate, requireFamilyMember, (req, res) => {
  const member = db.prepare(`
    SELECT fm.*, u.display_name as linked_user_name, u.email as linked_user_email
    FROM family_members fm
    LEFT JOIN users u ON u.id = fm.user_id
    WHERE fm.id = ? AND fm.family_id = ?
  `).get(req.params.id, req.params.fid);
  if (!member) return res.status(404).json({ error: 'Member not found' });

  // Get relationships
  member.relationships = db.prepare(`
    SELECT r.*,
      fm.first_name as related_first_name, fm.last_name as related_last_name,
      fm.profile_picture as related_profile_picture
    FROM relationships r
    JOIN family_members fm ON fm.id = CASE WHEN r.from_member_id = ? THEN r.to_member_id ELSE r.from_member_id END
    WHERE r.family_id = ? AND (r.from_member_id = ? OR r.to_member_id = ?)
  `).all(req.params.id, req.params.fid, req.params.id, req.params.id).map(r => ({
    ...r,
    direction: r.from_member_id == req.params.id ? 'from' : 'to',
  }));

  // Get recipes attributed to this member OR authored by their linked user
  member.recipes = db.prepare(`
    SELECT DISTINCT r.id, r.title, r.category, r.photo, r.created_at, u.display_name as author_name
    FROM recipes r
    JOIN users u ON u.id = r.author_id
    WHERE r.family_id = ? AND (r.attributed_member_id = ? ${member.user_id ? 'OR r.author_id = ?' : ''})
    ORDER BY r.created_at DESC
  `).all(...[req.params.fid, req.params.id, ...(member.user_id ? [member.user_id] : [])]);

  res.json(member);
});

// Add a family tree member
router.post('/:fid/members', authenticate, requireFamilyMember, (req, res) => {
  const { first_name, last_name, birth_year, death_year, bio, user_id, profile_picture } = req.body;
  if (!first_name) return res.status(400).json({ error: 'First name is required' });

  const result = db.prepare(`
    INSERT INTO family_members (family_id, user_id, first_name, last_name, birth_year, death_year, bio, profile_picture)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.params.fid, user_id || null, first_name, last_name || null, birth_year || null, death_year || null, bio || null, profile_picture || null);

  const member = db.prepare('SELECT * FROM family_members WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(member);
});

// Update a family tree member
router.put('/:fid/members/:id', authenticate, requireFamilyMember, (req, res) => {
  const { first_name, last_name, birth_year, death_year, bio, user_id, profile_picture } = req.body;
  const member = db.prepare('SELECT * FROM family_members WHERE id = ? AND family_id = ?').get(req.params.id, req.params.fid);
  if (!member) return res.status(404).json({ error: 'Member not found' });

  db.prepare(`
    UPDATE family_members SET first_name = ?, last_name = ?, birth_year = ?, death_year = ?, bio = ?, user_id = ?, profile_picture = ?
    WHERE id = ? AND family_id = ?
  `).run(
    first_name || member.first_name,
    last_name !== undefined ? last_name : member.last_name,
    birth_year !== undefined ? birth_year : member.birth_year,
    death_year !== undefined ? death_year : member.death_year,
    bio !== undefined ? bio : member.bio,
    user_id !== undefined ? user_id : member.user_id,
    profile_picture !== undefined ? profile_picture : member.profile_picture,
    req.params.id, req.params.fid
  );

  const updated = db.prepare('SELECT * FROM family_members WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// Delete a family tree member
router.delete('/:fid/members/:id', authenticate, requireFamilyMember, (req, res) => {
  const member = db.prepare('SELECT * FROM family_members WHERE id = ? AND family_id = ?').get(req.params.id, req.params.fid);
  if (!member) return res.status(404).json({ error: 'Member not found' });

  db.prepare('DELETE FROM relationships WHERE (from_member_id = ? OR to_member_id = ?) AND family_id = ?')
    .run(req.params.id, req.params.id, req.params.fid);
  db.prepare('DELETE FROM family_members WHERE id = ? AND family_id = ?').run(req.params.id, req.params.fid);
  res.json({ success: true });
});

// Get all relationships for a family
router.get('/:fid/relationships', authenticate, requireFamilyMember, (req, res) => {
  const relationships = db.prepare(`
    SELECT r.*,
      fm1.first_name as from_first_name, fm1.last_name as from_last_name,
      fm2.first_name as to_first_name, fm2.last_name as to_last_name
    FROM relationships r
    JOIN family_members fm1 ON fm1.id = r.from_member_id
    JOIN family_members fm2 ON fm2.id = r.to_member_id
    WHERE r.family_id = ?
  `).all(req.params.fid);
  res.json(relationships);
});

// Add a relationship
router.post('/:fid/relationships', authenticate, requireFamilyMember, (req, res) => {
  const { from_member_id, to_member_id, type } = req.body;
  if (!from_member_id || !to_member_id || !type) {
    return res.status(400).json({ error: 'from_member_id, to_member_id, and type are required' });
  }
  if (!VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: 'Invalid relationship type' });
  }
  if (from_member_id === to_member_id) {
    return res.status(400).json({ error: 'Cannot create relationship with self' });
  }

  // Verify both members belong to this family
  const m1 = db.prepare('SELECT id FROM family_members WHERE id = ? AND family_id = ?').get(from_member_id, req.params.fid);
  const m2 = db.prepare('SELECT id FROM family_members WHERE id = ? AND family_id = ?').get(to_member_id, req.params.fid);
  if (!m1 || !m2) return res.status(404).json({ error: 'One or both members not found in this family' });

  const insert = db.prepare(
    'INSERT OR IGNORE INTO relationships (family_id, from_member_id, to_member_id, type) VALUES (?, ?, ?, ?)'
  );

  insert.run(req.params.fid, from_member_id, to_member_id, type);
  // Add reverse for symmetric relationships
  if (SYMMETRIC_TYPES.includes(type)) {
    insert.run(req.params.fid, to_member_id, from_member_id, type);
  }

  res.status(201).json({ success: true });
});

// Delete a relationship
router.delete('/:fid/relationships', authenticate, requireFamilyMember, (req, res) => {
  const { from_member_id, to_member_id, type } = req.body;
  if (!from_member_id || !to_member_id || !type) {
    return res.status(400).json({ error: 'from_member_id, to_member_id, and type are required' });
  }

  db.prepare('DELETE FROM relationships WHERE family_id = ? AND from_member_id = ? AND to_member_id = ? AND type = ?')
    .run(req.params.fid, from_member_id, to_member_id, type);
  // Remove reverse for symmetric relationships
  if (SYMMETRIC_TYPES.includes(type)) {
    db.prepare('DELETE FROM relationships WHERE family_id = ? AND from_member_id = ? AND to_member_id = ? AND type = ?')
      .run(req.params.fid, to_member_id, from_member_id, type);
  }

  res.json({ success: true });
});

module.exports = router;
