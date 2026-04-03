const readline = require('readline');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function setup() {
  console.log('');
  console.log('======================================================');
  console.log('         WinNAS - 초기 설정 마법사');
  console.log('======================================================');
  console.log('');

  // 0. Check Node.js version
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0], 10);
  console.log(`Node.js ${nodeVersion} 감지됨`);
  if (majorVersion < 18) {
    console.log('');
    console.log('[오류] Node.js 18 이상이 필요합니다.');
    console.log('  https://nodejs.org/ 에서 최신 버전을 설치하세요.');
    rl.close();
    process.exit(1);
  }
  console.log('');

  // 1. Install npm dependencies
  console.log('npm 패키지 설치 중... (처음 한 번만 필요)');
  console.log('  잠시만 기다려주세요...');
  console.log('');
  try {
    execSync('npm install --production', {
      cwd: __dirname,
      stdio: 'inherit'
    });
  } catch (e) {
    console.log('');
    console.log('[오류] npm 패키지 설치에 실패했습니다.');
    console.log('  인터넷 연결을 확인하고 다시 시도해주세요.');
    rl.close();
    process.exit(1);
  }
  console.log('');
  console.log('패키지 설치 완료!');
  console.log('');

  // Now require packages that were just installed
  const bcrypt = require('bcryptjs');

  // 2. Set admin password
  console.log('------------------------------------------------------');
  console.log('  이제 관리자 비밀번호와 드라이브를 설정합니다');
  console.log('------------------------------------------------------');
  console.log('');

  let password;
  while (true) {
    password = await ask('관리자 비밀번호 설정 (8자 이상): ');
    if (password.length < 8) {
      console.log('[오류] 비밀번호는 8자 이상이어야 합니다.');
      continue;
    }
    const confirm = await ask('비밀번호 확인: ');
    if (password !== confirm) {
      console.log('[오류] 비밀번호가 일치하지 않습니다.');
      continue;
    }
    break;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // 3. Configure drives
  console.log('');
  console.log('허용할 드라이브를 설정합니다');
  console.log('  드라이브 문자를 쉼표로 구분하여 입력하세요 (예: D,E,F)');
  const drivesInput = await ask('  드라이브: ');
  const drives = drivesInput.split(',')
    .map(d => d.trim().toUpperCase())
    .filter(d => /^[A-Z]$/.test(d))
    .map(d => `${d}:\\`);

  if (drives.length === 0) {
    console.log('  유효한 드라이브가 없습니다. D:\\ 를 기본값으로 사용합니다.');
    drives.push('D:\\');
  }

  console.log(`  선택된 드라이브: ${drives.join(', ')}`);

  // 4. Generate config
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
  console.log('');
  console.log('config.json 저장 완료');

  // 5. Create data directory & initialize database
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

  console.log('데이터베이스 초기화 완료');

  console.log('');
  console.log('======================================================');
  console.log('  설치가 완료되었습니다!');
  console.log('======================================================');
  console.log('');
  console.log('  서버를 시작하려면:');
  console.log('    1. 바탕화면의 "WinNAS" 바로가기를 실행하세요');
  console.log('    2. 또는 start_server.bat 을 실행하세요');
  console.log('');
  console.log('  브라우저에서 http://localhost:7943 으로 접속하세요.');
  console.log('');
  console.log('  외부에서 접속하려면 Cloudflare Tunnel을 설정하세요:');
  console.log('    cloudflared tunnel --url http://localhost:7943');
  console.log('');

  rl.close();
}

setup().catch(err => {
  console.error('설정 실패:', err.message || err);
  rl.close();
  process.exit(1);
});
