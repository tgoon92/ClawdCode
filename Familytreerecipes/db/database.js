const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'familytree.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Migration: expand relationship type constraint for existing databases
const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='relationships'").get();
if (tableInfo && !tableInfo.sql.includes('ex_spouse_of')) {
  db.exec(`
    CREATE TABLE relationships_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
      from_member_id INTEGER NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
      to_member_id INTEGER NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('parent_of', 'spouse_of', 'sibling_of', 'step_sibling_of', 'half_sibling_of', 'ex_spouse_of')),
      UNIQUE(family_id, from_member_id, to_member_id, type)
    );
    INSERT INTO relationships_new SELECT * FROM relationships;
    DROP TABLE relationships;
    ALTER TABLE relationships_new RENAME TO relationships;
  `);
}

// Migration: add profile_picture column to family_members
const fmCols = db.prepare("PRAGMA table_info(family_members)").all().map(c => c.name);
if (!fmCols.includes('profile_picture')) {
  db.exec('ALTER TABLE family_members ADD COLUMN profile_picture TEXT');
}

// Migration: add attributed_member_id column to recipes
const recipeCols = db.prepare("PRAGMA table_info(recipes)").all().map(c => c.name);
if (!recipeCols.includes('attributed_member_id')) {
  db.exec('ALTER TABLE recipes ADD COLUMN attributed_member_id INTEGER REFERENCES family_members(id)');
}

module.exports = db;
