const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { getConfig } = require('../config');
const { sessionOps, deviceOps } = require('../db');

// Short-lived media token store (in-memory, 5 min expiry)
var mediaTokens = new Map();

// Cleanup expired media tokens every 2 minutes
setInterval(function() {
  var now = Date.now();
  mediaTokens.forEach(function(val, key) {
    if (val.expiresAt < now) mediaTokens.delete(key);
  });
}, 120000);

function verifyMainToken(token) {
  var config = getConfig();

  var decoded = jwt.verify(token, config.server.jwtSecret);

  // Verify session exists in DB
  var tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  var session = sessionOps.getByTokenHash(tokenHash);
  if (!session) {
    return { error: 'Session expired or invalid', code: 'INVALID_SESSION' };
  }

  // Verify device is still approved
  var device = deviceOps.getById(session.device_id);
  if (!device || device.status !== 'approved') {
    return { error: 'Device not approved', code: 'DEVICE_NOT_APPROVED' };
  }

  return { valid: true, decoded: decoded, device: device, token: token };
}

function authMiddleware(req, res, next) {
  // Extract token from: cookie, Authorization header, or media token
  var token = null;
  var isMediaToken = false;

  if (req.cookies && req.cookies.winnas_token) {
    token = req.cookies.winnas_token;
  } else if (req.headers.authorization) {
    var parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      token = parts[1];
    }
  } else if (req.query && req.query.mtoken) {
    // Short-lived media token for <img> and <video> tags
    var mt = mediaTokens.get(req.query.mtoken);
    if (mt && mt.expiresAt > Date.now()) {
      token = mt.mainToken;
      isMediaToken = true;
    } else {
      // Media token expired or invalid
      if (mt) mediaTokens.delete(req.query.mtoken);
      return res.status(401).json({ error: 'Media token expired', code: 'MEDIA_TOKEN_EXPIRED' });
    }
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required', code: 'NO_TOKEN' });
  }

  try {
    var result = verifyMainToken(token);
    if (result.error) {
      return res.status(result.code === 'DEVICE_NOT_APPROVED' ? 403 : 401).json({
        error: result.error, code: result.code
      });
    }

    // Update last seen (throttle: don't update for media token requests to reduce DB writes)
    if (!isMediaToken) {
      deviceOps.updateLastSeen(result.device.id);
    }

    req.user = result.decoded;
    req.deviceId = result.device.id;
    req.token = token;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' });
  }
}

// Generate a short-lived media token (5 minutes, for <img>/<video> src)
function generateMediaToken(mainToken) {
  var id = crypto.randomBytes(32).toString('hex');
  mediaTokens.set(id, {
    mainToken: mainToken,
    expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes
  });
  return id;
}

module.exports = authMiddleware;
module.exports.generateMediaToken = generateMediaToken;
module.exports.verifyMainToken = verifyMainToken;
