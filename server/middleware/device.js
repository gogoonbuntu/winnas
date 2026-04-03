const { deviceOps } = require('../db');

function deviceMiddleware(req, res, next) {
  const fingerprint = req.headers['x-device-fingerprint'];

  if (!fingerprint) {
    return res.status(400).json({ error: 'Device fingerprint required', code: 'NO_FINGERPRINT' });
  }

  const device = deviceOps.getByFingerprint(fingerprint);

  if (!device) {
    return res.status(403).json({ error: 'Device not registered', code: 'DEVICE_NOT_REGISTERED' });
  }

  if (device.status === 'blocked') {
    return res.status(403).json({ error: 'Device is blocked', code: 'DEVICE_BLOCKED' });
  }

  if (device.status === 'pending') {
    return res.status(403).json({ error: 'Device pending approval', code: 'DEVICE_PENDING' });
  }

  req.device = device;
  next();
}

module.exports = deviceMiddleware;
