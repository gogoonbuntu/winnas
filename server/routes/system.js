const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

const REG_KEY = 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run';
const REG_NAME = 'WinNAS';

// Helper: run a command and return a promise
function runCmd(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { encoding: 'utf8', shell: 'cmd.exe' }, (err, stdout, stderr) => {
      if (err) return reject(err);
      resolve(stdout);
    });
  });
}

// GET /api/system/startup - Check if startup registration is enabled
router.get('/startup', async (req, res) => {
  try {
    const output = await runCmd(`reg query "${REG_KEY}" /v "${REG_NAME}" 2>nul`);
    const isEnabled = output.includes(REG_NAME);
    res.json({ enabled: isEnabled });
  } catch (err) {
    // reg query returns error code 1 if key not found
    res.json({ enabled: false });
  }
});

// PUT /api/system/startup - Enable or disable startup
router.put('/startup', async (req, res) => {
  try {
    const { enabled } = req.body;

    if (enabled) {
      // Register: use WinNAS_Server.bat from project root
      const serverBat = path.resolve(__dirname, '..', '..', 'WinNAS_Server.bat');
      await runCmd(`reg add "${REG_KEY}" /v "${REG_NAME}" /t REG_SZ /d "\\"${serverBat}\\"" /f`);
      res.json({ success: true, enabled: true, message: '시작프로그램에 등록되었습니다.' });
    } else {
      await runCmd(`reg delete "${REG_KEY}" /v "${REG_NAME}" /f`);
      res.json({ success: true, enabled: false, message: '시작프로그램에서 해제되었습니다.' });
    }
  } catch (err) {
    console.error('Startup registration error:', err);
    res.status(500).json({ error: '시작프로그램 등록/해제에 실패했습니다.' });
  }
});

module.exports = router;
