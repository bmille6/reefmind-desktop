/**
 * ReefMind Beta — Unified Cloud Run Server
 * Serves frontend + backend API + Apex simulator (demo mode)
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

// Check if we're in simulator-only mode (Electron app)
const SIMULATOR_MODE = process.env.REEFMIND_MODE === 'simulator';

// Backend modules (only load if NOT in simulator mode)
let registerUser, loginUser, requireAuth;
let getUserTanks, getTank, createTank, updateTank;
let getReadings, addReading, getEvents, addEvent, getAnalyses, addAnalysis;
let authenticateFusion, getFusionDevices, discoverApexConfig, syncApexReadings, encrypt;
let analyzeTank;

if (!SIMULATOR_MODE) {
  ({ registerUser, loginUser, requireAuth } = require('./lib/auth-new'));
  ({ 
    getUserTanks, 
    getTank, 
    createTank, 
    updateTank,
    getReadings,
    addReading,
    getEvents,
    addEvent,
    getAnalyses,
    addAnalysis,
  } = require('./lib/firestore'));
  ({
    authenticateFusion,
    getFusionDevices,
    discoverApexConfig,
    syncApexReadings,
    encrypt,
  } = require('./lib/apex-fusion'));
  ({ analyzeTank } = require('./lib/ai-new'));
} else {
  console.log('🔵 SIMULATOR MODE - Firestore and external APIs disabled');
}

const app = express();
const PORT = process.env.PORT || 8080;
const DEMO_MODE = SIMULATOR_MODE || process.env.DEMO_MODE === 'true' || !process.env.APEX_ENCRYPTION_KEY;

// ============================================================
// SECURITY & MIDDLEWARE
// ============================================================

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));
app.set('trust proxy', 1);

// Rate limiting
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Too many requests, please try again later' },
});
app.use('/api/', globalLimiter);

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Too many registration attempts' },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts' },
});

// Logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} - ${duration}ms`);
  });
  next();
});

// ============================================================
// APEX SIMULATOR (Demo Mode)
// ============================================================

const simulator = {
  tankState: {
    serial: 'AC5:SIM01',
    name: 'Simulated Reef',
    software: '5.12_SIM',
    
    probes: {
      pH: { value: 8.32, min: 8.15, max: 8.45, drift: 0.02 },
      Temp: { value: 77.8, min: 76.5, max: 79.5, drift: 0.3, unit: '°F' },
      ORP: { value: 325, min: 280, max: 380, drift: 5 },
      Cond: { value: 53.2, min: 52.0, max: 54.5, drift: 0.2, unit: 'mS' },
    },
    
    trident: {
      alk: { value: 8.1, target: 8.2, drift: 0.08, unit: 'dKH' },
      ca: { value: 438, target: 440, drift: 3, unit: 'mg/L' },
      mg: { value: 1350, target: 1380, drift: 8, unit: 'mg/L' },
    },
    
    outlets: [
      { id: '24_1', name: 'Captiv8', type: 'dos', rate: 25, unit: 'mL/day', product: 'Captiv8 MDS' },
      { id: '26_2', name: 'All4Reef', type: 'dos', rate: 180, unit: 'mL/day', product: 'All-For-Reef' },
      { id: '27_2', name: 'Kalk', type: 'dos', rate: 2400, unit: 'mL/day', product: 'Kalkwasser' },
    ],
  },
  
  jitter(value, amount) {
    return +(value + (Math.random() - 0.5) * 2 * amount).toFixed(2);
  },
  
  generateReading() {
    const s = this.tankState;
    return {
      source: 'trident',
      alk: this.jitter(s.trident.alk.value, s.trident.alk.drift),
      ca: this.jitter(s.trident.ca.value, s.trident.ca.drift),
      mg: this.jitter(s.trident.mg.value, s.trident.mg.drift),
      ph: this.jitter(s.probes.pH.value, s.probes.pH.drift),
      temp: this.jitter(s.probes.Temp.value, s.probes.Temp.drift),
      orp: this.jitter(s.probes.ORP.value, s.probes.ORP.drift),
      timestamp: new Date().toISOString(),
    };
  },
  
  getDiscoveryData() {
    const s = this.tankState;
    return {
      apex: {
        serial: s.serial,
        name: s.name,
        software: s.software,
      },
      probes: Object.entries(s.probes).map(([name, p]) => ({
        name,
        value: this.jitter(p.value, p.drift),
        unit: p.unit || ''
      })),
      trident: {
        installed: true,
        lastTest: new Date(Date.now() - 2 * 3600000).toISOString(),
        readings: {
          alk: { value: this.jitter(s.trident.alk.value, 0.05), unit: 'dKH' },
          ca: { value: this.jitter(s.trident.ca.value, 2), unit: 'mg/L' },
          mg: { value: this.jitter(s.trident.mg.value, 5), unit: 'mg/L' },
        }
      },
      outlets: s.outlets,
      equipment: [],
    };
  }
};

// ============================================================
// API ROUTES
// ============================================================

// Health check
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0-beta',
    service: 'ReefMind',
    demo_mode: DEMO_MODE,
  });
});

// ========== SIMULATOR MODE ROUTING ==========

if (SIMULATOR_MODE) {
  const simulatorRouter = require('./simulator-api');
  app.use('/api', simulatorRouter);
  
  // Auth bypass for simulator
  app.get('/api/auth/me', (req, res) => {
    res.json({ 
      user: { 
        id: 'sim-user-1', 
        email: 'demo@reefmind.app', 
        name: 'Demo User' 
      } 
    });
  });
  
  // Skip all other auth/tank routes below
  console.log('✅ Simulator API routes loaded');
} else {

// ========== AUTH ==========

app.post('/api/auth/register', registerLimiter, async (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, password, and name are required' });
  }

  const result = await registerUser(email, password, name);

  if (!result.ok) {
    return res.status(400).json({ error: result.error });
  }

  res.json({
    user: result.user,
    token: result.token,
  });
});

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const result = await loginUser(email, password);

  if (!result.ok) {
    return res.status(401).json({ error: result.error });
  }

  res.json({
    user: result.user,
    token: result.token,
  });
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

// ========== TANKS ==========

app.post('/api/tanks', requireAuth, async (req, res) => {
  const { name, volume, type } = req.body;

  if (!name || !volume) {
    return res.status(400).json({ error: 'Tank name and volume are required' });
  }

  try {
    const defaultTargets = {
      'sps-dominant': {
        alk: { min: 7.5, max: 9.0, unit: 'dKH' },
        ca: { min: 420, max: 450, unit: 'mg/L' },
        mg: { min: 1300, max: 1400, unit: 'mg/L' },
        pH: { min: 8.0, max: 8.5 },
        temp: { min: 76, max: 80, unit: '°F' },
      },
      'mixed-reef': {
        alk: { min: 7.0, max: 9.0, unit: 'dKH' },
        ca: { min: 400, max: 450, unit: 'mg/L' },
        mg: { min: 1280, max: 1400, unit: 'mg/L' },
        pH: { min: 8.0, max: 8.5 },
        temp: { min: 76, max: 80, unit: '°F' },
      },
      'lps-softies': {
        alk: { min: 7.0, max: 8.5, unit: 'dKH' },
        ca: { min: 380, max: 440, unit: 'mg/L' },
        mg: { min: 1280, max: 1380, unit: 'mg/L' },
        pH: { min: 7.8, max: 8.5 },
        temp: { min: 76, max: 80, unit: '°F' },
      },
    };

    const tankData = {
      name,
      volume,
      volumeLiters: Math.round(volume * 3.78541),
      type: type || 'mixed-reef',
      targets: defaultTargets[type] || defaultTargets['mixed-reef'],
      equipment: {
        probes: [],
        trident: false,
        ato: false,
        outlets: [],
      },
    };

    const tank = await createTank(req.user.id, tankData);

    res.json({ tank });
  } catch (error) {
    console.error('Create tank error:', error);
    res.status(500).json({ error: 'Failed to create tank' });
  }
});

app.get('/api/tanks', requireAuth, async (req, res) => {
  try {
    const tanks = await getUserTanks(req.user.id);
    res.json({ tanks });
  } catch (error) {
    console.error('List tanks error:', error);
    res.status(500).json({ error: 'Failed to fetch tanks' });
  }
});

app.get('/api/tanks/:tankId', requireAuth, async (req, res) => {
  try {
    const tank = await getTank(req.user.id, req.params.tankId);

    if (!tank) {
      return res.status(404).json({ error: 'Tank not found' });
    }

    res.json({ tank });
  } catch (error) {
    console.error('Get tank error:', error);
    res.status(500).json({ error: 'Failed to fetch tank' });
  }
});

app.put('/api/tanks/:tankId', requireAuth, async (req, res) => {
  const { targets, equipment, dosing } = req.body;

  try {
    const updates = {};
    if (targets) updates.targets = targets;
    if (equipment) updates.equipment = equipment;
    if (dosing) updates.dosing = dosing;

    await updateTank(req.user.id, req.params.tankId, updates);

    res.json({ success: true });
  } catch (error) {
    console.error('Update tank error:', error);
    res.status(500).json({ error: 'Failed to update tank' });
  }
});

// ========== APEX INTEGRATION (with simulator fallback) ==========

app.post('/api/tanks/:tankId/connect-apex', requireAuth, async (req, res) => {
  const { fusionEmail, fusionPassword } = req.body;

  if (DEMO_MODE) {
    // Demo mode: use simulator
    console.log('Demo mode: Using simulator data');
    const config = simulator.getDiscoveryData();
    
    await updateTank(req.user.id, req.params.tankId, {
      apexSerial: config.apex.serial,
      fusionId: 'demo',
      equipment: {
        probes: config.probes.map(p => p.name),
        trident: config.trident.installed,
        ato: false,
        outlets: config.outlets,
      },
      demoMode: true,
    });

    return res.json({
      success: true,
      config: config,
      demo: true,
    });
  }

  if (!fusionEmail || !fusionPassword) {
    return res.status(400).json({ error: 'Fusion email and password are required' });
  }

  try {
    const authResult = await authenticateFusion(fusionEmail, fusionPassword);
    if (!authResult.ok) {
      return res.status(401).json({ error: authResult.error });
    }

    const token = authResult.token;
    const devicesResult = await getFusionDevices(token);
    
    if (!devicesResult.ok || devicesResult.devices.length === 0) {
      return res.status(404).json({ error: 'No Apex devices found' });
    }

    const device = devicesResult.devices[0];
    const fusionId = device.id || device._id || device.did;

    const configResult = await discoverApexConfig(token, fusionId);
    if (!configResult.ok) {
      return res.status(500).json({ error: configResult.error });
    }

    const encryptedEmail = encrypt(fusionEmail);
    const encryptedToken = encrypt(token);

    await updateTank(req.user.id, req.params.tankId, {
      ...configResult.config,
      fusionCredentials: {
        email: encryptedEmail,
        token: encryptedToken,
        lastSync: new Date(),
      },
    });

    res.json({
      success: true,
      config: configResult.config,
    });
  } catch (error) {
    console.error('Connect Apex error:', error);
    res.status(500).json({ error: 'Failed to connect Apex' });
  }
});

app.get('/api/tanks/:tankId/sync', requireAuth, async (req, res) => {
  try {
    const tank = await getTank(req.user.id, req.params.tankId);

    if (!tank) {
      return res.status(404).json({ error: 'Tank not found' });
    }

    if (tank.demoMode || DEMO_MODE) {
      // Demo mode: generate simulator data
      const reading = simulator.generateReading();
      const stored = await addReading(req.user.id, req.params.tankId, reading);
      
      return res.json({
        success: true,
        reading: stored,
        demo: true,
      });
    }

    if (!tank.fusionCredentials || !tank.fusionCredentials.token) {
      return res.status(400).json({ error: 'Apex not connected' });
    }

    const token = tank.fusionCredentials.token;
    const fusionId = tank.fusionId;

    const syncResult = await syncApexReadings(token, fusionId);
    if (!syncResult.ok) {
      return res.status(500).json({ error: syncResult.error });
    }

    const reading = await addReading(req.user.id, req.params.tankId, syncResult.readings);

    res.json({
      success: true,
      reading,
    });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ error: 'Failed to sync data' });
  }
});

// ========== READINGS & EVENTS ==========

app.post('/api/tanks/:tankId/readings', requireAuth, async (req, res) => {
  const readingData = req.body;

  if (!readingData || Object.keys(readingData).length === 0) {
    return res.status(400).json({ error: 'Reading data required' });
  }

  try {
    const reading = await addReading(req.user.id, req.params.tankId, {
      ...readingData,
      source: readingData.source || 'manual',
    });

    res.json({ reading });
  } catch (error) {
    console.error('Add reading error:', error);
    res.status(500).json({ error: 'Failed to add reading' });
  }
});

app.get('/api/tanks/:tankId/readings', requireAuth, async (req, res) => {
  const days = parseInt(req.query.days) || 30;

  try {
    const readings = await getReadings(req.user.id, req.params.tankId, days);
    res.json({ readings });
  } catch (error) {
    console.error('Get readings error:', error);
    res.status(500).json({ error: 'Failed to fetch readings' });
  }
});

app.post('/api/tanks/:tankId/events', requireAuth, async (req, res) => {
  const { type, title, details, relatedParams } = req.body;

  if (!type || !title) {
    return res.status(400).json({ error: 'Event type and title are required' });
  }

  try {
    const event = await addEvent(req.user.id, req.params.tankId, {
      type,
      title,
      details: details || '',
      source: 'user-entered',
      relatedParams: relatedParams || [],
    });

    res.json({ event });
  } catch (error) {
    console.error('Add event error:', error);
    res.status(500).json({ error: 'Failed to log event' });
  }
});

app.get('/api/tanks/:tankId/events', requireAuth, async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;

  try {
    const events = await getEvents(req.user.id, req.params.tankId, limit);
    res.json({ events });
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// ========== AI ANALYSIS ==========

app.post('/api/tanks/:tankId/analyze', requireAuth, async (req, res) => {
  try {
    const tank = await getTank(req.user.id, req.params.tankId);

    if (!tank) {
      return res.status(404).json({ error: 'Tank not found' });
    }

    const recentReadings = await getReadings(req.user.id, req.params.tankId, 7);
    const recentEvents = await getEvents(req.user.id, req.params.tankId, 10);

    if (recentReadings.length === 0) {
      return res.status(400).json({ error: 'No readings available. Add readings first.' });
    }

    const currentReadings = recentReadings[0];

    const analysisResult = await analyzeTank(
      tank,
      currentReadings,
      recentReadings,
      recentEvents,
      tank.dosing || {}
    );

    if (!analysisResult.ok) {
      return res.status(500).json({ error: analysisResult.error });
    }

    const analysis = await addAnalysis(req.user.id, req.params.tankId, {
      type: 'user-requested',
      ...analysisResult.analysis,
      dataUsed: {
        readingCount: recentReadings.length,
        eventCount: recentEvents.length,
        daysAnalyzed: 7,
      },
    });

    res.json({ analysis });
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: 'AI analysis failed' });
  }
});

app.get('/api/tanks/:tankId/analyses', requireAuth, async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;

  try {
    const analyses = await getAnalyses(req.user.id, req.params.tankId, limit);
    res.json({ analyses });
  } catch (error) {
    console.error('Get analyses error:', error);
    res.status(500).json({ error: 'Failed to fetch analyses' });
  }
});

} // End of non-simulator mode

// ============================================================
// SERVE FRONTEND
// ============================================================

app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: 0,
  etag: true,
}));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================
// ERROR HANDLERS
// ============================================================

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, () => {
  console.log('');
  console.log('🐠 ═══════════════════════════════════════════');
  console.log('   ReefMind Beta');
  console.log('   ─────────────────────────────────────────');
  console.log(`   Port: ${PORT}`);
  console.log(`   Mode: ${DEMO_MODE ? 'DEMO (simulator)' : 'PRODUCTION'}`);
  console.log(`   Project: reefmind-ai-prod`);
  console.log(`   Frontend: /public`);
  console.log(`   API: /api/*`);
  console.log('   ─────────────────────────────────────────');
  console.log('   Auth: JWT + bcrypt');
  console.log('   Database: Firestore');
  console.log('   AI: Vertex AI (Gemini)');
  console.log('🐠 ═══════════════════════════════════════════');
  console.log('');
});
