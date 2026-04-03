const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

// [SECURITY] Cache config at startup - prevent runtime config manipulation
var _cachedConfig = null;

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error('config.json not found. Run "npm run setup" first.');
  }
  var raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  var config = JSON.parse(raw);

  // Generate JWT secret if not set
  if (!config.server.jwtSecret) {
    config.server.jwtSecret = crypto.randomBytes(64).toString('hex');
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  }

  // Cache on first load
  _cachedConfig = config;
  return config;
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  _cachedConfig = config; // Update cache
}

function getConfig() {
  // [SECURITY] Return cached config instead of re-reading file
  if (_cachedConfig) return _cachedConfig;
  return loadConfig();
}

module.exports = { loadConfig, saveConfig, getConfig };
