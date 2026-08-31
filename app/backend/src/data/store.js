/*
 * CloudForge — © 2026 Shashank Gowda NB (github.com/MASTER870-CMD)
 * Licensed under the CloudForge Non-Commercial License.
 * Commercial use requires written permission — see LICENSE file.
 */
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

  return db;
}

// ---------- CRUD Operations ----------

function getAllBuilds(limit = 20) {
  return db.prepare('SELECT * FROM builds ORDER BY created_at DESC LIMIT ?').all(limit);
}

function getBuildById(id) {
  return db.prepare('SELECT * FROM builds WHERE id = ?').get(id);
}

function getBuildByCommitSha(sha) {
  return db.prepare('SELECT * FROM builds WHERE commit_sha = ? ORDER BY created_at DESC LIMIT 1').get(sha);
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
  getBuildByCommitSha,
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
