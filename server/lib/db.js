const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/reefmind.db');

// Initialize database with schema
function initDatabase() {
  // Ensure data directory exists
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Users table (simple API key auth)
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      api_key TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      daily_analyses INTEGER DEFAULT 0,
      last_analysis_date DATE
    )
  `);

  // Reef library articles (indexed content)
  db.exec(`
    CREATE TABLE IF NOT EXISTS library_articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      source TEXT NOT NULL,
      topics TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // FTS5 full-text search index
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS library_search USING fts5(
      title,
      content,
      source,
      topics,
      content='library_articles',
      content_rowid='id'
    )
  `);

  // Triggers to keep FTS index in sync
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS library_ai AFTER INSERT ON library_articles BEGIN
      INSERT INTO library_search(rowid, title, content, source, topics)
      VALUES (new.id, new.title, new.content, new.source, new.topics);
    END
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS library_ad AFTER DELETE ON library_articles BEGIN
      INSERT INTO library_search(library_search, rowid, title, content, source, topics)
      VALUES('delete', old.id, old.title, old.content, old.source, old.topics);
    END
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS library_au AFTER UPDATE ON library_articles BEGIN
      INSERT INTO library_search(library_search, rowid, title, content, source, topics)
      VALUES('delete', old.id, old.title, old.content, old.source, old.topics);
      INSERT INTO library_search(rowid, title, content, source, topics)
      VALUES (new.id, new.title, new.content, new.source, new.topics);
    END
  `);

  // Analysis history (for rate limiting and tracking)
  db.exec(`
    CREATE TABLE IF NOT EXISTS analysis_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      params TEXT NOT NULL,
      analysis TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  console.log('✓ Database initialized:', DB_PATH);
  return db;
}

// Get database instance (singleton pattern)
let dbInstance = null;
function getDb() {
  if (!dbInstance) {
    dbInstance = initDatabase();
  }
  return dbInstance;
}

module.exports = {
  getDb,
  initDatabase
};
