const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { getConfig } = require('../config');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// All file routes require authentication
router.use(authMiddleware);

// Helper: Validate path is within allowed drives
function isPathAllowed(filePath, config) {
  var normalizedPath = path.resolve(filePath);

  // [SECURITY#7] Block access to project directory (DB, config, server code)
  var projectDir = path.resolve(__dirname, '..', '..');
  if (normalizedPath.startsWith(projectDir)) {
    return false;
  }

  return config.drives.some(function(drive) {
    var normalizedDrive = path.resolve(drive);
    return normalizedPath.startsWith(normalizedDrive);
  });
}

// Helper: Get file info
function getFileInfo(filePath) {
  try {
    const stats = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    return {
      name: path.basename(filePath),
      path: filePath,
      isDirectory: stats.isDirectory(),
      size: stats.size,
      extension: ext,
      type: getFileType(ext),
      modified: stats.mtime,
      created: stats.birthtime
    };
  } catch (err) {
    return null;
  }
}

function getFileType(ext) {
  const images = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico', '.tiff'];
  const videos = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v'];
  const documents = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.md'];
  const archives = ['.zip', '.rar', '.7z', '.tar', '.gz'];

  if (images.includes(ext)) return 'image';
  if (videos.includes(ext)) return 'video';
  if (documents.includes(ext)) return 'document';
  if (archives.includes(ext)) return 'archive';
  return 'other';
}

function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// GET /api/files/drives - List allowed drives
router.get('/drives', (req, res) => {
  const config = getConfig();
  const drives = config.drives.map(drive => {
    const normalizedDrive = path.resolve(drive);
    let available = false;
    let totalSize = 0;
    let freeSize = 0;

    try {
      fs.accessSync(normalizedDrive, fs.constants.R_OK);
      available = true;
    } catch {
      available = false;
    }

    return {
      path: normalizedDrive,
      label: normalizedDrive.charAt(0) + ' Drive',
      available
    };
  });

  res.json({ drives });
});

// GET /api/files/browse - Browse directory
router.get('/browse', (req, res) => {
  try {
    const config = getConfig();
    const dirPath = req.query.path;

    if (!dirPath) {
      return res.status(400).json({ error: 'Path is required' });
    }

    const resolvedPath = path.resolve(dirPath);

    if (!isPathAllowed(resolvedPath, config)) {
      return res.status(403).json({ error: 'Access denied: path not in allowed drives' });
    }

    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: 'Directory not found' });
    }

    const stats = fs.statSync(resolvedPath);
    if (!stats.isDirectory()) {
      return res.status(400).json({ error: 'Path is not a directory' });
    }

    const entries = fs.readdirSync(resolvedPath, { withFileTypes: true });
    const items = [];

    for (const entry of entries) {
      try {
        const fullPath = path.join(resolvedPath, entry.name);
        // Skip system and hidden files
        if (entry.name.startsWith('.') || entry.name.startsWith('$')) continue;

        const info = getFileInfo(fullPath);
        if (info) {
          info.sizeFormatted = formatSize(info.size);
          items.push(info);
        }
      } catch (err) {
        // Skip inaccessible files
        continue;
      }
    }

    // Sort: directories first, then files
    items.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    // Build breadcrumb
    const parts = resolvedPath.split(path.sep).filter(Boolean);
    const breadcrumb = parts.map((part, index) => ({
      name: part,
      path: parts.slice(0, index + 1).join(path.sep)
    }));

    res.json({
      currentPath: resolvedPath,
      parentPath: path.dirname(resolvedPath),
      breadcrumb,
      items,
      totalItems: items.length
    });
  } catch (err) {
    console.error('Browse error:', err);
    res.status(500).json({ error: 'Failed to browse directory' });
  }
});

// GET /api/files/download - Download file
router.get('/download', (req, res) => {
  try {
    const config = getConfig();
    const filePath = req.query.path;

    if (!filePath) {
      return res.status(400).json({ error: 'Path is required' });
    }

    const resolvedPath = path.resolve(filePath);

    if (!isPathAllowed(resolvedPath, config)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const stats = fs.statSync(resolvedPath);
    if (stats.isDirectory()) {
      return res.status(400).json({ error: 'Cannot download a directory' });
    }

    res.download(resolvedPath, path.basename(resolvedPath));
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

// POST /api/files/upload - Upload files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const config = getConfig();
    const uploadPath = req.body.path || req.query.path;

    if (!uploadPath) {
      return cb(new Error('Upload path is required'));
    }

    const resolvedPath = path.resolve(uploadPath);

    if (!isPathAllowed(resolvedPath, config)) {
      return cb(new Error('Access denied: path not in allowed drives'));
    }

    if (!fs.existsSync(resolvedPath)) {
      return cb(new Error('Upload directory does not exist'));
    }

    cb(null, resolvedPath);
  },
  filename: (req, file, cb) => {
    // [SECURITY#2] Strip directory components to prevent path traversal
    var rawName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    var safeName = path.basename(rawName).replace(/[<>:"|?*\x00-\x1f]/g, '_');
    if (!safeName || safeName === '.' || safeName === '..') {
      safeName = 'upload_' + Date.now();
    }

    var uploadDir = req.body.path || req.query.path;
    var targetPath = path.join(uploadDir, safeName);

    if (fs.existsSync(targetPath)) {
      var ext = path.extname(safeName);
      var base = path.basename(safeName, ext);
      var timestamp = Date.now();
      cb(null, base + '_' + timestamp + ext);
    } else {
      cb(null, safeName);
    }
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB default
  }
});

router.post('/upload', upload.array('files', 20), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const uploaded = req.files.map(f => ({
      name: f.filename,
      size: f.size,
      sizeFormatted: formatSize(f.size),
      path: f.path
    }));

    res.json({ success: true, files: uploaded });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Failed to upload files' });
  }
});

// GET /api/files/search - Search files
router.get('/search', (req, res) => {
  try {
    const config = getConfig();
    const { query: searchQuery, path: searchPath, type } = req.query;

    if (!searchQuery) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const basePath = searchPath ? path.resolve(searchPath) : config.drives[0];

    if (!isPathAllowed(basePath, config)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const results = [];
    const maxResults = 100;

    function searchDir(dir, depth = 0) {
      if (depth > 5 || results.length >= maxResults) return;

      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (results.length >= maxResults) break;
          if (entry.name.startsWith('.') || entry.name.startsWith('$')) continue;

          const fullPath = path.join(dir, entry.name);

          if (entry.name.toLowerCase().includes(searchQuery.toLowerCase())) {
            const info = getFileInfo(fullPath);
            if (info) {
              if (!type || info.type === type) {
                info.sizeFormatted = formatSize(info.size);
                results.push(info);
              }
            }
          }

          if (entry.isDirectory()) {
            try {
              searchDir(fullPath, depth + 1);
            } catch {
              // Skip inaccessible directories
            }
          }
        }
      } catch {
        // Skip inaccessible directories
      }
    }

    searchDir(basePath);

    res.json({ results, total: results.length, query: searchQuery });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

module.exports = router;
