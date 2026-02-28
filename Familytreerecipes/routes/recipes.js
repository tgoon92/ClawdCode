const express = require('express');
const db = require('../db/database');
const { authenticate, requireFamilyMember } = require('../middleware/auth');

const router = express.Router();

// Get recipes for a family (with search, filter, sort, pagination)
router.get('/:fid/recipes', authenticate, requireFamilyMember, (req, res) => {
  const { search, category, tag, sort, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  let where = ['r.family_id = ?'];
  let params = [req.params.fid];

  if (search) {
    where.push("(r.title LIKE ? OR r.description LIKE ? OR r.ingredients LIKE ?)");
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  if (category) {
    where.push('r.category = ?');
    params.push(category);
  }
  if (tag) {
    where.push('EXISTS (SELECT 1 FROM recipe_tags rt JOIN tags t ON t.id = rt.tag_id WHERE rt.recipe_id = r.id AND t.name = ?)');
    params.push(tag);
  }

  let orderBy = 'r.created_at DESC';
  if (sort === 'oldest') orderBy = 'r.created_at ASC';
  else if (sort === 'title') orderBy = 'r.title ASC';
  else if (sort === 'prep_time') orderBy = 'r.prep_time ASC';

  const countSql = `SELECT COUNT(*) as total FROM recipes r WHERE ${where.join(' AND ')}`;
  const total = db.prepare(countSql).get(...params).total;

  const sql = `
    SELECT r.*, u.display_name as author_name
    FROM recipes r
    JOIN users u ON u.id = r.author_id
    WHERE ${where.join(' AND ')}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `;
  const recipes = db.prepare(sql).all(...params, parseInt(limit), offset);

  // Attach tags to each recipe
  const tagStmt = db.prepare(`
    SELECT t.name FROM tags t
    JOIN recipe_tags rt ON rt.tag_id = t.id
    WHERE rt.recipe_id = ?
  `);
  for (const recipe of recipes) {
    recipe.tags = tagStmt.all(recipe.id).map(t => t.name);
  }

  res.json({
    recipes,
    total,
    page: parseInt(page),
    totalPages: Math.ceil(total / parseInt(limit))
  });
});

// Get single recipe
router.get('/:fid/recipes/:id', authenticate, requireFamilyMember, (req, res) => {
  const recipe = db.prepare(`
    SELECT r.*, u.display_name as author_name
    FROM recipes r
    JOIN users u ON u.id = r.author_id
    WHERE r.id = ? AND r.family_id = ?
  `).get(req.params.id, req.params.fid);
  if (!recipe) return res.status(404).json({ error: 'Recipe not found' });

  recipe.tags = db.prepare(`
    SELECT t.name FROM tags t
    JOIN recipe_tags rt ON rt.tag_id = t.id
    WHERE rt.recipe_id = ?
  `).all(recipe.id).map(t => t.name);

  res.json(recipe);
});

// Create recipe
router.post('/:fid/recipes', authenticate, requireFamilyMember, (req, res) => {
  const { title, description, ingredients, instructions, category, prep_time, cook_time, servings, photo, family_story, tags } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });

  const result = db.prepare(`
    INSERT INTO recipes (family_id, author_id, title, description, ingredients, instructions, category, prep_time, cook_time, servings, photo, family_story)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.params.fid, req.user.id, title,
    description || null,
    JSON.stringify(ingredients || []),
    JSON.stringify(instructions || []),
    category || null,
    prep_time || null, cook_time || null, servings || null,
    photo || null, family_story || null
  );

  // Handle tags
  if (tags && tags.length > 0) {
    const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
    const getTag = db.prepare('SELECT id FROM tags WHERE name = ?');
    const linkTag = db.prepare('INSERT OR IGNORE INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)');
    for (const tagName of tags) {
      insertTag.run(tagName.toLowerCase().trim());
      const t = getTag.get(tagName.toLowerCase().trim());
      if (t) linkTag.run(result.lastInsertRowid, t.id);
    }
  }

  const recipe = db.prepare('SELECT r.*, u.display_name as author_name FROM recipes r JOIN users u ON u.id = r.author_id WHERE r.id = ?').get(result.lastInsertRowid);
  recipe.tags = tags || [];
  res.status(201).json(recipe);
});

// Update recipe
router.put('/:fid/recipes/:id', authenticate, requireFamilyMember, (req, res) => {
  const recipe = db.prepare('SELECT * FROM recipes WHERE id = ? AND family_id = ?').get(req.params.id, req.params.fid);
  if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
  if (recipe.author_id !== req.user.id && req.familyRole !== 'admin') {
    return res.status(403).json({ error: 'Only the author or admin can edit this recipe' });
  }

  const { title, description, ingredients, instructions, category, prep_time, cook_time, servings, photo, family_story, tags } = req.body;

  db.prepare(`
    UPDATE recipes SET title = ?, description = ?, ingredients = ?, instructions = ?, category = ?,
      prep_time = ?, cook_time = ?, servings = ?, photo = ?, family_story = ?, updated_at = datetime('now')
    WHERE id = ? AND family_id = ?
  `).run(
    title || recipe.title,
    description !== undefined ? description : recipe.description,
    ingredients ? JSON.stringify(ingredients) : recipe.ingredients,
    instructions ? JSON.stringify(instructions) : recipe.instructions,
    category !== undefined ? category : recipe.category,
    prep_time !== undefined ? prep_time : recipe.prep_time,
    cook_time !== undefined ? cook_time : recipe.cook_time,
    servings !== undefined ? servings : recipe.servings,
    photo !== undefined ? photo : recipe.photo,
    family_story !== undefined ? family_story : recipe.family_story,
    req.params.id, req.params.fid
  );

  // Update tags
  if (tags !== undefined) {
    db.prepare('DELETE FROM recipe_tags WHERE recipe_id = ?').run(req.params.id);
    if (tags.length > 0) {
      const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
      const getTag = db.prepare('SELECT id FROM tags WHERE name = ?');
      const linkTag = db.prepare('INSERT OR IGNORE INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)');
      for (const tagName of tags) {
        insertTag.run(tagName.toLowerCase().trim());
        const t = getTag.get(tagName.toLowerCase().trim());
        if (t) linkTag.run(parseInt(req.params.id), t.id);
      }
    }
  }

  const updated = db.prepare('SELECT r.*, u.display_name as author_name FROM recipes r JOIN users u ON u.id = r.author_id WHERE r.id = ?').get(req.params.id);
  updated.tags = db.prepare('SELECT t.name FROM tags t JOIN recipe_tags rt ON rt.tag_id = t.id WHERE rt.recipe_id = ?').all(req.params.id).map(t => t.name);
  res.json(updated);
});

// Delete recipe
router.delete('/:fid/recipes/:id', authenticate, requireFamilyMember, (req, res) => {
  const recipe = db.prepare('SELECT * FROM recipes WHERE id = ? AND family_id = ?').get(req.params.id, req.params.fid);
  if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
  if (recipe.author_id !== req.user.id && req.familyRole !== 'admin') {
    return res.status(403).json({ error: 'Only the author or admin can delete this recipe' });
  }

  db.prepare('DELETE FROM recipe_tags WHERE recipe_id = ?').run(req.params.id);
  db.prepare('DELETE FROM recipes WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Get all tags for a family
router.get('/:fid/tags', authenticate, requireFamilyMember, (req, res) => {
  const tags = db.prepare(`
    SELECT DISTINCT t.name FROM tags t
    JOIN recipe_tags rt ON rt.tag_id = t.id
    JOIN recipes r ON r.id = rt.recipe_id
    WHERE r.family_id = ?
    ORDER BY t.name
  `).all(req.params.fid);
  res.json(tags.map(t => t.name));
});

module.exports = router;
