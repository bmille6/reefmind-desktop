const { getDb } = require('./db');

// Search library with full-text search
function searchLibrary(query, limit = 10) {
  const db = getDb();
  
  // FTS5 match query with ranking
  const stmt = db.prepare(`
    SELECT 
      la.id,
      la.title,
      snippet(library_search, 1, '<mark>', '</mark>', '...', 32) as excerpt,
      la.source,
      la.topics,
      rank
    FROM library_search
    JOIN library_articles la ON library_search.rowid = la.id
    WHERE library_search MATCH ?
    ORDER BY rank
    LIMIT ?
  `);
  
  return stmt.all(query, limit);
}

// Get article by ID
function getArticle(id) {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM library_articles WHERE id = ?');
  return stmt.get(id);
}

// List all unique topics
function getTopics() {
  const db = getDb();
  const stmt = db.prepare('SELECT DISTINCT topics FROM library_articles ORDER BY topics');
  const rows = stmt.all();
  
  // Split comma-separated topics and flatten
  const topicSet = new Set();
  rows.forEach(row => {
    row.topics.split(',').forEach(topic => {
      topicSet.add(topic.trim());
    });
  });
  
  return Array.from(topicSet).sort();
}

// Search by topic (for AI context)
function searchByTopics(topics, limit = 20) {
  const db = getDb();
  
  // Build LIKE clauses for each topic
  const conditions = topics.map(() => 'topics LIKE ?').join(' OR ');
  const params = topics.map(t => `%${t}%`);
  
  const stmt = db.prepare(`
    SELECT id, title, content, source, topics
    FROM library_articles
    WHERE ${conditions}
    LIMIT ?
  `);
  
  return stmt.all(...params, limit);
}

// Add article to library
function addArticle(title, content, source, topics) {
  const db = getDb();
  const stmt = db.prepare('INSERT INTO library_articles (title, content, source, topics) VALUES (?, ?, ?, ?)');
  const result = stmt.run(title, content, source, topics);
  return result.lastInsertRowid;
}

// Get article count
function getArticleCount() {
  const db = getDb();
  const stmt = db.prepare('SELECT COUNT(*) as count FROM library_articles');
  return stmt.get().count;
}

module.exports = {
  searchLibrary,
  getArticle,
  getTopics,
  searchByTopics,
  addArticle,
  getArticleCount
};
