/**
 * AI Analysis Module (Vertex AI + Gemini)
 * Analyzes tank parameters and provides recommendations
 */

const { VertexAI } = require('@google-cloud/vertexai');
const path = require('path');

const PROJECT_ID = process.env.GCP_PROJECT || 'reefmind-ai-prod';
const LOCATION = 'us-central1'; // More models available in us-central1
const MODEL = 'gemini-1.5-flash-002'; // Stable, versioned model

let vertexAI = null;

// Initialize Vertex AI
function initVertexAI() {
  if (vertexAI) {
    return vertexAI;
  }

  try {
    // On Cloud Run, use Application Default Credentials (no key file needed)
    // Locally, use service account key if provided
    const config = {
      project: PROJECT_ID,
      location: LOCATION,
    };

    // Only add googleAuthOptions if running locally with a key file
    if (process.env.NODE_ENV !== 'production' && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      config.googleAuthOptions = {
        keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      };
    }

    vertexAI = new VertexAI(config);

    console.log('✓ Vertex AI initialized:', MODEL, '(project:', PROJECT_ID, ')');
    return vertexAI;
  } catch (error) {
    console.error('✗ Vertex AI initialization failed:', error.message);
    throw error;
  }
}

// Parameter ranges for assessment
const PARAM_RANGES = {
  pH: { optimal: [8.0, 8.3], watch: [7.8, 8.5], critical: [7.6, 8.7], unit: '' },
  temp: { optimal: [76, 79], watch: [75, 80], critical: [73, 82], unit: '°F' },
  alk: { optimal: [7.5, 9.0], watch: [7.0, 10.0], critical: [6.0, 12.0], unit: 'dKH' },
  ca: { optimal: [400, 450], watch: [380, 480], critical: [350, 520], unit: 'mg/L' },
  mg: { optimal: [1300, 1400], watch: [1250, 1450], critical: [1200, 1500], unit: 'mg/L' },
  no3: { optimal: [2, 10], watch: [1, 15], critical: [0, 25], unit: 'ppm' },
  po4: { optimal: [0.03, 0.1], watch: [0.02, 0.15], critical: [0, 0.3], unit: 'ppm' },
  orp: { optimal: [300, 400], watch: [250, 420], critical: [200, 450], unit: 'mV' },
  salinity: { optimal: [1.025, 1.026], watch: [1.024, 1.027], critical: [1.020, 1.030], unit: 'sg' },
};

// Assess parameter status
function assessParameter(param, value) {
  const ranges = PARAM_RANGES[param];
  if (!ranges) return 'unknown';

  if (value >= ranges.optimal[0] && value <= ranges.optimal[1]) return 'optimal';
  if (value >= ranges.watch[0] && value <= ranges.watch[1]) return 'watch';
  if (value >= ranges.critical[0] && value <= ranges.critical[1]) return 'critical';
  return 'danger';
}

// Build system prompt for AI
function buildSystemPrompt(tankProfile) {
  const tankType = tankProfile.type || 'mixed-reef';
  const tankVolume = tankProfile.volume || 'unknown';

  return `You are an expert reef aquarium advisor analyzing a ${tankType} tank (${tankVolume} gallons).

## Your Expertise
- Randy Holmes-Farley's reef chemistry research
- Optimal parameter ranges for SPS, LPS, softies, and mixed reefs
- Chemical interactions (N:P ratio, Mg:Ca ratio, alkalinity consumption)
- Trend analysis and early problem detection
- Specific, actionable troubleshooting

## Parameter Ranges (Based on Tank Type)
${Object.entries(PARAM_RANGES).map(([param, ranges]) =>
  `- ${param.toUpperCase()}: Optimal ${ranges.optimal[0]}-${ranges.optimal[1]}${ranges.unit}, Watch ${ranges.watch[0]}-${ranges.watch[1]}${ranges.unit}, Critical ${ranges.critical[0]}-${ranges.critical[1]}${ranges.unit}`
).join('\n')}

## Tank Type: ${tankType}
${tankType === 'sps-dominant' ? '- SPS corals are highly sensitive to alkalinity swings and nutrient depletion\n- Target stability over perfection\n- Watch for daily alk consumption rates' : ''}
${tankType === 'mixed-reef' ? '- Balance between SPS and softies — aim for middle ground\n- Moderate nutrient levels (NO3 5-10, PO4 0.05-0.10)\n- Watch for coral warfare (chemical competition)' : ''}
${tankType === 'lps-softies' ? '- More forgiving of parameter swings\n- Higher nutrient tolerance\n- Focus on flow and feeding over perfect chemistry' : ''}

## Your Response Format
Return a JSON object with this structure:
{
  "summary": "One-sentence overall assessment",
  "healthScore": 8.5,  // 0-10 scale
  "diagnosis": {
    "primary": "Main issue or success",
    "contributing": ["Factor 1", "Factor 2"]
  },
  "parameters": {
    "alk": { "status": "optimal", "trend": "stable", "note": "..." },
    "ca": { "status": "watch", "trend": "rising", "note": "..." }
  },
  "recommendations": [
    { "action": "Specific action to take", "priority": "high", "why": "Explanation" },
    { "action": "Another action", "priority": "medium", "why": "..." }
  ],
  "confidence": 0.95  // 0-1 scale
}

## Response Rules
- Be SPECIFIC: "Reduce All4Reef to 160 mL/day" NOT "reduce dosing"
- Use FRIENDLY LANGUAGE: "Your alk dropped because..." NOT "Precipitation event detected"
- FLAG TRENDS EARLY: Don't wait for parameters to hit critical
- If everything is good, SAY SO — don't create problems
- Confidence drops if data is sparse or contradictory`;
}

// Build analysis prompt
function buildAnalysisPrompt(currentReadings, recentReadings, events, dosingConfig) {
  let prompt = `## Current Parameters\n`;
  Object.entries(currentReadings).forEach(([param, value]) => {
    const status = assessParameter(param, value);
    const ranges = PARAM_RANGES[param];
    prompt += `- ${param.toUpperCase()}: ${value}${ranges?.unit || ''} (${status})\n`;
  });

  if (recentReadings.length > 0) {
    prompt += `\n## Recent Trend (Last 7 Days)\n`;
    recentReadings.forEach(reading => {
      const date = reading.timestamp?.toDate?.() || new Date(reading.timestamp);
      prompt += `${date.toISOString().split('T')[0]}: `;
      prompt += Object.entries(reading)
        .filter(([k, v]) => k !== 'timestamp' && k !== 'source' && v !== undefined)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');
      prompt += '\n';
    });
  }

  if (events.length > 0) {
    prompt += `\n## Recent Events\n`;
    events.forEach(event => {
      const date = event.date?.toDate?.() || new Date(event.date);
      prompt += `${date.toISOString().split('T')[0]}: ${event.title || event.type}\n`;
      if (event.details) {
        prompt += `  Details: ${event.details}\n`;
      }
    });
  }

  if (dosingConfig && Object.keys(dosingConfig).length > 0) {
    prompt += `\n## Current Dosing\n`;
    Object.entries(dosingConfig).forEach(([pumpId, config]) => {
      prompt += `- ${config.userLabel || pumpId}: ${config.product || 'unknown'} at ${config.rate_ml_day || 0} mL/day\n`;
    });
  }

  prompt += `\nAnalyze this tank and provide your assessment in the JSON format specified.`;

  return prompt;
}

/**
 * Analyze tank using Vertex AI
 * @param {object} tankProfile - Tank configuration
 * @param {object} currentReadings - Latest readings
 * @param {array} recentReadings - Historical readings (7-30 days)
 * @param {array} events - Recent events
 * @param {object} dosingConfig - Current dosing setup
 * @returns {Promise<{ok: boolean, analysis?: object, error?: string}>}
 */
async function analyzeTank(tankProfile, currentReadings, recentReadings = [], events = [], dosingConfig = {}) {
  try {
    const ai = initVertexAI();
    const model = ai.getGenerativeModel({ model: MODEL });

    const systemPrompt = buildSystemPrompt(tankProfile);
    const analysisPrompt = buildAnalysisPrompt(currentReadings, recentReadings, events, dosingConfig);

    const result = await model.generateContent({
      contents: [
        { role: 'user', parts: [{ text: systemPrompt }] },
        { role: 'model', parts: [{ text: 'Understood. I will analyze the tank and return a structured JSON response.' }] },
        { role: 'user', parts: [{ text: analysisPrompt }] },
      ],
      generationConfig: {
        temperature: 0.3,  // Lower temp for more consistent output
        maxOutputTokens: 2048,
      },
    });

    const response = result.response;
    const text = response.candidates[0].content.parts[0].text;

    // Try to parse JSON from response
    let analysis;
    try {
      // Strip markdown code fences if present
      const jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      analysis = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', text);
      return { ok: false, error: 'AI returned invalid response format' };
    }

    return {
      ok: true,
      analysis,
    };
  } catch (error) {
    console.error('AI analysis failed:', error);
    return { ok: false, error: error.message || 'AI analysis failed' };
  }
}

module.exports = {
  analyzeTank,
  assessParameter,
  PARAM_RANGES,
};
