/**
 * Apex Simulator — Fake Neptune Apex for ReefMind development/testing
 * 
 * Simulates:
 * - Apex Fusion API auth
 * - Auto-discovery (probes, outlets, Trident)
 * - Live probe readings (pH, Temp, ORP, Conductivity)
 * - Trident readings (Alk, Ca, Mg) every 4 hours
 * - Dosing pump outlet configs
 * - Realistic data with noise/variation
 * 
 * Usage: node apex-simulator.js
 * Runs on port 3001
 */

const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// ============================================================
// SIMULATED TANK STATE
// ============================================================

const tankState = {
  serial: 'AC5:SIM01',
  name: 'Simulated Reef',
  software: '5.12_SIM',
  
  // Probes (update every call with slight variation)
  probes: {
    pH: { value: 8.32, min: 8.15, max: 8.45, drift: 0.02 },
    Temp: { value: 77.8, min: 76.5, max: 79.5, drift: 0.3, unit: '°F' },
    ORP: { value: 325, min: 280, max: 380, drift: 5 },
    Cond: { value: 53.2, min: 52.0, max: 54.5, drift: 0.2, unit: 'mS' },
  },
  
  // Trident readings (simulate every 4 hours)
  trident: {
    alk: { value: 8.1, target: 8.2, drift: 0.08, unit: 'dKH' },
    ca: { value: 438, target: 440, drift: 3, unit: 'mg/L' },
    mg: { value: 1350, target: 1380, drift: 8, unit: 'mg/L' },
  },
  
  // Dosing outlets
  outlets: [
    { id: '24_1', name: 'Capiv8', type: 'dos', rate: 25, unit: 'mL/day', product: 'Captiv8 MDS' },
    { id: '24_2', name: 'Vodka', type: 'dos', rate: 0, unit: 'mL/day', product: 'Vodka (carbon dosing)' },
    { id: '26_1', name: 'Strontium', type: 'dos', rate: 20, unit: 'mL/day', product: 'Strontium supplement' },
    { id: '26_2', name: 'All4Reef', type: 'dos', rate: 180, unit: 'mL/day', product: 'All-For-Reef' },
    { id: '27_1', name: 'Ammonium', type: 'dos', rate: 0, unit: 'mL/day', product: 'Ammonium bicarbonate' },
    { id: '27_2', name: 'Kalk', type: 'dos', rate: 2400, unit: 'mL/day', product: 'Kalkwasser' },
  ],
  
  // Other equipment
  equipment: [
    { id: '3_1', name: 'Return', type: 'pump', state: 'ON' },
    { id: '3_6', name: 'Skimmer', type: 'pump', state: 'ON' },
    { id: '3_8', name: 'ATO', type: 'ato', state: 'ON' },
    { id: '5_1', name: 'Radion_L', type: 'light', state: 'ON' },
    { id: '5_2', name: 'Radion_R', type: 'light', state: 'ON' },
    { id: '7_7', name: 'KalkStirrer', type: 'pump', state: 'ON' },
  ]
};

// Generate realistic noise
function jitter(value, amount) {
  return +(value + (Math.random() - 0.5) * 2 * amount).toFixed(2);
}

// Generate time-series data for the last N days
function generateReadings(days = 30) {
  const readings = [];
  const now = Date.now();
  const msPerDay = 86400000;
  
  // Base values with a story: alk was stable, dipped, recovering
  for (let d = days; d >= 0; d--) {
    const dayTime = now - d * msPerDay;
    
    // Alk story: stable at 8.2, drops after day 20, recovering after day 27
    let alkBase;
    if (d > 20) alkBase = 8.2;
    else if (d > 10) alkBase = 8.2 - (20 - d) * 0.08;  // dropping
    else alkBase = 7.4 + (10 - d) * 0.06;  // recovering
    
    // Ca story: rises slightly as alk drops, then stabilizes
    let caBase;
    if (d > 20) caBase = 440;
    else if (d > 10) caBase = 440 + (20 - d) * 3;
    else caBase = 470 - (10 - d) * 2;
    
    // 6 readings per day (Trident)
    for (let r = 0; r < 6; r++) {
      const time = new Date(dayTime + r * 4 * 3600000);
      readings.push({
        timestamp: time.toISOString(),
        source: 'trident',
        alk: jitter(alkBase, 0.08),
        ca: jitter(caBase, 2),
        mg: jitter(1350, 5),
        ph: jitter(8.32 + Math.sin(r * Math.PI / 3) * 0.12, 0.02),  // daily pH cycle
        temp: jitter(77.8, 0.3),
        no3: jitter(d > 15 ? 5 : 5 + (15 - d) * 0.6, 0.3),
        po4: jitter(d > 15 ? 0.04 : 0.04 + (15 - d) * 0.005, 0.005),
      });
    }
  }
  return readings;
}

// Generate events that tell a story
function generateEvents() {
  const now = new Date();
  return [
    {
      id: 'evt-1',
      type: 'dosing-change',
      date: new Date(now - 25 * 86400000).toISOString(),
      title: 'Started ammonium dosing',
      details: 'Added ammonium bicarbonate + urea mix, 30 mL/day via pump 27_1',
      source: 'user-entered'
    },
    {
      id: 'evt-2',
      type: 'treatment',
      date: new Date(now - 22 * 86400000).toISOString(),
      title: 'Dino treatment started',
      details: 'Macrobacter7 10mL daily + Nitribiotic 9mL initial dose',
      source: 'user-entered'
    },
    {
      id: 'evt-3',
      type: 'dosing-change',
      date: new Date(now - 18 * 86400000).toISOString(),
      title: 'Reduced All4Reef 210→160 mL/day',
      details: 'Calcium too high at 510 mg/L, cutting A4R to bring down',
      source: 'auto-detected'
    },
    {
      id: 'evt-4',
      type: 'dosing-change',
      date: new Date(now - 3 * 86400000).toISOString(),
      title: 'Stopped ammonium pump',
      details: 'Diagnostic test — alk was crashing, suspected nitrification consuming alk',
      source: 'user-entered'
    },
    {
      id: 'evt-5',
      type: 'dosing-change',
      date: new Date(now - 3 * 86400000).toISOString(),
      title: 'Increased All4Reef to 180 mL/day',
      details: 'Split difference between 160 (insufficient) and 210 (drove Ca too high)',
      source: 'user-entered'
    },
    {
      id: 'evt-6',
      type: 'icp-result',
      date: new Date(now - 30 * 86400000).toISOString(),
      title: 'ICP Test uploaded (Oceamo)',
      details: 'Ca: 458, Alk: 8.2, Mg: 1350 — all in range. Strontium slightly low.',
      source: 'user-entered'
    }
  ];
}

// Pre-generate data
const allReadings = generateReadings(30);
const allEvents = generateEvents();

// ============================================================
// SIMULATED FUSION API
// ============================================================

// Fusion auth (fake)
app.post('/api/fusion/auth', (req, res) => {
  const { email, password } = req.body;
  
  // Accept any credentials for simulation
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  
  console.log(`🔐 Fusion auth: ${email} (simulated — always succeeds)`);
  
  res.json({
    token: 'sim-fusion-token-' + Date.now(),
    userId: 'sim-user-001',
    email: email
  });
});

// Auto-discovery
app.get('/api/fusion/discover', (req, res) => {
  console.log('🔍 Auto-discovery requested');
  
  res.json({
    apex: {
      serial: tankState.serial,
      name: tankState.name,
      software: tankState.software,
    },
    probes: Object.entries(tankState.probes).map(([name, p]) => ({
      name,
      value: jitter(p.value, p.drift),
      unit: p.unit || ''
    })),
    trident: {
      installed: true,
      lastTest: new Date(Date.now() - 2 * 3600000).toISOString(),
      readings: {
        alk: { value: jitter(tankState.trident.alk.value, 0.05), unit: 'dKH' },
        ca: { value: jitter(tankState.trident.ca.value, 2), unit: 'mg/L' },
        mg: { value: jitter(tankState.trident.mg.value, 5), unit: 'mg/L' },
      }
    },
    outlets: tankState.outlets.map(o => ({
      id: o.id,
      name: o.name,
      type: o.type,
      state: o.rate > 0 ? 'ON' : 'OFF',
      rate: o.rate,
      unit: o.unit
    })),
    equipment: tankState.equipment
  });
});

// Current status (like /rest/status)
app.get('/api/fusion/status', (req, res) => {
  res.json({
    serial: tankState.serial,
    name: tankState.name,
    probes: Object.entries(tankState.probes).map(([name, p]) => ({
      name,
      value: jitter(p.value, p.drift),
      unit: p.unit || ''
    })),
    trident: {
      alk: jitter(tankState.trident.alk.value, 0.05),
      ca: jitter(tankState.trident.ca.value, 2),
      mg: jitter(tankState.trident.mg.value, 5),
    },
    timestamp: new Date().toISOString()
  });
});

// Historical readings
app.get('/api/fusion/readings', (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const cutoff = Date.now() - days * 86400000;
  const filtered = allReadings.filter(r => new Date(r.timestamp).getTime() > cutoff);
  
  res.json({
    count: filtered.length,
    readings: filtered
  });
});

// ============================================================
// HEALTH CHECK
// ============================================================

app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    mode: 'simulator',
    tank: tankState.name,
    serial: tankState.serial,
    probes: Object.keys(tankState.probes).length,
    outlets: tankState.outlets.length,
    readings: allReadings.length,
    events: allEvents.length
  });
});

// Events endpoint
app.get('/api/fusion/events', (req, res) => {
  res.json({ events: allEvents });
});

// ============================================================
// START
// ============================================================

app.listen(PORT, () => {
  console.log('');
  console.log('🐠 ═══════════════════════════════════════════');
  console.log('   ReefMind Apex Simulator');
  console.log('   ─────────────────────────────────────────');
  console.log(`   Tank: ${tankState.name}`);
  console.log(`   Serial: ${tankState.serial}`);
  console.log(`   Probes: pH, Temp, ORP, Conductivity`);
  console.log(`   Trident: Alk, Ca, Mg (6 tests/day)`);
  console.log(`   Dosing: ${tankState.outlets.length} pumps configured`);
  console.log(`   Readings: ${allReadings.length} data points (30 days)`);
  console.log(`   Events: ${allEvents.length} logged events`);
  console.log('   ─────────────────────────────────────────');
  console.log(`   Running on http://localhost:${PORT}`);
  console.log('');
  console.log('   Endpoints:');
  console.log('   POST /api/fusion/auth     — Fake Fusion login');
  console.log('   GET  /api/fusion/discover  — Auto-discovery');
  console.log('   GET  /api/fusion/status    — Live probe data');
  console.log('   GET  /api/fusion/readings  — Historical data');
  console.log('   GET  /api/fusion/events    — Tank events');
  console.log('   GET  /api/status           — Health check');
  console.log('');
  console.log('   Any Fusion credentials will be accepted.');
  console.log('   Data simulates a real alk crash + recovery.');
  console.log('🐠 ═══════════════════════════════════════════');
  console.log('');
});
