/**
 * Simulator API Endpoints
 * Standalone simulator mode for Electron app (no Firestore required)
 */

const express = require('express');
const router = express.Router();

// In-memory storage for simulator mode
const simulatorData = {
  tank: {
    id: 'sim-tank-1',
    name: 'Simulated Reef',
    volume: 240,
    volumeLiters: 908,
    type: 'mixed-reef',
    apexSerial: 'AC5:SIM01',
    demoMode: true,
    targets: {
      alk: { min: 7.0, max: 9.0, unit: 'dKH' },
      ca: { min: 400, max: 450, unit: 'mg/L' },
      mg: { min: 1280, max: 1400, unit: 'mg/L' },
      pH: { min: 8.0, max: 8.5 },
      temp: { min: 76, max: 80, unit: '°F' },
    },
    equipment: {
      probes: ['pH', 'Temp', 'ORP', 'Cond'],
      trident: true,
      ato: true,
      outlets: [
        { id: '24_1', name: 'Captiv8', type: 'dos', rate: 25, unit: 'mL/day', product: 'Captiv8 MDS' },
        { id: '26_2', name: 'All4Reef', type: 'dos', rate: 180, unit: 'mL/day', product: 'All-For-Reef' },
        { id: '27_2', name: 'Kalk', type: 'dos', rate: 2400, unit: 'mL/day', product: 'Kalkwasser' },
      ],
    },
  },
  readings: [],
  events: [],
  analyses: [],
};

// Simulator state
const simulator = {
  probes: {
    pH: { value: 8.32, drift: 0.02 },
    Temp: { value: 77.8, drift: 0.3 },
    ORP: { value: 325, drift: 5 },
    Cond: { value: 53.2, drift: 0.2 },
  },
  trident: {
    alk: { value: 8.1, drift: 0.08 },
    ca: { value: 438, drift: 3 },
    mg: { value: 1350, drift: 8 },
  },
  
  jitter(value, amount) {
    return +(value + (Math.random() - 0.5) * 2 * amount).toFixed(2);
  },
  
  generateReading() {
    return {
      id: `sim-reading-${Date.now()}`,
      source: 'trident',
      alk: this.jitter(this.trident.alk.value, this.trident.alk.drift),
      ca: this.jitter(this.trident.ca.value, this.trident.ca.drift),
      mg: this.jitter(this.trident.mg.value, this.trident.mg.drift),
      ph: this.jitter(this.probes.pH.value, this.probes.pH.drift),
      temp: this.jitter(this.probes.Temp.value, this.probes.Temp.drift),
      orp: this.jitter(this.probes.ORP.value, this.probes.ORP.drift),
      timestamp: new Date().toISOString(),
    };
  },
};

// Generate initial readings (30 days of data)
function initializeSimulatorData() {
  if (simulatorData.readings.length > 0) return; // Already initialized
  
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  
  for (let i = 30; i >= 0; i--) {
    const timestamp = new Date(now - (i * dayMs));
    
    // Create the alk crash story
    let alkValue = 8.2;
    let caValue = 440;
    let no3Value = 5;
    
    if (i <= 27 && i > 15) {
      // Days 5-15: Alk crashes
      alkValue = 8.2 - ((27 - i) / 12) * 0.8;
      caValue = 440 + ((27 - i) / 12) * 30;
      no3Value = 5 + ((27 - i) / 12) * 9;
    } else if (i <= 15 && i > 3) {
      // Days 15-27: Alk keeps falling
      alkValue = 7.4 - ((15 - i) / 12) * 0.4;
      caValue = 470 + ((15 - i) / 12) * 40;
      no3Value = 12 + ((15 - i) / 12) * 2;
    } else if (i <= 3) {
      // Days 27-30: Recovery
      alkValue = 7.0 + ((3 - i) / 3) * 0.9;
      caValue = 510 - ((3 - i) / 3) * 10;
      no3Value = 14 - ((3 - i) / 3) * 2;
    }
    
    simulatorData.readings.push({
      id: `sim-reading-${timestamp.getTime()}`,
      source: 'trident',
      alk: +(alkValue + (Math.random() - 0.5) * 0.16).toFixed(2),
      ca: Math.round(caValue + (Math.random() - 0.5) * 6),
      mg: Math.round(1350 + (Math.random() - 0.5) * 16),
      ph: +(8.25 + (Math.random() - 0.5) * 0.3).toFixed(2),
      temp: +(77.8 + (Math.random() - 0.5) * 1.2).toFixed(1),
      orp: Math.round(325 + (Math.random() - 0.5) * 20),
      timestamp: timestamp.toISOString(),
    });
  }
  
  // Add events
  simulatorData.events = [
    {
      id: 'sim-event-1',
      type: 'test',
      title: 'ICP Test Results',
      details: 'All parameters within range',
      date: new Date(now - 30 * dayMs).toISOString(),
      source: 'user-entered',
    },
    {
      id: 'sim-event-2',
      type: 'dosing',
      title: 'Started Ammonium + Urea Dosing',
      details: 'Testing for nitrate reduction',
      date: new Date(now - 27 * dayMs).toISOString(),
      source: 'user-entered',
    },
    {
      id: 'sim-event-3',
      type: 'maintenance',
      title: 'Dino Treatment Started',
      details: 'UV sterilizer + blackout period',
      date: new Date(now - 24 * dayMs).toISOString(),
      source: 'user-entered',
    },
    {
      id: 'sim-event-4',
      type: 'dosing',
      title: 'A4R Reduced 210→160 mL/day',
      details: 'Calcium too high',
      date: new Date(now - 15 * dayMs).toISOString(),
      source: 'user-entered',
    },
    {
      id: 'sim-event-5',
      type: 'dosing',
      title: 'Ammonium Pump Stopped',
      details: 'Suspected cause of alk crash',
      date: new Date(now - 3 * dayMs).toISOString(),
      source: 'user-entered',
    },
    {
      id: 'sim-event-6',
      type: 'dosing',
      title: 'A4R Increased to 180 mL/day',
      details: 'Correcting alk drop',
      date: new Date(now - 3 * dayMs).toISOString(),
      source: 'user-entered',
    },
  ];
}

// Routes

router.get('/tanks', (req, res) => {
  initializeSimulatorData();
  res.json({ tanks: [simulatorData.tank] });
});

router.get('/tanks/:tankId', (req, res) => {
  initializeSimulatorData();
  res.json({ tank: simulatorData.tank });
});

router.get('/tanks/:tankId/readings', (req, res) => {
  initializeSimulatorData();
  const days = parseInt(req.query.days) || 30;
  const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
  
  const filtered = simulatorData.readings.filter(r => 
    new Date(r.timestamp).getTime() >= cutoff
  ).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  res.json({ readings: filtered });
});

router.post('/tanks/:tankId/readings', (req, res) => {
  const reading = simulator.generateReading();
  simulatorData.readings.unshift(reading);
  res.json({ reading });
});

router.get('/tanks/:tankId/events', (req, res) => {
  initializeSimulatorData();
  res.json({ events: simulatorData.events });
});

router.post('/tanks/:tankId/events', (req, res) => {
  const { type, title, details } = req.body;
  const event = {
    id: `sim-event-${Date.now()}`,
    type,
    title,
    details: details || '',
    date: new Date().toISOString(),
    source: 'user-entered',
  };
  simulatorData.events.unshift(event);
  res.json({ event });
});

router.get('/tanks/:tankId/sync', (req, res) => {
  const reading = simulator.generateReading();
  simulatorData.readings.unshift(reading);
  res.json({ success: true, reading, demo: true });
});

router.post('/tanks/:tankId/analyze', (req, res) => {
  // Mock AI analysis
  res.json({
    analysis: {
      id: `sim-analysis-${Date.now()}`,
      type: 'user-requested',
      date: new Date().toISOString(),
      diagnosis: 'Alkalinity crash likely caused by nitrification from urea/ammonium dosing consuming alk. Calcium elevated due to reduced All-For-Reef dosing.',
      confidence: 95,
      severity: 'high',
      recommendations: [
        'Stop ammonium dosing immediately',
        'Increase All-For-Reef to 180-200 mL/day to restore alk',
        'Monitor alk every 12 hours for next 48 hours',
        'Once alk stabilizes above 7.5, resume normal dosing schedule',
      ],
      citations: [
        {
          source: 'Randy Holmes-Farley',
          text: 'Nitrification consumes alkalinity at a rate of ~7 dKH per 1 ppm ammonia converted',
          relevance: 'Explains the mechanism of alkalinity consumption from urea dosing',
        },
      ],
    },
  });
});

module.exports = router;
