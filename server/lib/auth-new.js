/**
 * Authentication Module (Firestore + JWT)
 * Handles user registration, login, and token validation
 */

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getUserByEmail, createUser, getUserById } = require('./firestore');

const SALT_ROUNDS = 12;
const JWT_SECRET = process.env.JWT_SECRET || 'REPLACE_IN_PRODUCTION_WITH_SECURE_SECRET';
const JWT_EXPIRY = '30d'; // 30 days

if (!process.env.JWT_SECRET) {
  console.warn('⚠️  JWT_SECRET not set - using default (INSECURE)');
}

/**
 * Register a new user
 * @param {string} email - User email
 * @param {string} password - Plain text password (will be hashed)
 * @param {string} name - User's name
 * @returns {Promise<{ok: boolean, user?: object, token?: string, error?: string}>}
 */
async function registerUser(email, password, name) {
  try {
    // Validate inputs
    if (!email || !password || !name) {
      return { ok: false, error: 'Email, password, and name are required' };
    }

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, error: 'Invalid email format' };
    }

    // Password strength (min 8 chars)
    if (password.length < 8) {
      return { ok: false, error: 'Password must be at least 8 characters' };
    }

    // Check if user already exists
    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      return { ok: false, error: 'Email already registered' };
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Create user record
    const userData = {
      email: email.toLowerCase(),
      name,
      passwordHash,
      plan: 'beta-free',
      notifications: {
        push: true,
        email: true,
        digest: 'weekly',
      },
    };

    const user = await createUser(userData);

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    // Return user without password hash
    const { passwordHash: _, ...userWithoutPassword } = user;

    return {
      ok: true,
      user: userWithoutPassword,
      token,
    };
  } catch (error) {
    console.error('Registration error:', error);
    return { ok: false, error: 'Registration failed' };
  }
}

/**
 * Login user
 * @param {string} email - User email
 * @param {string} password - Plain text password
 * @returns {Promise<{ok: boolean, user?: object, token?: string, error?: string}>}
 */
async function loginUser(email, password) {
  try {
    // Validate inputs
    if (!email || !password) {
      return { ok: false, error: 'Email and password are required' };
    }

    // Find user
    const user = await getUserByEmail(email);
    if (!user) {
      return { ok: false, error: 'Invalid email or password' };
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      return { ok: false, error: 'Invalid email or password' };
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    // Return user without password hash
    const { passwordHash: _, ...userWithoutPassword } = user;

    return {
      ok: true,
      user: userWithoutPassword,
      token,
    };
  } catch (error) {
    console.error('Login error:', error);
    return { ok: false, error: 'Login failed' };
  }
}

/**
 * Verify JWT token and return user
 * @param {string} token - JWT token
 * @returns {Promise<{ok: boolean, user?: object, error?: string}>}
 */
async function verifyToken(token) {
  try {
    if (!token) {
      return { ok: false, error: 'Token required' };
    }

    // Verify JWT
    const decoded = jwt.verify(token, JWT_SECRET);

    // Fetch user from database
    const user = await getUserById(decoded.userId);
    if (!user) {
      return { ok: false, error: 'User not found' };
    }

    // Return user without password hash
    const { passwordHash: _, ...userWithoutPassword } = user;

    return {
      ok: true,
      user: userWithoutPassword,
    };
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return { ok: false, error: 'Token expired' };
    }
    if (error.name === 'JsonWebTokenError') {
      return { ok: false, error: 'Invalid token' };
    }
    console.error('Token verification error:', error);
    return { ok: false, error: 'Token verification failed' };
  }
}

/**
 * Express middleware: Require authentication
 * Validates JWT from Authorization header and attaches user to req.user
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization token required' });
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  verifyToken(token)
    .then(result => {
      if (!result.ok) {
        return res.status(401).json({ error: result.error });
      }

      req.user = result.user;
      next();
    })
    .catch(error => {
      console.error('Auth middleware error:', error);
      res.status(500).json({ error: 'Authentication failed' });
    });
}

module.exports = {
  registerUser,
  loginUser,
  verifyToken,
  requireAuth,
};
