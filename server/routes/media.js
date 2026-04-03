const express = require('express');
const path = require('path');
const fs = require('fs');
const { getConfig } = require('../config');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// Helper: Validate path
function isPathAllowed(filePath, config) {
  var normalizedPath = path.resolve(filePath);

  // [SECURITY#7] Block access to project directory itself
  var projectDir = path.resolve(__dirname, '..', '..');
  if (normalizedPath.startsWith(projectDir)) {
    return false;
  }

  return config.drives.some(function(drive) {
    var normalizedDrive = path.resolve(drive);
    return normalizedPath.startsWith(normalizedDrive);
  });
}

// [SECURITY#1] Safe image MIME types - SVG EXCLUDED to prevent XSS
var SAFE_IMAGE_MIMES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.tiff': 'image/tiff'
};

var VIDEO_MIMES = {
  '.mp4': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.wmv': 'video/x-ms-wmv',
  '.flv': 'video/x-flv',
  '.webm': 'video/webm',
  '.m4v': 'video/mp4'
};

// GET /api/media/thumbnail - Serve image thumbnail
router.get('/thumbnail', function(req, res) {
  try {
    var config = getConfig();
    var filePath = req.query.path;

    if (!filePath) {
      return res.status(400).json({ error: 'Path is required' });
    }

    var resolvedPath = path.resolve(filePath);
    if (!isPathAllowed(resolvedPath, config)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    var ext = path.extname(resolvedPath).toLowerCase();

    if (!SAFE_IMAGE_MIMES[ext]) {
      return res.status(400).json({ error: 'Not a supported image file' });
    }

    // [SECURITY] Prevent content sniffing, force image interpretation
    res.set('Content-Type', SAFE_IMAGE_MIMES[ext]);
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'private, max-age=86400');
    res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    res.sendFile(resolvedPath);
  } catch (err) {
    console.error('Thumbnail error:', err);
    res.status(500).json({ error: 'Failed to serve thumbnail' });
  }
});

// GET /api/media/stream - Stream video with Range support
router.get('/stream', function(req, res) {
  try {
    var config = getConfig();
    var filePath = req.query.path;

    if (!filePath) {
      return res.status(400).json({ error: 'Path is required' });
    }

    var resolvedPath = path.resolve(filePath);
    if (!isPathAllowed(resolvedPath, config)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    var stat = fs.statSync(resolvedPath);
    var fileSize = stat.size;
    var ext = path.extname(resolvedPath).toLowerCase();
    var contentType = VIDEO_MIMES[ext] || 'application/octet-stream';
    var range = req.headers.range;

    if (range) {
      var parts = range.replace(/bytes=/, '').split('-');
      var start = parseInt(parts[0], 10);
      var end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      // [SECURITY#4] Validate Range header values
      if (isNaN(start) || start < 0) start = 0;
      if (isNaN(end) || end >= fileSize) end = fileSize - 1;
      if (start > end) {
        return res.status(416).json({ error: 'Range not satisfiable' });
      }

      // Cap chunk size to 10MB to prevent memory exhaustion
      var MAX_CHUNK = 10 * 1024 * 1024;
      if (end - start + 1 > MAX_CHUNK) {
        end = start + MAX_CHUNK - 1;
      }

      var chunkSize = end - start + 1;
      var stream = fs.createReadStream(resolvedPath, { start: start, end: end });

      res.writeHead(206, {
        'Content-Range': 'bytes ' + start + '-' + end + '/' + fileSize,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff'
      });

      stream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff'
      });

      fs.createReadStream(resolvedPath).pipe(res);
    }
  } catch (err) {
    console.error('Stream error:', err);
    res.status(500).json({ error: 'Failed to stream media' });
  }
});

// GET /api/media/image - Serve full image
router.get('/image', function(req, res) {
  try {
    var config = getConfig();
    var filePath = req.query.path;

    if (!filePath) {
      return res.status(400).json({ error: 'Path is required' });
    }

    var resolvedPath = path.resolve(filePath);
    if (!isPathAllowed(resolvedPath, config)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    var ext = path.extname(resolvedPath).toLowerCase();

    // [SECURITY#1] SVG blocked - serve as download instead
    if (ext === '.svg') {
      res.set('Content-Disposition', 'attachment; filename="' + path.basename(resolvedPath) + '"');
      res.set('Content-Type', 'application/octet-stream');
      return res.sendFile(resolvedPath);
    }

    if (!SAFE_IMAGE_MIMES[ext]) {
      return res.status(400).json({ error: 'Not a supported image file' });
    }

    res.set('Content-Type', SAFE_IMAGE_MIMES[ext]);
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    res.set('Cache-Control', 'private, max-age=3600');
    res.sendFile(resolvedPath);
  } catch (err) {
    console.error('Image serve error:', err);
    res.status(500).json({ error: 'Failed to serve image' });
  }
});

module.exports = router;
