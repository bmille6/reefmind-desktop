/**
 * Apex Fusion Integration
 * Handles authentication, auto-discovery, and data syncing with Neptune Apex via Fusion API
 * 
 * IMPORTANT: This is READ-ONLY. We NEVER write to the Apex.
 */

const fetch = require('node-fetch');
const crypto = require('crypto');

const FUSION_API_BASE = 'https://apexfusion.com/api';
const ENCRYPTION_KEY = process.env.APEX_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

if (!process.env.APEX_ENCRYPTION_KEY) {
  console.warn('⚠️  APEX_ENCRYPTION_KEY not set - using random key (credentials will not persist across restarts)');
}

/**
 * Encrypt Fusion credentials for storage
 * @param {string} text - Plain text to encrypt
 * @returns {string} - Encrypted text (base64)
 */
function encrypt(text) {
  const algorithm = 'aes-256-cbc';
  const key = Buffer.from(ENCRYPTION_KEY.substring(0, 64), 'hex');
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt Fusion credentials
 * @param {string} encrypted - Encrypted text (base64)
 * @returns {string} - Plain text
 */
function decrypt(encrypted) {
  const algorithm = 'aes-256-cbc';
  const key = Buffer.from(ENCRYPTION_KEY.substring(0, 64), 'hex');

  const parts = encrypted.split(':');
  const iv = Buffer.from(parts.shift(), 'hex');
  const encryptedText = parts.join(':');

  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Authenticate with Apex Fusion
 * @param {string} email - Fusion account email
 * @param {string} password - Fusion account password
 * @returns {Promise<{ok: boolean, token?: string, error?: string}>}
 */
async function authenticateFusion(email, password) {
  try {
    // Fusion uses a login endpoint similar to standard auth
    // This is reverse-engineered from web traffic - may need updates
    const response = await fetch(`${FUSION_API_BASE}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ReefMind/1.0',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        return { ok: false, error: 'Invalid Fusion credentials' };
      }
      return { ok: false, error: `Fusion API error: ${response.status}` };
    }

    const data = await response.json();

    // Token format varies - check common fields
    const token = data.token || data.access_token || data.sessionId;
    if (!token) {
      return { ok: false, error: 'No token received from Fusion' };
    }

    return {
      ok: true,
      token,
    };
  } catch (error) {
    console.error('Fusion auth error:', error);
    return { ok: false, error: 'Failed to connect to Apex Fusion' };
  }
}

/**
 * Get user's Apex devices from Fusion
 * @param {string} token - Fusion auth token
 * @returns {Promise<{ok: boolean, devices?: array, error?: string}>}
 */
async function getFusionDevices(token) {
  try {
    const response = await fetch(`${FUSION_API_BASE}/devices`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'ReefMind/1.0',
      },
    });

    if (!response.ok) {
      return { ok: false, error: `Fusion API error: ${response.status}` };
    }

    const data = await response.json();
    const devices = data.devices || data.apexes || [];

    return {
      ok: true,
      devices,
    };
  } catch (error) {
    console.error('Fusion device fetch error:', error);
    return { ok: false, error: 'Failed to fetch devices from Fusion' };
  }
}

/**
 * Auto-discover Apex configuration (probes, outlets, Trident)
 * @param {string} token - Fusion auth token
 * @param {string} fusionId - Apex device ID on Fusion
 * @returns {Promise<{ok: boolean, config?: object, error?: string}>}
 */
async function discoverApexConfig(token, fusionId) {
  try {
    // Fetch full status from Fusion
    const response = await fetch(`${FUSION_API_BASE}/apex/${fusionId}/status`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'ReefMind/1.0',
      },
    });

    if (!response.ok) {
      return { ok: false, error: `Fusion API error: ${response.status}` };
    }

    const status = await response.json();

    // Parse probes
    const probes = [];
    if (status.inputs) {
      status.inputs.forEach(input => {
        if (input.type === 'pH' && input.value !== null) probes.push('pH');
        if (input.type === 'Tmp' && input.value !== null) probes.push('Temp');
        if (input.type === 'ORP' && input.value !== null) probes.push('ORP');
        if (input.type === 'Cond' && input.value !== null) probes.push('Conductivity');
      });
    }

    // Detect Trident (looks for Alk/Ca/Mg in inputs)
    let trident = false;
    if (status.inputs) {
      const hasAlk = status.inputs.some(i => i.name && i.name.toLowerCase().includes('alk'));
      const hasCa = status.inputs.some(i => i.name && i.name.toLowerCase().includes('ca'));
      const hasMg = status.inputs.some(i => i.name && i.name.toLowerCase().includes('mg'));
      trident = hasAlk && hasCa && hasMg;
    }

    // Parse outlets (dosing pumps, ATO, etc.)
    const outlets = [];
    if (status.outputs) {
      status.outputs.forEach(output => {
        outlets.push({
          id: output.did || output.ID,
          name: output.name || output.Name,
          state: output.status || output.State,
          type: inferOutletType(output.name || output.Name),
        });
      });
    }

    // Detect ATO
    const ato = outlets.some(o => o.type === 'ato');

    return {
      ok: true,
      config: {
        name: status.hostname || status.name || 'My Reef',
        apexSerial: status.serial || 'UNKNOWN',
        fusionId,
        equipment: {
          probes,
          trident,
          ato,
          outlets,
        },
      },
    };
  } catch (error) {
    console.error('Apex discovery error:', error);
    return { ok: false, error: 'Failed to discover Apex configuration' };
  }
}

/**
 * Infer outlet type from name (heuristic)
 * @param {string} name - Outlet name
 * @returns {string} - Type: 'dosing', 'ato', 'heater', 'light', 'pump', 'other'
 */
function inferOutletType(name) {
  const lower = (name || '').toLowerCase();

  if (lower.includes('dos') || lower.includes('doser') || lower.includes('2part') || 
      lower.includes('all4reef') || lower.includes('alk') || lower.includes('calc')) {
    return 'dosing';
  }
  if (lower.includes('ato') || lower.includes('topoff') || lower.includes('top-off')) {
    return 'ato';
  }
  if (lower.includes('heat')) {
    return 'heater';
  }
  if (lower.includes('light') || lower.includes('led')) {
    return 'light';
  }
  if (lower.includes('pump') || lower.includes('return') || lower.includes('skimmer')) {
    return 'pump';
  }

  return 'other';
}

/**
 * Sync live data from Apex (readings)
 * @param {string} token - Fusion auth token
 * @param {string} fusionId - Apex device ID
 * @returns {Promise<{ok: boolean, readings?: object, error?: string}>}
 */
async function syncApexReadings(token, fusionId) {
  try {
    const response = await fetch(`${FUSION_API_BASE}/apex/${fusionId}/status`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'ReefMind/1.0',
      },
    });

    if (!response.ok) {
      return { ok: false, error: `Fusion API error: ${response.status}` };
    }

    const status = await response.json();

    // Extract current readings
    const readings = {
      source: 'apex-probe',
      timestamp: new Date(),
    };

    if (status.inputs) {
      status.inputs.forEach(input => {
        if (input.type === 'pH' && input.value !== null) {
          readings.pH = parseFloat(input.value);
        }
        if (input.type === 'Tmp' && input.value !== null) {
          readings.temp = parseFloat(input.value);
        }
        if (input.type === 'ORP' && input.value !== null) {
          readings.orp = parseFloat(input.value);
        }
        if (input.type === 'Cond' && input.value !== null) {
          readings.salinity = parseFloat(input.value);
        }

        // Trident readings
        if (input.name && input.name.toLowerCase().includes('alk') && input.value !== null) {
          readings.alk = parseFloat(input.value);
          readings.source = 'trident';
        }
        if (input.name && input.name.toLowerCase().includes('ca') && input.value !== null) {
          readings.ca = parseFloat(input.value);
          readings.source = 'trident';
        }
        if (input.name && input.name.toLowerCase().includes('mg') && input.value !== null) {
          readings.mg = parseFloat(input.value);
          readings.source = 'trident';
        }
      });
    }

    return {
      ok: true,
      readings,
    };
  } catch (error) {
    console.error('Apex sync error:', error);
    return { ok: false, error: 'Failed to sync Apex readings' };
  }
}

module.exports = {
  authenticateFusion,
  getFusionDevices,
  discoverApexConfig,
  syncApexReadings,
  encrypt,
  decrypt,
};
