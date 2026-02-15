const { GoogleGenerativeAI } = require('@google/generative-ai');
const { searchByTopics } = require('./library');

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
if (!GOOGLE_API_KEY) {
  console.warn('⚠️  GOOGLE_API_KEY not set - AI analysis will fail');
}

const genAI = GOOGLE_API_KEY ? new GoogleGenerativeAI(GOOGLE_API_KEY) : null;

// Parameter ranges for context
const PARAM_RANGES = {
  pH: { optimal: [8.0, 8.3], watch: [7.8, 8.5], critical: [7.6, 8.7], unit: '' },
  temp: { optimal: [76, 79], watch: [75, 80], critical: [73, 82], unit: '°F' },
  alk: { optimal: [7, 9], watch: [6.5, 10], critical: [5.5, 12], unit: 'dKH' },
  ca: { optimal: [400, 450], watch: [380, 480], critical: [350, 520], unit: 'ppm' },
  mg: { optimal: [1300, 1400], watch: [1250, 1450], critical: [1200, 1500], unit: 'ppm' },
  no3: { optimal: [2, 10], watch: [1, 15], critical: [0, 25], unit: 'ppm' },
  po4: { optimal: [0.03, 0.1], watch: [0.02, 0.15], critical: [0, 0.3], unit: 'ppm' },
  orp: { optimal: [300, 400], watch: [250, 420], critical: [200, 450], unit: 'mV' },
  sal: { optimal: [34, 36], watch: [33, 37], critical: [32, 38], unit: 'ppt' }
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

// Build AI system prompt with reef expertise
function buildSystemPrompt(libraryContext) {
  return `You are an expert reef chemistry advisor with deep knowledge of marine aquarium science.

## Your Expertise
- Randy Holmes-Farley's reef chemistry research and recommendations
- Optimal parameter ranges for mixed reef and SPS tanks
- Chemical interactions and ratios (N:P ratio, Mg:Ca ratio, etc.)
- Trend analysis and prediction
- Specific, actionable troubleshooting

## Parameter Ranges (Mixed Reef / SPS)
${Object.entries(PARAM_RANGES).map(([param, ranges]) => 
  `- ${param.toUpperCase()}: Optimal ${ranges.optimal[0]}-${ranges.optimal[1]}${ranges.unit}, Watch ${ranges.watch[0]}/${ranges.watch[1]}${ranges.unit}, Critical ${ranges.critical[0]}/${ranges.critical[1]}${ranges.unit}`
).join('\n')}

## Reef Knowledge Context
${libraryContext}

## Your Response Style
1. **Assessment**: Rate overall tank health (1-10) with reasoning
2. **Current Status**: Analyze each parameter against optimal ranges
3. **Trends**: Identify rising, falling, or stable trends from historical data
4. **Ratios & Interactions**: Check N:P ratio, Mg:Ca ratio, alkalinity stability
5. **Priorities**: What to fix FIRST (most urgent → least urgent)
6. **Specific Actions**: Concrete recommendations (not "test more" - tell them what to DO)
7. **Citations**: Reference Randy Holmes-Farley or reef research when relevant

## Critical Rules
- Be specific: "Dose 2 mL/day of Brightwell Alkalin8.3" NOT "raise alkalinity"
- Flag concerning trends BEFORE they become critical
- Explain WHY something matters (educate, don't just prescribe)
- If a parameter is optimal, say so (don't create problems that don't exist)
- Consider coral type: SPS is more demanding than softies/LPS`;
}

// Analyze tank parameters with AI
async function analyzeTank(params, history = []) {
  if (!genAI) {
    throw new Error('Google AI not configured - GOOGLE_API_KEY missing');
  }

  // Identify relevant topics from parameters
  const topics = [];
  if (params.alk !== undefined) topics.push('alkalinity');
  if (params.ca !== undefined) topics.push('calcium');
  if (params.mg !== undefined) topics.push('magnesium');
  if (params.no3 !== undefined || params.po4 !== undefined) topics.push('nutrients', 'nitrate', 'phosphate');
  if (params.pH !== undefined) topics.push('pH');

  // Fetch relevant library context
  const libraryArticles = topics.length > 0 ? searchByTopics(topics, 10) : [];
  const libraryContext = libraryArticles.length > 0
    ? libraryArticles.map(a => `### ${a.title}\nSource: ${a.source}\n${a.content.substring(0, 500)}...`).join('\n\n')
    : 'No specific library context available.';

  // Build assessment of current parameters
  const paramAssessment = Object.entries(params)
    .map(([key, value]) => {
      const status = assessParameter(key, value);
      const ranges = PARAM_RANGES[key];
      return `- ${key.toUpperCase()}: ${value}${ranges?.unit || ''} (${status})`;
    })
    .join('\n');

  // Format history for trend analysis
  const historyText = history.length > 0
    ? history.map(h => `Date ${h.date}: ${Object.entries(h.params).map(([k, v]) => `${k}=${v}`).join(', ')}`).join('\n')
    : 'No historical data provided.';

  // Build user prompt
  const userPrompt = `Analyze this reef tank:

## Current Parameters
${paramAssessment}

## Historical Data (Last 7 Days)
${historyText}

Provide a comprehensive analysis with specific, actionable recommendations.`;

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    
    const result = await model.generateContent([
      { text: buildSystemPrompt(libraryContext) },
      { text: userPrompt }
    ]);

    const response = result.response;
    const analysisText = response.text();

    return {
      ok: true,
      analysis: analysisText,
      citations: libraryArticles.map(a => ({
        title: a.title,
        source: a.source,
        id: a.id
      })),
      parameterStatus: Object.fromEntries(
        Object.entries(params).map(([key, value]) => [key, assessParameter(key, value)])
      )
    };
  } catch (error) {
    console.error('AI analysis failed:', error);
    return {
      ok: false,
      error: error.message || 'AI analysis failed'
    };
  }
}

module.exports = {
  analyzeTank,
  assessParameter,
  PARAM_RANGES
};
