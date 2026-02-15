const crypto = require('crypto');
const { getDb } = require('./db');

// Generate secure API key
function generateApiKey() {
  return 'rm_' + crypto.randomBytes(32).toString('hex');
}

// Register new user (beta - free access)
function registerUser(email, name) {
  const db = getDb();
  const apiKey = generateApiKey();

  try {
    const stmt = db.prepare('INSERT INTO users (email, name, api_key) VALUES (?, ?, ?)');
    const result = stmt.run(email, name, apiKey);
    
    return {
      ok: true,
      userId: result.lastInsertRowid,
      apiKey,
      email,
      name
    };
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return { ok: false, error: 'Email already registered' };
    }
    console.error('Registration error:', error);
    return { ok: false, error: 'Registration failed' };
  }
}

// Validate API key and return user info
function validateApiKey(apiKey) {
  if (!apiKey || !apiKey.startsWith('rm_')) {
    return null;
  }

  const db = getDb();
  const stmt = db.prepare('SELECT id, email, name, daily_analyses, last_analysis_date FROM users WHERE api_key = ?');
  return stmt.get(apiKey);
}

// Check and update daily rate limit
function checkRateLimit(userId, limit = 10) {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];
  
  const user = db.prepare('SELECT daily_analyses, last_analysis_date FROM users WHERE id = ?').get(userId);
  
  if (!user) return { allowed: false, remaining: 0 };
  
  // Reset counter if it's a new day
  if (user.last_analysis_date !== today) {
    db.prepare('UPDATE users SET daily_analyses = 0, last_analysis_date = ? WHERE id = ?').run(today, userId);
    return { allowed: true, remaining: limit - 1 };
  }
  
  // Check if under limit
  if (user.daily_analyses >= limit) {
    return { allowed: false, remaining: 0 };
  }
  
  return { allowed: true, remaining: limit - user.daily_analyses - 1 };
}

// Increment analysis counter
function incrementAnalysisCount(userId) {
  const db = getDb();
  db.prepare('UPDATE users SET daily_analyses = daily_analyses + 1 WHERE id = ?').run(userId);
}

// Record analysis in history
function recordAnalysis(userId, params, analysis) {
  const db = getDb();
  const stmt = db.prepare('INSERT INTO analysis_history (user_id, params, analysis) VALUES (?, ?, ?)');
  stmt.run(userId, JSON.stringify(params), JSON.stringify(analysis));
}

module.exports = {
  generateApiKey,
  registerUser,
  validateApiKey,
  checkRateLimit,
  incrementAnalysisCount,
  recordAnalysis
};
