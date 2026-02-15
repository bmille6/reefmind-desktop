/**
 * Firestore Database Client
 * Manages all database operations for ReefMind Beta
 */

const { Firestore } = require('@google-cloud/firestore');

const PROJECT_ID = process.env.GCP_PROJECT || 'reefmind-ai-prod';

let firestoreInstance = null;

// Initialize Firestore
function initFirestore() {
  if (firestoreInstance) {
    return firestoreInstance;
  }

  try {
    // On Cloud Run, use Application Default Credentials (no key file needed)
    // Locally, use GOOGLE_APPLICATION_CREDENTIALS env var if set
    const config = { projectId: PROJECT_ID };
    
    // Only add keyFilename if running locally with a key file
    if (process.env.NODE_ENV !== 'production' && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      config.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    }

    firestoreInstance = new Firestore(config);

    console.log('✓ Firestore initialized:', PROJECT_ID);
    return firestoreInstance;
  } catch (error) {
    console.error('✗ Firestore initialization failed:', error.message);
    throw error;
  }
}

// Get Firestore instance (singleton)
function getFirestore() {
  if (!firestoreInstance) {
    return initFirestore();
  }
  return firestoreInstance;
}

// Collections
const COLLECTIONS = {
  USERS: 'users',
  TANKS: 'tanks',
  READINGS: 'readings',
  EVENTS: 'events',
  ANALYSES: 'analyses',
};

// Helper: Get user by email
async function getUserByEmail(email) {
  try {
    const db = getFirestore();
    const snapshot = await db.collection(COLLECTIONS.USERS)
      .where('email', '==', email.toLowerCase())
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  } catch (error) {
    // If index doesn't exist yet, try scanning all users (slow but works)
    console.warn('Query failed, falling back to scan:', error.message);
    const db = getFirestore();
    const snapshot = await db.collection(COLLECTIONS.USERS).get();
    
    for (const doc of snapshot.docs) {
      const data = doc.data();
      if (data.email === email.toLowerCase()) {
        return { id: doc.id, ...data };
      }
    }
    
    return null;
  }
}

// Helper: Get user by ID
async function getUserById(userId) {
  const db = getFirestore();
  const doc = await db.collection(COLLECTIONS.USERS).doc(userId).get();

  if (!doc.exists) {
    return null;
  }

  return { id: doc.id, ...doc.data() };
}

// Helper: Create user
async function createUser(userData) {
  const db = getFirestore();
  const userRef = db.collection(COLLECTIONS.USERS).doc();

  await userRef.set({
    ...userData,
    createdAt: Firestore.Timestamp.now(),
  });

  return { id: userRef.id, ...userData };
}

// Helper: Get user's tanks
async function getUserTanks(userId) {
  const db = getFirestore();
  const snapshot = await db.collection(COLLECTIONS.USERS)
    .doc(userId)
    .collection(COLLECTIONS.TANKS)
    .orderBy('createdAt', 'desc')
    .get();

  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// Helper: Get tank by ID
async function getTank(userId, tankId) {
  const db = getFirestore();
  const doc = await db.collection(COLLECTIONS.USERS)
    .doc(userId)
    .collection(COLLECTIONS.TANKS)
    .doc(tankId)
    .get();

  if (!doc.exists) {
    return null;
  }

  return { id: doc.id, ...doc.data() };
}

// Helper: Create tank
async function createTank(userId, tankData) {
  const db = getFirestore();
  const tankRef = db.collection(COLLECTIONS.USERS)
    .doc(userId)
    .collection(COLLECTIONS.TANKS)
    .doc();

  await tankRef.set({
    ...tankData,
    createdAt: Firestore.Timestamp.now(),
  });

  return { id: tankRef.id, ...tankData };
}

// Helper: Update tank
async function updateTank(userId, tankId, updates) {
  const db = getFirestore();
  const tankRef = db.collection(COLLECTIONS.USERS)
    .doc(userId)
    .collection(COLLECTIONS.TANKS)
    .doc(tankId);

  await tankRef.update({
    ...updates,
    updatedAt: Firestore.Timestamp.now(),
  });

  return { id: tankId, ...updates };
}

// Helper: Get readings (with time range)
async function getReadings(userId, tankId, daysBack = 30) {
  const db = getFirestore();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);

  const snapshot = await db.collection(COLLECTIONS.USERS)
    .doc(userId)
    .collection(COLLECTIONS.TANKS)
    .doc(tankId)
    .collection(COLLECTIONS.READINGS)
    .where('timestamp', '>=', Firestore.Timestamp.fromDate(cutoffDate))
    .orderBy('timestamp', 'desc')
    .get();

  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// Helper: Add reading
async function addReading(userId, tankId, readingData) {
  const db = getFirestore();
  const readingRef = db.collection(COLLECTIONS.USERS)
    .doc(userId)
    .collection(COLLECTIONS.TANKS)
    .doc(tankId)
    .collection(COLLECTIONS.READINGS)
    .doc();

  await readingRef.set({
    ...readingData,
    timestamp: readingData.timestamp || Firestore.Timestamp.now(),
  });

  return { id: readingRef.id, ...readingData };
}

// Helper: Get events
async function getEvents(userId, tankId, limit = 50) {
  const db = getFirestore();
  const snapshot = await db.collection(COLLECTIONS.USERS)
    .doc(userId)
    .collection(COLLECTIONS.TANKS)
    .doc(tankId)
    .collection(COLLECTIONS.EVENTS)
    .orderBy('date', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// Helper: Add event
async function addEvent(userId, tankId, eventData) {
  const db = getFirestore();
  const eventRef = db.collection(COLLECTIONS.USERS)
    .doc(userId)
    .collection(COLLECTIONS.TANKS)
    .doc(tankId)
    .collection(COLLECTIONS.EVENTS)
    .doc();

  await eventRef.set({
    ...eventData,
    date: eventData.date || Firestore.Timestamp.now(),
  });

  return { id: eventRef.id, ...eventData };
}

// Helper: Get analyses
async function getAnalyses(userId, tankId, limit = 10) {
  const db = getFirestore();
  const snapshot = await db.collection(COLLECTIONS.USERS)
    .doc(userId)
    .collection(COLLECTIONS.TANKS)
    .doc(tankId)
    .collection(COLLECTIONS.ANALYSES)
    .orderBy('date', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// Helper: Add analysis
async function addAnalysis(userId, tankId, analysisData) {
  const db = getFirestore();
  const analysisRef = db.collection(COLLECTIONS.USERS)
    .doc(userId)
    .collection(COLLECTIONS.TANKS)
    .doc(tankId)
    .collection(COLLECTIONS.ANALYSES)
    .doc();

  await analysisRef.set({
    ...analysisData,
    date: analysisData.date || Firestore.Timestamp.now(),
  });

  return { id: analysisRef.id, ...analysisData };
}

module.exports = {
  initFirestore,
  getFirestore,
  COLLECTIONS,
  // User operations
  getUserByEmail,
  getUserById,
  createUser,
  // Tank operations
  getUserTanks,
  getTank,
  createTank,
  updateTank,
  // Readings
  getReadings,
  addReading,
  // Events
  getEvents,
  addEvent,
  // Analyses
  getAnalyses,
  addAnalysis,
};
