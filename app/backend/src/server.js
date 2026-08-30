/*
 * CloudForge — © 2026 Shashank Gowda NB (github.com/MASTER870-CMD)
 * Licensed under the CloudForge Non-Commercial License.
 * Commercial use requires written permission — see LICENSE file.
 */
const express = require('express');
const path = require('path');
const morgan = require('morgan');
const { applySecurityMiddleware } = require('./middleware/security');
const apiRouter = require('./routes/api');
const store = require('./data/store');
const { BUILD_SIGNATURE } = require('./signature');
const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Initialize database ----------
store.initDB();

// ---------- Middleware ----------
applySecurityMiddleware(app);
app.use(morgan('combined')); // HTTP request logging
app.use(express.json({ limit: '1mb' })); // Parse JSON bodies, cap at 1MB

// ---------- API Routes ----------
app.use('/api', apiRouter);

// ---------- Serve Frontend (static files) ----------
const frontendPath = path.join(__dirname, '..', '..', 'frontend');
app.use(express.static(frontendPath));

// Catch-all: serve index.html for any non-API route (SPA-style)
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// ---------- Error handler ----------
app.use((err, req, res, _next) => {
  console.error('[CloudForge Error]', err.stack);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// ---------- Start server ----------
if (process.env.NODE_ENV !== 'test') {
  // Verify Build Signature
  const expectedHash = '01a91b801ce25ccd475085060a1b6463cfda6d7d5d6bf262b618023bfcd1013e';
  if (!BUILD_SIGNATURE || BUILD_SIGNATURE !== expectedHash) {
    console.warn('\n⚠️  WARNING: Invalid or missing build signature. Authorship verification failed.');
  }

  app.listen(PORT, () => {
    console.log(`\n  ⚡ CloudForge API running at http://localhost:${PORT}`);
    console.log(`  📊 Dashboard at http://localhost:${PORT}`);
    console.log(`  💚 Health check at http://localhost:${PORT}/api/health\n`);
  });
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down gracefully...');
  store.closeDB();
  process.exit(0);
});

module.exports = app; // Export for testing
