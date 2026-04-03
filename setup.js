const readline = require('readline');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function setup() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║         WinNAS - Initial Setup               ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  // 1. Set admin password
  let password;
  while (true) {
    password = await ask('🔑 Set admin password (min 8 characters): ');
    if (password.length < 8) {
      console.log('❌ Password must be at least 8 characters.');
      continue;
    }
    const confirm = await ask('🔑 Confirm password: ');
    if (password !== confirm) {
      console.log('❌ Passwords do not match.');
      continue;
    }
    break;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // 2. Configure drives
  console.log('\n📁 Configure allowed drives');
  console.log('   Enter drive letters separated by commas (e.g., D,E,F)');
  const drivesInput = await ask('   Drives: ');
  const drives = drivesInput.split(',')
    .map(d => d.trim().toUpperCase())
    .filter(d => /^[A-Z]$/.test(d))
    .map(d => `${d}:\\`);

  if (drives.length === 0) {
    console.log('⚠️  No valid drives specified. Using D:\\ as default.');
    drives.push('D:\\');
  }

  console.log(`   Selected drives: ${drives.join(', ')}`);

  // 3. Generate config
  const config = {
    server: {
      port: 7943,
      jwtSecret: crypto.randomBytes(64).toString('hex'),
      sessionExpiry: '7d',
      maxUploadSize: '500mb'
    },
    drives,
    security: {
      maxLoginAttempts: 5,
      lockoutMinutes: 15,
      allowedFileTypes: {
        images: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico', '.tiff'],
        videos: ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v'],
        documents: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.md'],
        archives: ['.zip', '.rar', '.7z', '.tar', '.gz']
      }
    }
  };

  // Save config
  const configPath = path.join(__dirname, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  console.log('\n✅ Config saved to config.json');

  // 4. Create data directory & initialize database
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Initialize DB using sql.js
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL DEFAULT 'admin',
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      fingerprint TEXT UNIQUE NOT NULL,
      user_agent TEXT,
      ip_address TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      last_seen TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      CHECK (status IN ('pending', 'approved', 'blocked'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS login_attempts (
      ip_address TEXT PRIMARY KEY,
      attempts INTEGER DEFAULT 0,
      first_attempt TEXT DEFAULT (datetime('now')),
      last_attempt TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run('INSERT INTO users (username, password_hash) VALUES (?, ?)', ['admin', passwordHash]);

  // Save DB
  const dbData = db.export();
  const dbBuffer = Buffer.from(dbData);
  fs.writeFileSync(path.join(dataDir, 'winnas.db'), dbBuffer);
  db.close();

  console.log('✅ Database initialized');

  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║         ✅  Setup Complete!                   ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log('║  Run:  npm start                             ║');
  console.log('║                                              ║');
  console.log('║  Then connect Cloudflare Tunnel:              ║');
  console.log('║  cloudflared tunnel --url http://localhost:7943║');
  console.log('╚══════════════════════════════════════════════╝\n');

  rl.close();
}

setup().catch(err => {
  console.error('Setup failed:', err);
  rl.close();
  process.exit(1);
});
