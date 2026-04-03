// Clear all test devices and sessions, keep only admin user
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'winnas.db');

async function reset() {
  const SQL = await initSqlJs();
  const buf = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(buf);

  // Show current devices
  const devices = db.exec('SELECT id, name, status, fingerprint FROM devices');
  console.log('Current devices:', devices.length ? devices[0].values : 'none');

  // Delete all devices and sessions
  db.run('DELETE FROM devices');
  db.run('DELETE FROM sessions');
  db.run('DELETE FROM login_attempts');

  console.log('All devices, sessions, and login attempts cleared.');
  console.log('Next login will auto-approve as first device.');

  // Save
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
  db.close();
}

reset().catch(console.error);
