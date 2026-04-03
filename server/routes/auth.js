const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { getConfig } = require('../config');
const { userOps, deviceOps, sessionOps, loginAttemptOps } = require('../db');
const authMiddleware = require('../middleware/auth');
const rateLimitMiddleware = require('../middleware/rateLimit');

const router = express.Router();

// POST /api/auth/login
router.post('/login', rateLimitMiddleware, async (req, res) => {
  try {
    const { password, deviceFingerprint, deviceName } = req.body;
    const config = getConfig();
    const ip = req.clientIp || req.ip || req.connection.remoteAddress;

    if (!password || !deviceFingerprint) {
      return res.status(400).json({ error: 'Password and device fingerprint required' });
    }

    // Check admin exists
    const admin = userOps.getAdmin();
    if (!admin) {
      return res.status(500).json({ error: 'Admin not set up. Run npm run setup.' });
    }

    // Verify password
    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) {
      loginAttemptOps.increment(ip);
      // [SECURITY#6] Vague error message to prevent user enumeration
      return res.status(401).json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
    }

    // Reset login attempts on success
    loginAttemptOps.reset(ip);

    // Check device
    let device = deviceOps.getByFingerprint(deviceFingerprint);

    if (!device) {
      // First device is auto-approved, subsequent ones need approval
      const isFirst = deviceOps.isFirstDevice();
      const deviceId = uuidv4();

      deviceOps.create({
        id: deviceId,
        name: deviceName || `Device ${new Date().toLocaleDateString()}`,
        fingerprint: deviceFingerprint,
        userAgent: req.headers['user-agent'],
        ipAddress: ip,
        status: isFirst ? 'approved' : 'pending'
      });

      device = deviceOps.getById(deviceId);

      if (!isFirst) {
        return res.status(403).json({
          error: 'Device registered. Waiting for approval from an existing device.',
          code: 'DEVICE_PENDING',
          deviceId: deviceId
        });
      }
    }

    if (device.status === 'blocked') {
      return res.status(403).json({ error: 'Device is blocked', code: 'DEVICE_BLOCKED' });
    }

    if (device.status === 'pending') {
      return res.status(403).json({
        error: 'Device pending approval',
        code: 'DEVICE_PENDING',
        deviceId: device.id
      });
    }

    // Create JWT token
    const token = jwt.sign(
      { userId: admin.id, deviceId: device.id },
      config.server.jwtSecret,
      { expiresIn: config.server.sessionExpiry || '1d' }
    );

    // Store session
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const decoded = jwt.decode(token);
    sessionOps.create({
      id: uuidv4(),
      deviceId: device.id,
      tokenHash,
      expiresAt: new Date(decoded.exp * 1000).toISOString()
    });

    // Update device last seen
    deviceOps.updateLastSeen(device.id);

    // Set cookie
    res.cookie('winnas_token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // [SECURITY#8] 1 day session
    });

    res.json({
      success: true,
      token,
      device: { id: device.id, name: device.name }
    });
  } catch (err) {
    console.error('Login error:', err);
    // [SECURITY#3] Never expose internal error details
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/logout
router.post('/logout', authMiddleware, (req, res) => {
  try {
    const tokenHash = crypto.createHash('sha256').update(req.token).digest('hex');
    const session = sessionOps.getByTokenHash(tokenHash);
    if (session) {
      sessionOps.deleteById(session.id);
    }
    res.clearCookie('winnas_token');
    res.json({ success: true });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/status
router.get('/status', authMiddleware, (req, res) => {
  res.json({ authenticated: true, deviceId: req.deviceId });
});

// PUT /api/auth/password
router.put('/password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const admin = userOps.getAdmin();
    const valid = await bcrypt.compare(currentPassword, admin.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hash = await bcrypt.hash(newPassword, 12);
    userOps.updatePassword(hash);

    res.json({ success: true, message: 'Password updated' });
  } catch (err) {
    console.error('Password change error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/media-token - Get short-lived token for media URLs
router.get('/media-token', authMiddleware, (req, res) => {
  const { generateMediaToken } = require('../middleware/auth');
  const mtoken = generateMediaToken(req.token);
  res.json({ mtoken, expiresIn: 300 }); // 5 minutes
});

module.exports = router;
