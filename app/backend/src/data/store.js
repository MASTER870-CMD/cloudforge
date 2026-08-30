const Database = require('better-sqlite3');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'cloudforge.db');

let db;

/**
 * Initialize the SQLite database and create tables if they don't exist.
 * Uses WAL mode for better concurrent read performance.
 */
function initDB() {
  const dir = path.dirname(DB_PATH);
  const fs = require('fs');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS builds (
      id TEXT PRIMARY KEY,
      commit_sha TEXT NOT NULL,
      branch TEXT DEFAULT 'main',
      status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'passed', 'failed')),
      duration_ms INTEGER DEFAULT 0,
      triggered_by TEXT DEFAULT 'push',
      error_message TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS deployments (
      id TEXT PRIMARY KEY,
      build_id TEXT REFERENCES builds(id),
      environment TEXT NOT NULL CHECK(environment IN ('local', 'minikube', 'render', 'production')),
      version TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending', 'deploying', 'deployed', 'failed', 'rolled_back')),
      url TEXT,
      duration_ms INTEGER DEFAULT 0,
      error_message TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS logs (
      id TEXT PRIMARY KEY,
      ref_id TEXT NOT NULL,
      ref_type TEXT NOT NULL CHECK(ref_type IN ('build', 'deployment')),
      content TEXT NOT NULL,
      level TEXT DEFAULT 'info' CHECK(level IN ('info', 'warn', 'error', 'debug')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS summaries (
      id TEXT PRIMARY KEY,
      ref_id TEXT NOT NULL,
      ref_type TEXT NOT NULL CHECK(ref_type IN ('build', 'deployment')),
      summary TEXT NOT NULL,
      model TEXT DEFAULT 'gemini',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Seed some sample data if the builds table is empty
  const count = db.prepare('SELECT COUNT(*) as count FROM builds').get();
  if (count.count === 0) {
    seedData();
  }

  return db;
}

/**
 * Seed initial sample data so the dashboard isn't empty on first load.
 */
function seedData() {
  const builds = [
    { id: uuidv4(), commit_sha: 'a1b2c3d', branch: 'main', status: 'passed', duration_ms: 8230, triggered_by: 'push', created_at: '2026-08-30 10:00:00' },
    { id: uuidv4(), commit_sha: 'e4f5g6h', branch: 'main', status: 'passed', duration_ms: 7450, triggered_by: 'push', created_at: '2026-08-30 11:30:00' },
    { id: uuidv4(), commit_sha: 'i7j8k9l', branch: 'feature/dashboard', status: 'failed', duration_ms: 3200, triggered_by: 'pull_request', error_message: 'Test suite failed: 2 assertions', created_at: '2026-08-30 13:00:00' },
    { id: uuidv4(), commit_sha: 'm0n1o2p', branch: 'main', status: 'passed', duration_ms: 9100, triggered_by: 'push', created_at: '2026-08-30 14:15:00' },
    { id: uuidv4(), commit_sha: 'q3r4s5t', branch: 'main', status: 'passed', duration_ms: 6800, triggered_by: 'push', created_at: '2026-08-30 15:45:00' },
  ];

  const insertBuild = db.prepare(`
    INSERT INTO builds (id, commit_sha, branch, status, duration_ms, triggered_by, created_at, updated_at)
    VALUES (@id, @commit_sha, @branch, @status, @duration_ms, @triggered_by, @created_at, @created_at)
  `);

  const insertDeployment = db.prepare(`
    INSERT INTO deployments (id, build_id, environment, version, status, url, duration_ms, created_at, updated_at)
    VALUES (@id, @build_id, @environment, @version, @status, @url, @duration_ms, @created_at, @created_at)
  `);

  const insertLog = db.prepare(`
    INSERT INTO logs (id, ref_id, ref_type, content, level, created_at)
    VALUES (@id, @ref_id, @ref_type, @content, @level, @created_at)
  `);

  const transaction = db.transaction(() => {
    for (const build of builds) {
      insertBuild.run(build);

      // Create a deployment for passed builds
      if (build.status === 'passed') {
        const deployId = uuidv4();
        insertDeployment.run({
          id: deployId,
          build_id: build.id,
          environment: 'local',
          version: `1.0.${builds.indexOf(build)}`,
          status: 'deployed',
          url: 'http://localhost:3000',
          duration_ms: Math.floor(Math.random() * 5000) + 2000,
          created_at: build.created_at,
        });

        // Add deployment log
        insertLog.run({
          id: uuidv4(),
          ref_id: deployId,
          ref_type: 'deployment',
          content: `Deployment v1.0.${builds.indexOf(build)} completed successfully.\nImage pulled in 1.2s\nHealth check passed on /api/health\nAll 2 replicas running.`,
          level: 'info',
          created_at: build.created_at,
        });
      }

      // Add build log
      insertLog.run({
        id: uuidv4(),
        ref_id: build.id,
        ref_type: 'build',
        content: build.status === 'passed'
          ? `Build ${build.commit_sha} started.\nnpm install completed (${Math.floor(build.duration_ms / 2)}ms)\nAll tests passed (12/12).\nDocker image built: cloudforge:${build.commit_sha}\nImage pushed to registry.`
          : `Build ${build.commit_sha} started.\nnpm install completed.\nTest suite FAILED:\n  ✗ GET /api/health should return 200\n  ✗ GET /api/builds should return array\n${build.error_message}`,
        level: build.status === 'passed' ? 'info' : 'error',
        created_at: build.created_at,
      });
    }
  });

  transaction();
}

// ---------- CRUD Operations ----------

function getAllBuilds(limit = 20) {
  return db.prepare('SELECT * FROM builds ORDER BY created_at DESC LIMIT ?').all(limit);
}

function getBuildById(id) {
  return db.prepare('SELECT * FROM builds WHERE id = ?').get(id);
}

function createBuild(data) {
  const id = uuidv4();
  const stmt = db.prepare(`
    INSERT INTO builds (id, commit_sha, branch, status, duration_ms, triggered_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, data.commit_sha, data.branch || 'main', data.status || 'pending', data.duration_ms || 0, data.triggered_by || 'push');
  return getBuildById(id);
}

function updateBuild(id, data) {
  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(data)) {
    if (['status', 'duration_ms', 'error_message'].includes(key)) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }
  fields.push("updated_at = datetime('now')");
  values.push(id);
  db.prepare(`UPDATE builds SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getBuildById(id);
}

function getAllDeployments(limit = 20) {
  return db.prepare(`
    SELECT d.*, b.commit_sha, b.branch
    FROM deployments d
    LEFT JOIN builds b ON d.build_id = b.id
    ORDER BY d.created_at DESC LIMIT ?
  `).all(limit);
}

function getDeploymentById(id) {
  return db.prepare(`
    SELECT d.*, b.commit_sha, b.branch
    FROM deployments d
    LEFT JOIN builds b ON d.build_id = b.id
    WHERE d.id = ?
  `).get(id);
}

function createDeployment(data) {
  const id = uuidv4();
  const stmt = db.prepare(`
    INSERT INTO deployments (id, build_id, environment, version, status, url, duration_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, data.build_id, data.environment || 'local', data.version, data.status || 'pending', data.url || null, data.duration_ms || 0);
  return getDeploymentById(id);
}

function updateDeployment(id, data) {
  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(data)) {
    if (['status', 'url', 'duration_ms', 'error_message'].includes(key)) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }
  fields.push("updated_at = datetime('now')");
  values.push(id);
  db.prepare(`UPDATE deployments SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getDeploymentById(id);
}

function getLogsByRef(refId, refType) {
  return db.prepare('SELECT * FROM logs WHERE ref_id = ? AND ref_type = ? ORDER BY created_at ASC').all(refId, refType);
}

function createLog(data) {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO logs (id, ref_id, ref_type, content, level)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, data.ref_id, data.ref_type, data.content, data.level || 'info');
  return db.prepare('SELECT * FROM logs WHERE id = ?').get(id);
}

function getSummaryByRef(refId, refType) {
  return db.prepare('SELECT * FROM summaries WHERE ref_id = ? AND ref_type = ? ORDER BY created_at DESC LIMIT 1').get(refId, refType);
}

function createSummary(data) {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO summaries (id, ref_id, ref_type, summary, model)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, data.ref_id, data.ref_type, data.summary, data.model || 'gemini');
  return db.prepare('SELECT * FROM summaries WHERE id = ?').get(id);
}

function getStats() {
  const totalBuilds = db.prepare('SELECT COUNT(*) as count FROM builds').get().count;
  const passedBuilds = db.prepare("SELECT COUNT(*) as count FROM builds WHERE status = 'passed'").get().count;
  const failedBuilds = db.prepare("SELECT COUNT(*) as count FROM builds WHERE status = 'failed'").get().count;
  const totalDeployments = db.prepare('SELECT COUNT(*) as count FROM deployments').get().count;
  const successfulDeploys = db.prepare("SELECT COUNT(*) as count FROM deployments WHERE status = 'deployed'").get().count;
  const avgBuildTime = db.prepare("SELECT AVG(duration_ms) as avg FROM builds WHERE status = 'passed'").get().avg || 0;
  const lastBuild = db.prepare('SELECT * FROM builds ORDER BY created_at DESC LIMIT 1').get();
  const lastDeployment = db.prepare(`
    SELECT d.*, b.commit_sha FROM deployments d
    LEFT JOIN builds b ON d.build_id = b.id
    ORDER BY d.created_at DESC LIMIT 1
  `).get();

  return {
    totalBuilds,
    passedBuilds,
    failedBuilds,
    successRate: totalBuilds > 0 ? Math.round((passedBuilds / totalBuilds) * 100) : 0,
    totalDeployments,
    successfulDeploys,
    avgBuildTime: Math.round(avgBuildTime),
    lastBuild,
    lastDeployment,
  };
}

function closeDB() {
  if (db) db.close();
}

module.exports = {
  initDB,
  closeDB,
  getAllBuilds,
  getBuildById,
  createBuild,
  updateBuild,
  getAllDeployments,
  getDeploymentById,
  createDeployment,
  updateDeployment,
  getLogsByRef,
  createLog,
  getSummaryByRef,
  createSummary,
  getStats,
};
