const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'winnas.db');

let db = null;

// Save database to file
function saveDb() {
  if (db) {
    try {
      const data = db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(DB_PATH, buffer);
    } catch (e) {
      console.error('DB save error:', e);
    }
  }
}

async function initDb() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Initialize tables
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL DEFAULT 'admin',
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    fingerprint TEXT UNIQUE NOT NULL,
    user_agent TEXT,
    ip_address TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    last_seen TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS login_attempts (
    ip_address TEXT PRIMARY KEY,
    attempts INTEGER DEFAULT 0,
    first_attempt TEXT DEFAULT (datetime('now')),
    last_attempt TEXT DEFAULT (datetime('now'))
  )`);

  saveDb();

  // Start auto-save
  setInterval(saveDb, 30000);

  process.on('exit', saveDb);

  return db;
}

// ============ Safe query helpers ============
// sql.js quirks: db.run(sql, params) where params is an object {$key: val} or array
// stmt.bind() does NOT accept undefined values

function queryOne(sql, params) {
  try {
    const results = db.exec(sql, params);
    if (results.length === 0) return null;
    const cols = results[0].columns;
    const row = results[0].values[0];
    if (!row) return null;
    const obj = {};
    cols.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  } catch (e) {
    console.error('queryOne error:', e.message, 'SQL:', sql, 'Params:', params);
    return null;
  }
}

function queryAll(sql, params) {
  try {
    const results = db.exec(sql, params);
    if (results.length === 0) return [];
    const cols = results[0].columns;
    return results[0].values.map(row => {
      const obj = {};
      cols.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    });
  } catch (e) {
    console.error('queryAll error:', e.message, 'SQL:', sql, 'Params:', params);
    return [];
  }
}

function execute(sql, params) {
  try {
    db.run(sql, params);
    saveDb();
  } catch (e) {
    console.error('execute error:', e.message, 'SQL:', sql, 'Params:', params);
  }
}

// ============ User operations ============
const userOps = {
  getAdmin: () => {
    return queryOne("SELECT * FROM users WHERE username = 'admin'");
  },
  createAdmin: (passwordHash) => {
    const existing = queryOne("SELECT * FROM users WHERE username = 'admin'");
    if (existing) {
      execute("UPDATE users SET password_hash = $ph, updated_at = datetime('now') WHERE username = 'admin'",
        { $ph: passwordHash });
    } else {
      execute("INSERT INTO users (username, password_hash) VALUES ('admin', $ph)",
        { $ph: passwordHash });
    }
  },
  updatePassword: (passwordHash) => {
    execute("UPDATE users SET password_hash = $ph, updated_at = datetime('now') WHERE username = 'admin'",
      { $ph: passwordHash });
  }
};

// ============ Device operations ============
const deviceOps = {
  getAll: () => queryAll('SELECT * FROM devices ORDER BY created_at DESC'),

  getById: (id) => queryOne('SELECT * FROM devices WHERE id = $id', { $id: id }),

  getByFingerprint: (fp) => queryOne('SELECT * FROM devices WHERE fingerprint = $fp', { $fp: fp }),

  getApproved: () => queryAll("SELECT * FROM devices WHERE status = 'approved'"),

  getPending: () => queryAll("SELECT * FROM devices WHERE status = 'pending'"),

  create: (device) => {
    execute(
      'INSERT INTO devices (id, name, fingerprint, user_agent, ip_address, status) VALUES ($id, $name, $fp, $ua, $ip, $st)',
      {
        $id: device.id,
        $name: device.name,
        $fp: device.fingerprint,
        $ua: device.userAgent || null,
        $ip: device.ipAddress || null,
        $st: device.status || 'pending'
      }
    );
  },

  updateStatus: (id, status) => {
    execute('UPDATE devices SET status = $st WHERE id = $id', { $st: status, $id: id });
  },

  updateLastSeen: (id) => {
    execute("UPDATE devices SET last_seen = datetime('now') WHERE id = $id", { $id: id });
  },

  delete: (id) => execute('DELETE FROM devices WHERE id = $id', { $id: id }),

  isFirstDevice: () => {
    const result = queryOne('SELECT COUNT(*) as count FROM devices');
    return !result || result.count === 0;
  }
};

// ============ Session operations ============
const sessionOps = {
  create: (session) => {
    execute(
      'INSERT INTO sessions (id, device_id, token_hash, expires_at) VALUES ($id, $did, $th, $ea)',
      { $id: session.id, $did: session.deviceId, $th: session.tokenHash, $ea: session.expiresAt }
    );
  },

  getByTokenHash: (hash) => {
    return queryOne("SELECT * FROM sessions WHERE token_hash = $th AND expires_at > datetime('now')", { $th: hash });
  },

  deleteByDeviceId: (deviceId) => {
    execute('DELETE FROM sessions WHERE device_id = $did', { $did: deviceId });
  },

  deleteExpired: () => {
    execute("DELETE FROM sessions WHERE expires_at <= datetime('now')");
  },

  deleteById: (id) => execute('DELETE FROM sessions WHERE id = $id', { $id: id })
};

// ============ Login attempt operations ============
const loginAttemptOps = {
  get: (ip) => queryOne('SELECT * FROM login_attempts WHERE ip_address = $ip', { $ip: ip }),

  increment: (ip) => {
    const existing = queryOne('SELECT * FROM login_attempts WHERE ip_address = $ip', { $ip: ip });
    if (existing) {
      execute("UPDATE login_attempts SET attempts = attempts + 1, last_attempt = datetime('now') WHERE ip_address = $ip", { $ip: ip });
    } else {
      execute('INSERT INTO login_attempts (ip_address, attempts) VALUES ($ip, 1)', { $ip: ip });
    }
  },

  reset: (ip) => execute('DELETE FROM login_attempts WHERE ip_address = $ip', { $ip: ip }),

  cleanOld: (minutes) => {
    const mins = parseInt(minutes) || 15;
    execute(`DELETE FROM login_attempts WHERE last_attempt < datetime('now', '-${mins} minutes')`);
  }
};

module.exports = {
  initDb,
  getDb: () => db,
  userOps,
  deviceOps,
  sessionOps,
  loginAttemptOps,
  saveDb
};
