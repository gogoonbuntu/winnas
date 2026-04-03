const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const cors = require('cors');
const { spawn } = require('child_process');
const { loadConfig } = require('./config');
const { initDb, userOps, sessionOps } = require('./db');

async function startServer() {
  // Initialize database
  await initDb();

  // Check if setup is complete
  const admin = userOps.getAdmin();
  if (!admin) {
    console.log('\n╔══════════════════════════════════════════════╗');
    console.log('║   WinNAS - Initial Setup Required            ║');
    console.log('║   Run: npm run setup                         ║');
    console.log('╚══════════════════════════════════════════════╝\n');
    process.exit(1);
  }

  const config = loadConfig();
  const app = express();

  // Trust proxy (for Cloudflare Tunnel)
  app.set('trust proxy', true);

  // Security middleware - CSP disabled (Cloudflare handles security headers)
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  }));

  app.use(cors({
    origin: true,
    credentials: true
  }));

  app.use(cookieParser());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request logging
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
      const start = Date.now();
      const oldJson = res.json.bind(res);
      res.json = (body) => {
        const duration = Date.now() - start;
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} → ${res.statusCode} (${duration}ms)`);
        if (res.statusCode >= 400) {
          console.log(`  Body:`, JSON.stringify(req.body));
          console.log(`  Response:`, JSON.stringify(body));
          console.log(`  Fingerprint:`, req.headers['x-device-fingerprint'] || 'NONE');
        }
        return oldJson(body);
      };
    }
    next();
  });

  // Serve static files
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // API Routes
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/devices', require('./routes/devices'));
  app.use('/api/files', require('./routes/files'));
  app.use('/api/media', require('./routes/media'));
  app.use('/api/system', require('./routes/system'));

  // SPA fallback - serve index.html for non-API routes
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  // Error handler
  app.use((err, req, res, next) => {
    console.error('Server error:', err);

    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large' });
    }

    res.status(500).json({ error: 'Internal server error' });
  });

  // Clean expired sessions periodically
  setInterval(() => {
    sessionOps.deleteExpired();
  }, 60 * 60 * 1000); // Every hour

  // Start server (HTTP - Cloudflare Tunnel handles HTTPS)
  const PORT = config.server.port || 7943;

  app.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║              WinNAS Server Running                   ║');
    console.log('╠══════════════════════════════════════════════════════╣');
    console.log(`║  🌐 Local:  http://localhost:${PORT}                   ║`);

    if (config.server.useCloudflareTunnel) {
      console.log('║  🌐 Cloudflare 터널 연결 중...                       ║');
      const cloudflaredPath = path.resolve(__dirname, '..', 'cloudflared.exe');
      
      const cfProcess = spawn(cloudflaredPath, ['tunnel', '--url', `http://localhost:${PORT}`]);
      let urlFound = false;

      cfProcess.stderr.on('data', (data) => {
        const text = data.toString();
        // Extract https://....trycloudflare.com
        const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (match && !urlFound) {
          urlFound = true;
          console.log(`║  🌐 Ex-URL: ${match[0].padEnd(38)} ║`);
          console.log('╚══════════════════════════════════════════════════════╝');
          console.log('');
        }
      });

      cfProcess.on('error', (err) => {
        console.log('║  [오류] cloudflared.exe 실행 실패!                   ║');
        console.log('╚══════════════════════════════════════════════════════╝');
        console.log(err.message);
      });
      
    } else {
      console.log('║                                                      ║');
      console.log('║  (외부 접속이 필요한 경우 setup.js를 다시 실행)      ║');
      console.log('╚══════════════════════════════════════════════════════╝');
      console.log('');
    }
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
