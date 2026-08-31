/*
 * CloudForge — © 2026 Shashank Gowda NB (github.com/MASTER870-CMD)
 * Licensed under the CloudForge Non-Commercial License.
 * Commercial use requires written permission — see LICENSE file.
 */
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

const DATABASE_URL = process.env.DATABASE_URL;

let pool;

/**
 * Initialize the PostgreSQL database and create tables if they don't exist.
 */
async function initDB() {
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required.');
  }

  pool = new Pool({
    connectionString: DATABASE_URL,
    // Add SSL if needed for production/render connections
    ssl: DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  const createTablesQuery = `
    CREATE TABLE IF NOT EXISTS builds (
      id UUID PRIMARY KEY,
      commit_sha VARCHAR(255) NOT NULL,
      branch VARCHAR(255) DEFAULT 'main',
      status VARCHAR(50) NOT NULL CHECK(status IN ('pending', 'running', 'passed', 'failed')),
      duration_ms INTEGER DEFAULT 0,
      triggered_by VARCHAR(50) DEFAULT 'push',
      error_message TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS deployments (
      id UUID PRIMARY KEY,
      build_id UUID REFERENCES builds(id) ON DELETE CASCADE,
      environment VARCHAR(50) NOT NULL CHECK(environment IN ('local', 'minikube', 'render', 'production')),
      version VARCHAR(255) NOT NULL,
      status VARCHAR(50) NOT NULL CHECK(status IN ('pending', 'deploying', 'deployed', 'failed', 'rolled_back')),
      url TEXT,
      duration_ms INTEGER DEFAULT 0,
      error_message TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS logs (
      id UUID PRIMARY KEY,
      ref_id UUID NOT NULL,
      ref_type VARCHAR(50) NOT NULL CHECK(ref_type IN ('build', 'deployment')),
      content TEXT NOT NULL,
      level VARCHAR(50) DEFAULT 'info' CHECK(level IN ('info', 'warn', 'error', 'debug')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS summaries (
      id UUID PRIMARY KEY,
      ref_id UUID NOT NULL,
      ref_type VARCHAR(50) NOT NULL CHECK(ref_type IN ('build', 'deployment')),
      summary TEXT NOT NULL,
      model VARCHAR(100) DEFAULT 'gemini',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await pool.query(createTablesQuery);
  return pool;
}

// ---------- CRUD Operations ----------

async function getAllBuilds(limit = 20) {
  const result = await pool.query('SELECT * FROM builds ORDER BY created_at DESC LIMIT $1', [limit]);
  return result.rows;
}

async function getBuildById(id) {
  const result = await pool.query('SELECT * FROM builds WHERE id = $1', [id]);
  return result.rows[0];
}

async function getBuildByCommitSha(sha) {
  const result = await pool.query('SELECT * FROM builds WHERE commit_sha = $1 ORDER BY created_at DESC LIMIT 1', [sha]);
  return result.rows[0];
}

async function createBuild(data) {
  const id = uuidv4();
  await pool.query(`
    INSERT INTO builds (id, commit_sha, branch, status, duration_ms, triggered_by)
    VALUES ($1, $2, $3, $4, $5, $6)
  `, [
    id, 
    data.commit_sha, 
    data.branch || 'main', 
    data.status || 'pending', 
    data.duration_ms || 0, 
    data.triggered_by || 'push'
  ]);
  return getBuildById(id);
}

async function updateBuild(id, data) {
  const fields = [];
  const values = [];
  let idx = 1;
  for (const [key, value] of Object.entries(data)) {
    if (['status', 'duration_ms', 'error_message'].includes(key)) {
      fields.push(`${key} = $${idx++}`);
      values.push(value);
    }
  }
  
  if (fields.length === 0) return getBuildById(id);

  fields.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(id);
  await pool.query(`UPDATE builds SET ${fields.join(', ')} WHERE id = $${idx}`, values);
  return getBuildById(id);
}

async function getAllDeployments(limit = 20) {
  const result = await pool.query(`
    SELECT d.*, b.commit_sha, b.branch
    FROM deployments d
    LEFT JOIN builds b ON d.build_id = b.id
    ORDER BY d.created_at DESC LIMIT $1
  `, [limit]);
  return result.rows;
}

async function getDeploymentById(id) {
  const result = await pool.query(`
    SELECT d.*, b.commit_sha, b.branch
    FROM deployments d
    LEFT JOIN builds b ON d.build_id = b.id
    WHERE d.id = $1
  `, [id]);
  return result.rows[0];
}

async function createDeployment(data) {
  const id = uuidv4();
  await pool.query(`
    INSERT INTO deployments (id, build_id, environment, version, status, url, duration_ms)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [
    id, 
    data.build_id, 
    data.environment || 'local', 
    data.version, 
    data.status || 'pending', 
    data.url || null, 
    data.duration_ms || 0
  ]);
  return getDeploymentById(id);
}

async function updateDeployment(id, data) {
  const fields = [];
  const values = [];
  let idx = 1;
  for (const [key, value] of Object.entries(data)) {
    if (['status', 'url', 'duration_ms', 'error_message'].includes(key)) {
      fields.push(`${key} = $${idx++}`);
      values.push(value);
    }
  }

  if (fields.length === 0) return getDeploymentById(id);

  fields.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(id);
  await pool.query(`UPDATE deployments SET ${fields.join(', ')} WHERE id = $${idx}`, values);
  return getDeploymentById(id);
}

async function getLogsByRef(refId, refType) {
  const result = await pool.query('SELECT * FROM logs WHERE ref_id = $1 AND ref_type = $2 ORDER BY created_at ASC', [refId, refType]);
  return result.rows;
}

async function createLog(data) {
  const id = uuidv4();
  await pool.query(`
    INSERT INTO logs (id, ref_id, ref_type, content, level)
    VALUES ($1, $2, $3, $4, $5)
  `, [
    id, 
    data.ref_id, 
    data.ref_type, 
    data.content, 
    data.level || 'info'
  ]);
  const result = await pool.query('SELECT * FROM logs WHERE id = $1', [id]);
  return result.rows[0];
}

async function getSummaryByRef(refId, refType) {
  const result = await pool.query('SELECT * FROM summaries WHERE ref_id = $1 AND ref_type = $2 ORDER BY created_at DESC LIMIT 1', [refId, refType]);
  return result.rows[0];
}

async function createSummary(data) {
  const id = uuidv4();
  await pool.query(`
    INSERT INTO summaries (id, ref_id, ref_type, summary, model)
    VALUES ($1, $2, $3, $4, $5)
  `, [
    id, 
    data.ref_id, 
    data.ref_type, 
    data.summary, 
    data.model || 'gemini'
  ]);
  const result = await pool.query('SELECT * FROM summaries WHERE id = $1', [id]);
  return result.rows[0];
}

async function getStats() {
  const totalBuildsResult = await pool.query('SELECT COUNT(*) as count FROM builds');
  const passedBuildsResult = await pool.query("SELECT COUNT(*) as count FROM builds WHERE status = 'passed'");
  const failedBuildsResult = await pool.query("SELECT COUNT(*) as count FROM builds WHERE status = 'failed'");
  
  const totalDeploymentsResult = await pool.query('SELECT COUNT(*) as count FROM deployments');
  const successfulDeploysResult = await pool.query("SELECT COUNT(*) as count FROM deployments WHERE status = 'deployed'");
  
  const avgBuildTimeResult = await pool.query("SELECT AVG(duration_ms) as avg FROM builds WHERE status = 'passed'");
  
  const lastBuildResult = await pool.query('SELECT * FROM builds ORDER BY created_at DESC LIMIT 1');
  const lastDeploymentResult = await pool.query(`
    SELECT d.*, b.commit_sha FROM deployments d
    LEFT JOIN builds b ON d.build_id = b.id
    ORDER BY d.created_at DESC LIMIT 1
  `);

  const totalBuilds = parseInt(totalBuildsResult.rows[0].count, 10);
  const passedBuilds = parseInt(passedBuildsResult.rows[0].count, 10);
  const failedBuilds = parseInt(failedBuildsResult.rows[0].count, 10);
  
  const totalDeployments = parseInt(totalDeploymentsResult.rows[0].count, 10);
  const successfulDeploys = parseInt(successfulDeploysResult.rows[0].count, 10);
  
  const avgBuildTime = parseFloat(avgBuildTimeResult.rows[0].avg) || 0;

  return {
    totalBuilds,
    passedBuilds,
    failedBuilds,
    successRate: totalBuilds > 0 ? Math.round((passedBuilds / totalBuilds) * 100) : 0,
    totalDeployments,
    successfulDeploys,
    avgBuildTime: Math.round(avgBuildTime),
    lastBuild: lastBuildResult.rows[0] || null,
    lastDeployment: lastDeploymentResult.rows[0] || null,
  };
}

async function closeDB() {
  if (pool) await pool.end();
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
