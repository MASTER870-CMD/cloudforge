/*
 * CloudForge — © 2026 Shashank Gowda NB (github.com/MASTER870-CMD)
 * Licensed under the CloudForge Non-Commercial License.
 * Commercial use requires written permission — see LICENSE file.
 */

/**
 * Webhook Authentication Middleware
 * 
 * Protects mutating API endpoints (POST, PATCH, DELETE) with a shared secret.
 * GitHub Actions sends this secret via the x-cloudforge-secret header.
 * GET requests pass through without authentication (dashboard reads are public).
 * 
 * If CLOUDFORGE_API_SECRET is not configured (local dev), all requests pass through.
 */
function webhookAuth(req, res, next) {
  // Allow all GET requests (public read access for the dashboard)
  if (req.method === 'GET') {
    return next();
  }

  const secret = process.env.CLOUDFORGE_API_SECRET;

  // If no secret is configured (local dev), allow all requests
  if (!secret) {
    return next();
  }

  const provided = req.headers['x-cloudforge-secret'];

  if (!provided || provided !== secret) {
    return res.status(401).json({
      error: 'Unauthorized — invalid or missing x-cloudforge-secret header',
    });
  }

  next();
}

module.exports = { webhookAuth };
