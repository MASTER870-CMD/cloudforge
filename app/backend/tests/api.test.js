const request = require('supertest');
const app = require('../src/server');

describe('CloudForge API', () => {
  // ---------- Health ----------
  describe('GET /api/health', () => {
    it('should return healthy status', async () => {
      const res = await request(app).get('/api/health');
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(res.body).toHaveProperty('uptime');
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body).toHaveProperty('version');
    });
  });

  // ---------- Stats ----------
  describe('GET /api/stats', () => {
    it('should return dashboard statistics', async () => {
      const res = await request(app).get('/api/stats');
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('totalBuilds');
      expect(res.body).toHaveProperty('passedBuilds');
      expect(res.body).toHaveProperty('failedBuilds');
      expect(res.body).toHaveProperty('successRate');
      expect(res.body).toHaveProperty('totalDeployments');
    });
  });

  // ---------- Builds ----------
  describe('GET /api/builds', () => {
    it('should return an array of builds', async () => {
      const res = await request(app).get('/api/builds');
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should respect limit parameter', async () => {
      const res = await request(app).get('/api/builds?limit=2');
      expect(res.statusCode).toBe(200);
      expect(res.body.length).toBeLessThanOrEqual(2);
    });
  });

  describe('POST /api/builds', () => {
    it('should create a new build', async () => {
      const res = await request(app)
        .post('/api/builds')
        .send({ commit_sha: 'abc1234def', branch: 'main', status: 'pending' });
      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.commit_sha).toBe('abc1234def');
      expect(res.body.status).toBe('pending');
    });

    it('should reject invalid commit_sha', async () => {
      const res = await request(app)
        .post('/api/builds')
        .send({ commit_sha: 'ab' }); // too short
      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('error', 'Validation failed');
    });
  });

  // ---------- Deployments ----------
  describe('GET /api/deployments', () => {
    it('should return an array of deployments', async () => {
      const res = await request(app).get('/api/deployments');
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ---------- Logs ----------
  describe('GET /api/logs/:refType/:refId', () => {
    it('should return 400 for invalid refType', async () => {
      const res = await request(app).get('/api/logs/invalid/some-id');
      expect(res.statusCode).toBe(400);
    });
  });

  // ---------- Frontend ----------
  describe('GET /', () => {
    it('should serve the frontend dashboard', async () => {
      const res = await request(app).get('/');
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toMatch(/html/);
    });
  });

  // ---------- 404 for unknown API routes ----------
  describe('GET /api/unknown', () => {
    it('should return the frontend for unknown routes', async () => {
      const res = await request(app).get('/api/unknown');
      expect(res.statusCode).toBe(200); // SPA catch-all
    });
  });
});
