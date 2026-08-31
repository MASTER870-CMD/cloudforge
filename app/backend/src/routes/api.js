/*
 * CloudForge — © 2026 Shashank Gowda NB (github.com/MASTER870-CMD)
 * Licensed under the CloudForge Non-Commercial License.
 * Commercial use requires written permission — see LICENSE file.
 */
const express = require('express');
const { body, param, validationResult } = require('express-validator');
const store = require('../data/store');
const { BUILD_SIGNATURE } = require('../signature');
const { webhookAuth } = require('../middleware/webhook-auth');

const router = express.Router();

// Apply webhook auth — protects POST/PATCH/DELETE, allows GET
router.use(webhookAuth);

// ---------- Validation helper ----------

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() });
  }
  next();
}

// ---------- Health ----------

/**
 * GET /api/health
 * Used by Kubernetes liveness/readiness probes.
 * Returns 200 if the server is running and DB is accessible.
 */
router.get('/health', (req, res) => {
  try {
    const stats = store.getStats();
    res.json({
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      version: process.env.APP_VERSION || '1.0.0',
      build_signature: BUILD_SIGNATURE,
      db: { totalBuilds: stats.totalBuilds },
    });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', error: err.message });
  }
});

// ---------- Stats ----------

/**
 * GET /api/stats
 * Returns aggregate dashboard statistics.
 */
router.get('/stats', (req, res) => {
  try {
    const stats = store.getStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Builds ----------

/**
 * GET /api/builds
 * Returns all builds, most recent first.
 * Supports optional ?commit_sha=xxx to find a build by commit.
 */
router.get('/builds', (req, res) => {
  try {
    if (req.query.commit_sha) {
      const build = store.getBuildByCommitSha(req.query.commit_sha);
      if (!build) return res.status(404).json({ error: 'Build not found' });
      return res.json(build);
    }
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const builds = store.getAllBuilds(limit);
    res.json(builds);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/builds/:id
 * Returns a single build by ID.
 */
router.get('/builds/:id', param('id').isUUID(), validate, (req, res) => {
  try {
    const build = store.getBuildById(req.params.id);
    if (!build) return res.status(404).json({ error: 'Build not found' });
    res.json(build);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/builds
 * Create a new build record (called by GitHub Actions webhook).
 */
router.post(
  '/builds',
  [
    body('commit_sha').isString().isLength({ min: 5, max: 40 }),
    body('branch').optional().isString(),
    body('status').optional().isIn(['pending', 'running', 'passed', 'failed']),
    body('triggered_by').optional().isIn(['push', 'pull_request', 'manual']),
  ],
  validate,
  (req, res) => {
    try {
      const build = store.createBuild(req.body);
      res.status(201).json(build);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * PATCH /api/builds/:id
 * Update a build's status (e.g., pending → passed).
 */
router.patch(
  '/builds/:id',
  [
    param('id').isUUID(),
    body('status').optional().isIn(['pending', 'running', 'passed', 'failed']),
    body('duration_ms').optional().isInt({ min: 0 }),
    body('error_message').optional().isString(),
  ],
  validate,
  (req, res) => {
    try {
      const build = store.updateBuild(req.params.id, req.body);
      if (!build) return res.status(404).json({ error: 'Build not found' });
      res.json(build);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ---------- Deployments ----------

/**
 * GET /api/deployments
 * Returns all deployments, most recent first.
 */
router.get('/deployments', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const deployments = store.getAllDeployments(limit);
    res.json(deployments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/deployments/:id
 * Returns a single deployment by ID.
 */
router.get('/deployments/:id', param('id').isUUID(), validate, (req, res) => {
  try {
    const deployment = store.getDeploymentById(req.params.id);
    if (!deployment) return res.status(404).json({ error: 'Deployment not found' });
    res.json(deployment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/deployments
 * Create a new deployment record.
 */
router.post(
  '/deployments',
  [
    body('build_id').isUUID(),
    body('environment').isIn(['local', 'minikube', 'render', 'production']),
    body('version').isString().isLength({ min: 1, max: 50 }),
    body('status').optional().isIn(['pending', 'deploying', 'deployed', 'failed', 'rolled_back']),
    body('url').optional().isURL(),
  ],
  validate,
  (req, res) => {
    try {
      const deployment = store.createDeployment(req.body);
      res.status(201).json(deployment);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * PATCH /api/deployments/:id
 * Update deployment status.
 */
router.patch(
  '/deployments/:id',
  [
    param('id').isUUID(),
    body('status').optional().isIn(['pending', 'deploying', 'deployed', 'failed', 'rolled_back']),
    body('duration_ms').optional().isInt({ min: 0 }),
    body('error_message').optional().isString(),
  ],
  validate,
  (req, res) => {
    try {
      const deployment = store.updateDeployment(req.params.id, req.body);
      if (!deployment) return res.status(404).json({ error: 'Deployment not found' });
      res.json(deployment);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ---------- Logs ----------

/**
 * GET /api/logs/:refType/:refId
 * Returns logs for a specific build or deployment.
 */
router.get(
  '/logs/:refType/:refId',
  [
    param('refType').isIn(['build', 'deployment']),
    param('refId').isUUID(),
  ],
  validate,
  (req, res) => {
    try {
      const logs = store.getLogsByRef(req.params.refId, req.params.refType);
      res.json(logs);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * POST /api/logs
 * Append a log entry.
 */
router.post(
  '/logs',
  [
    body('ref_id').isUUID(),
    body('ref_type').isIn(['build', 'deployment']),
    body('content').isString().isLength({ min: 1, max: 10000 }),
    body('level').optional().isIn(['info', 'warn', 'error', 'debug']),
  ],
  validate,
  (req, res) => {
    try {
      const log = store.createLog(req.body);
      res.status(201).json(log);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ---------- Summaries ----------

/**
 * GET /api/summaries/:refType/:refId
 * Get AI summary for a build/deployment.
 */
router.get(
  '/summaries/:refType/:refId',
  [
    param('refType').isIn(['build', 'deployment']),
    param('refId').isUUID(),
  ],
  validate,
  (req, res) => {
    try {
      const summary = store.getSummaryByRef(req.params.refId, req.params.refType);
      if (!summary) return res.status(404).json({ error: 'No summary found' });
      res.json(summary);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * POST /api/summaries/generate
 * Automatically fetch logs and generate a Gemini AI summary.
 */
router.post(
  '/summaries/generate',
  [
    body('ref_id').isUUID(),
    body('ref_type').isIn(['build', 'deployment']),
  ],
  webhookAuth,
  validate,
  async (req, res) => {
    try {
      const { ref_id, ref_type } = req.body;
      
      // Fetch logs
      const logs = store.getLogsByRef(ref_id, ref_type);
      if (!logs || logs.length === 0) {
        return res.status(400).json({ error: 'No logs found for this reference.' });
      }

      // Format logs
      const logText = logs.map(l => l.content).join('\n');
      
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(400).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
      }

      const prompt = `Analyze these ${ref_type} logs and provide a brief, easy-to-read summary.
Focus on:
1. Status (Success/Failure)
2. Key events or actions taken
3. Any errors, warnings, or anomalies

Logs:
${logText}

Keep the summary concise and format it with clear markdown headings.`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${errBody}`);
      }

      const data = await response.json();
      const summaryText = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!summaryText) {
        throw new Error('Failed to extract summary from Gemini response');
      }

      // Save summary
      const summary = store.createSummary({
        ref_id,
        ref_type,
        summary: summaryText,
        model: 'gemini-3.6-flash'
      });

      res.status(201).json(summary);
    } catch (err) {
      console.error('[Generate Summary Error]', err);
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * POST /api/summaries
 * Save a generated AI summary.
 */
router.post(
  '/summaries',
  [
    body('ref_id').isUUID(),
    body('ref_type').isIn(['build', 'deployment']),
    body('summary').isString().isLength({ min: 1 }),
    body('model').optional().isString(),
  ],
  validate,
  (req, res) => {
    try {
      const summary = store.createSummary(req.body);
      res.status(201).json(summary);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;
