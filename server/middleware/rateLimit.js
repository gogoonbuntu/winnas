const { loginAttemptOps } = require('../db');
const { getConfig } = require('../config');

// [SECURITY#8] Extract real client IP from Cloudflare headers
function getClientIp(req) {
  // Cloudflare sends the real client IP in CF-Connecting-IP
  var cfIp = req.headers['cf-connecting-ip'];
  if (cfIp) return cfIp;

  // X-Forwarded-For (first entry is the client)
  var xff = req.headers['x-forwarded-for'];
  if (xff) return xff.split(',')[0].trim();

  // X-Real-IP
  var xri = req.headers['x-real-ip'];
  if (xri) return xri;

  // Fallback
  return req.ip || req.connection.remoteAddress;
}

function rateLimitMiddleware(req, res, next) {
  var config = getConfig();
  var ip = getClientIp(req);
  var maxAttempts = config.security.maxLoginAttempts || 3;
  var lockoutMinutes = config.security.lockoutMinutes || 30;

  // Clean old attempts
  loginAttemptOps.cleanOld(lockoutMinutes);

  var record = loginAttemptOps.get(ip);

  if (record && record.attempts >= maxAttempts) {
    var lastAttempt = new Date(record.last_attempt);
    var lockoutEnd = new Date(lastAttempt.getTime() + lockoutMinutes * 60 * 1000);
    var now = new Date();

    if (now < lockoutEnd) {
      var remainingMs = lockoutEnd - now;
      var remainingMin = Math.ceil(remainingMs / 60000);
      return res.status(429).json({
        error: 'Too many attempts. Try again in ' + remainingMin + ' minutes.',
        code: 'RATE_LIMITED',
        retryAfter: Math.ceil(remainingMs / 1000)
      });
    } else {
      loginAttemptOps.reset(ip);
    }
  }

  // Store real IP for use in auth route
  req.clientIp = ip;
  next();
}

module.exports = rateLimitMiddleware;
module.exports.getClientIp = getClientIp;
